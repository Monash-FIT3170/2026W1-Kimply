// Server-side ability helpers: dealing drafts, resolving them, and playing cards.
// The Meteor methods that call these live in abilities.js.
import { Meteor } from 'meteor/meteor';
import { Random } from 'meteor/random';
import { RoundsCollection } from './rounds';
import { PlayersCollection } from './players';
import { GameEventsCollection } from './gameEvents';
import { RoomsCollection } from './rooms';
import { ABILITIES, dealCards, isShielded, playableHand } from './abilityRules';
import {
  advanceRoundIfReady,
  armRoundTimer,
  assertRoundOpen,
  checkWinner,
  clearRound,
  generateSequence,
  loseLife,
  moveToLevel,
  roundDeadline,
  sequenceFor,
  sequenceState,
} from './gameEngine';
import { DEFAULT_STARTING_LIVES, DRAFT_SECONDS } from '../constants';

const DRAFT_MS = DRAFT_SECONDS * 1000;
// A pick that left the browser just before the draft closed still counts.
const PICK_GRACE_MS = 1500;

export async function gameContext(gameId) {
  const room = await RoomsCollection.findOneAsync({ pin: gameId });
  return {
    // Explicit opt-in: rooms created before abilities existed play without them.
    abilitiesEnabled: room?.abilitiesEnabled === true,
    isBattleRoyale: room?.gameMode === 'battle_royale',
    startingLives: room?.customSettings?.startingLives ?? DEFAULT_STARTING_LIVES,
  };
}

// The draft a new standard round opens with, or null when it has none. Round 1 never
// has one, because everyone starts level.
export function newRoundDraft(context, roundNumber, now = Date.now()) {
  if (!context.abilitiesEnabled || context.isBattleRoyale || roundNumber < 2) return null;
  return { endsAt: new Date(now + DRAFT_MS), resolved: false };
}

async function dealDraft(player, roundId, context, endsAt) {
  const offered = dealCards(context);
  await PlayersCollection.updateAsync(player._id, {
    $set: { 'secret.draft': { roundId, offered, endsAt, status: 'open', pick: null } },
  });
}

// Standard modes: deal every active player in the round a draft, and close it on a
// server timer. Clients also ask for it to close (closeDraft) in case the server
// restarted and lost the timer.
export async function dealRoundDrafts(roundId) {
  const round = await RoundsCollection.findOneAsync(roundId);
  if (!round?.draft || round.draft.resolved) return;

  const context = await gameContext(round.gameId);
  const players = await PlayersCollection.find({ roundId, eliminated: false }).fetchAsync();
  for (const player of players) {
    await dealDraft(player, roundId, context, round.draft.endsAt);
  }

  const delay = Math.max(0, round.draft.endsAt.getTime() - Date.now());
  Meteor.setTimeout(() => {
    resolveRoundDraft(roundId).catch((error) => console.error('Could not resolve the ability draft', error));
  }, delay);
}

// Battle Royale: each player drafts on their own level-up.
export async function dealLevelUpDraft(playerId) {
  const player = await PlayersCollection.findOneAsync(playerId);
  if (!player || player.eliminated || player.gameFinished) return;
  const context = await gameContext(player.gameId);
  if (!context.abilitiesEnabled || !context.isBattleRoyale) return;
  await dealDraft(player, player.roundId, context, new Date(Date.now() + DRAFT_MS));
}

async function recordAbilityEvent(actor, ability, outcome, target = null, extra = {}) {
  // The round it happened in, so the live feed can show when someone came for you.
  const round = await RoundsCollection.findOneAsync(actor.roundId, { fields: { roundNumber: 1, level: 1 } });
  await GameEventsCollection.insertAsync({
    gameId: actor.gameId,
    type: 'ability',
    ability,
    outcome,
    playerId: actor._id,
    playerName: actor.name,
    targetId: target?._id ?? null,
    targetName: target?.name ?? null,
    round: round ? (round.roundNumber ?? round.level - 3) : null,
    createdAt: new Date(),
    ...extra,
  });
}

// Slo-Mo, 2x Speed or Lights Out. A target carries at most one of each kind (speed,
// lights) per round, so the first to land wins and a second one misses. The guard is
// in the update filter, so two Battle Royale picks racing for one target can not both land.
async function applyPlayback(actor, type, target, { pending }) {
  const { kind, value } = ABILITIES[type].playback;
  const field = `secret.playback.${kind}`;
  const roundId = pending ? null : target.roundId;
  const free = pending
    ? { $or: [{ [field]: { $exists: false } }, { [`${field}.roundId`]: { $ne: null } }] }
    : { [`${field}.roundId`]: { $ne: roundId } };
  const effect = { roundId, by: actor._id, ...(value ? { value } : {}) };
  const landed = await PlayersCollection.updateAsync(
    { _id: target._id, eliminated: false, ...free },
    { $set: { [field]: effect } }
  );
  await recordAbilityEvent(actor, type, landed ? 'hit' : 'failed', target, pending ? { pending: true } : {});
}

// A card that lands on another player before the round: Steal, Strike or one of the
// playback cards. Reads the target fresh, so hits that land in the same resolution stack.
// In Battle Royale a playback card is pending: it waits for the target's next level.
async function applyHostile(actor, type, targetId, { pending = false } = {}) {
  const target = await PlayersCollection.findOneAsync(targetId);
  if (!target || target.eliminated || target.gameFinished) {
    await recordAbilityEvent(actor, type, 'failed', target);
    return;
  }
  if (isShielded(target)) {
    await recordAbilityEvent(actor, type, 'blocked', target);
    return;
  }

  if (ABILITIES[type].playback) {
    await applyPlayback(actor, type, target, { pending });
    return;
  }

  if (type === 'steal') {
    // Never takes the last life, so a Steal can not eliminate.
    const taken = await PlayersCollection.updateAsync(
      { _id: target._id, eliminated: false, lives: { $gte: 2 } },
      { $inc: { lives: -1 } }
    );
    if (!taken) {
      await recordAbilityEvent(actor, type, 'failed', target);
      return;
    }
    await PlayersCollection.updateAsync(actor._id, { $inc: { lives: 1 } });
    await recordAbilityEvent(actor, type, 'hit', target);
    return;
  }

  const round = await RoundsCollection.findOneAsync(target.roundId);
  const result = await loseLife(target._id, round);
  await recordAbilityEvent(actor, type, result.eliminated ? 'eliminated' : result.applied ? 'hit' : 'failed', target);
}

// Close a standard round's draft and resolve every Steal and Strike in it at once.
export async function resolveRoundDraft(roundId) {
  // Claim first, so the timer, a client fallback and an early close can race safely.
  // draft.resolved only flips once every effect has landed: clients start the round on
  // it, and must not see the round open while lives and feed rows are still changing.
  const claimed = await RoundsCollection.updateAsync(
    { _id: roundId, 'draft.resolved': false, 'draft.resolving': { $ne: true } },
    { $set: { 'draft.resolving': true } }
  );
  if (!claimed) return false;

  const round = await RoundsCollection.findOneAsync(roundId);
  await PlayersCollection.updateAsync(
    { roundId, 'secret.draft.roundId': roundId, 'secret.draft.status': 'open' },
    { $set: { 'secret.draft.status': 'expired' } },
    { multi: true }
  );

  const pickers = await PlayersCollection.find({
    roundId,
    'secret.draft.roundId': roundId,
    'secret.draft.status': 'picked',
  }).fetchAsync();
  const hostile = pickers
    .map((player) => ({ actor: player, ...player.secret.draft.pick }))
    .filter((pick) => landsBeforeRound(pick.type))
    .sort((a, b) => a.pickedAt - b.pickedAt);

  // Every Steal before any Strike: a Steal is judged on the lives a player went into
  // the round with, and an actor struck out in this same resolution still lands theirs.
  // Playback cards go last, so one aimed at a player struck out here misses.
  const order = (type) => (type === 'steal' ? 0 : type === 'strike' ? 1 : 2);
  for (const pick of [...hostile].sort((a, b) => order(a.type) - order(b.type))) {
    await applyHostile(pick.actor, pick.type, pick.targetId);
  }

  // The round's clock starts with the draft closing, in the same write that clients start
  // the round on, so nobody sees the round open without its deadline.
  const deadlineAt = round.deadlineAt === null ? roundDeadline() : null;
  await RoundsCollection.updateAsync(roundId, {
    $set: { 'draft.resolved': true, 'draft.resolvedAt': new Date(), ...(deadlineAt ? { deadlineAt } : {}) },
    $unset: { 'draft.resolving': '' },
  });
  if (deadlineAt) armRoundTimer(roundId, deadlineAt);

  if (hostile.length) {
    await checkWinner(round.gameId, false);
    await advanceRoundIfReady(await RoundsCollection.findOneAsync(roundId));
  }
  return true;
}

// Cards that land on another player as soon as the draft settles them.
function landsBeforeRound(type) {
  const ability = ABILITIES[type];
  return Boolean(ability) && ability.timing === 'pre' && ability.hostile;
}

async function draftIsSettled(roundId) {
  const open = await PlayersCollection.findOneAsync({
    roundId,
    eliminated: false,
    'secret.draft.roundId': roundId,
    'secret.draft.status': 'open',
  });
  return !open;
}

function assertActive(player) {
  if (!player) throw new Meteor.Error('not-found', 'Player not found');
  if (player.eliminated || player.gameFinished) throw new Meteor.Error('not-playing', 'You are out of this game');
}

async function assertTarget(player, targetId) {
  if (typeof targetId !== 'string' || !targetId) throw new Meteor.Error('invalid-target', 'Choose a player');
  if (targetId === player._id) throw new Meteor.Error('invalid-target', 'You can not target yourself');
  const target = await PlayersCollection.findOneAsync(targetId);
  if (!target || target.gameId !== player.gameId || target.eliminated) {
    throw new Meteor.Error('invalid-target', 'That player is no longer in the game');
  }
  return target;
}

// Settle a draft with a pick or a skip. Returns the updated player.
export async function settleDraft(player, type, targetId) {
  assertActive(player);
  const draft = player.secret?.draft;
  if (draft && draft.roundId === player.roundId && (draft.status === 'picked' || draft.status === 'skipped')) {
    throw new Meteor.Error('already-chosen', 'You have already chosen in this draft');
  }
  if (!draft || draft.status !== 'open' || draft.roundId !== player.roundId) {
    throw new Meteor.Error('draft-closed', 'This draft has closed');
  }
  if (Date.now() > draft.endsAt.getTime() + PICK_GRACE_MS) {
    throw new Meteor.Error('draft-closed', 'This draft has closed');
  }

  const set = { 'secret.draft.status': type ? 'picked' : 'skipped' };
  const modifier = { $set: set };
  if (type) {
    if (!draft.offered.includes(type)) throw new Meteor.Error('invalid-ability', 'That card was not dealt to you');
    const ability = ABILITIES[type];
    if (ability.timing === 'pre' && ability.targeted) await assertTarget(player, targetId);

    set['secret.draft.pick'] = { type, targetId: ability.targeted ? targetId : null, pickedAt: new Date() };
    if (type === 'shield') set['secret.shieldRoundId'] = player.roundId;
    if (ability.timing === 'in') modifier.$push = { 'secret.hand': { id: Random.id(), type, roundId: player.roundId } };
  }

  const settled = await PlayersCollection.updateAsync(
    { _id: player._id, 'secret.draft.status': 'open', 'secret.draft.roundId': draft.roundId },
    modifier
  );
  if (!settled) throw new Meteor.Error('draft-closed', 'This draft has closed');

  const context = await gameContext(player.gameId);
  if (context.isBattleRoyale) {
    // No shared round to wait for: a hostile card lands as soon as it is picked. A
    // playback card waits for the target's next level, since this one is under way.
    if (landsBeforeRound(type)) {
      await applyHostile(player, type, targetId, { pending: true });
      await checkWinner(player.gameId, true);
    }
  } else if (await draftIsSettled(player.roundId)) {
    await resolveRoundDraft(player.roundId);
  }
  return PlayersCollection.findOneAsync(player._id);
}

export async function closeDraft(roundId) {
  const round = await RoundsCollection.findOneAsync(roundId);
  if (!round?.draft || round.draft.resolved) return false;
  if (Date.now() < round.draft.endsAt.getTime() && !(await draftIsSettled(roundId))) return false;
  return resolveRoundDraft(roundId);
}

// Play a card from the hand during a round.
export async function playCard(player, cardId, targetId) {
  assertActive(player);
  const card = playableHand(player).find((c) => c.id === cardId);
  if (!card) throw new Meteor.Error('invalid-ability', 'You do not hold that card');
  if (player.completeRound) throw new Meteor.Error('round-cleared', 'You have already cleared this round');

  const round = await RoundsCollection.findOneAsync(player.roundId);
  if (!round) throw new Meteor.Error('round-not-found', 'Current round does not exist');
  if (round.draft && !round.draft.resolved) throw new Meteor.Error('draft-open', 'Wait for the draft to close');
  await assertRoundOpen(round);

  // Check everything that could refuse the card before spending it.
  let target = null;
  let jumpTarget = null;
  if (card.type === 'scramble') {
    target = await assertTarget(player, targetId);
    if (target.completeRound) throw new Meteor.Error('target-cleared', `${target.name} has already cleared the round`);
  }
  if (card.type === 'jump') {
    if (!player.isBattleRoyale) throw new Meteor.Error('invalid-ability', 'Jump is only played in Battle Royale');
    const others = await PlayersCollection.find({
      gameId: player.gameId,
      _id: { $ne: player._id },
      eliminated: false,
      currentLevel: { $ne: player.currentLevel },
    }).fetchAsync();
    if (!others.length) throw new Meteor.Error('no-jump-target', 'Everyone still playing is on your level');
    jumpTarget = Random.choice(others);
  }

  const spent = await PlayersCollection.updateAsync(
    { _id: player._id, 'secret.hand.id': card.id },
    { $pull: { 'secret.hand': { id: card.id } } }
  );
  if (!spent) throw new Meteor.Error('invalid-ability', 'You do not hold that card');

  if (card.type === 'freePass') {
    await recordAbilityEvent(player, 'freePass', 'used');
    const { nextRoundId } = await clearRound(player, round, { credited: false });
    if (nextRoundId) await dealLevelUpDraft(player._id);
    return { type: card.type };
  }

  if (card.type === 'reroll') {
    const current = player.secret?.sequence;
    const length = sequenceFor(player, round).length;
    await PlayersCollection.updateAsync(player._id, {
      $set: { 'secret.sequence': sequenceState(round._id, generateSequence(length), (current?.version ?? 1) + 1) },
    });
    await recordAbilityEvent(player, 'reroll', 'used');
    return { type: card.type };
  }

  if (card.type === 'scramble') {
    if (isShielded(target)) {
      await recordAbilityEvent(player, 'scramble', 'blocked', target);
      return { type: card.type, outcome: 'blocked' };
    }
    const targetRound = await RoundsCollection.findOneAsync(target.roundId);
    const current = target.secret?.sequence;
    const length = sequenceFor(target, targetRound).length;
    await PlayersCollection.updateAsync(target._id, {
      $set: {
        'secret.sequence': sequenceState(targetRound._id, generateSequence(length), (current?.version ?? 1) + 1),
      },
    });
    await recordAbilityEvent(player, 'scramble', 'hit', target);
    return { type: card.type, outcome: 'hit' };
  }

  // Jump
  await moveToLevel(player._id, player.gameId, jumpTarget.currentLevel);
  await recordAbilityEvent(player, 'jump', 'used', null, {
    fromLevel: (player.currentLevel ?? 4) - 3,
    level: jumpTarget.currentLevel - 3,
  });
  return { type: card.type, level: jumpTarget.currentLevel - 3 };
}
