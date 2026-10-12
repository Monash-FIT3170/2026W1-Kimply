// Pure helpers for the ability UI: card accents, the feed scope, and what each ability
// event says to the person reading it.
import { ABILITIES } from '../../api/abilityRules';

// Hostile cards wear pink, protection teal, self-help amber, and the level-changers violet.
export const ABILITY_ACCENTS = {
  steal: 'pink',
  strike: 'pink',
  scramble: 'violet',
  slowMo: 'violet',
  fastForward: 'violet',
  lightsOut: 'violet',
  shield: 'teal',
  freePass: 'amber',
  reroll: 'amber',
  jump: 'violet',
};

export function abilityTags(type) {
  const ability = ABILITIES[type];
  if (!ability) return [];
  const tags = [];
  if (ability.targeted) tags.push('Pick a player');
  if (ability.timing === 'pre') tags.push(type === 'shield' ? 'This round' : 'Lands before the round');
  else tags.push(ability.kept ? 'Saved until used' : 'Play this round');
  return tags;
}

export const FEED_SCOPES = ['me', 'everyone'];
export const DEFAULT_FEED_SCOPE = 'me';

export function normaliseFeedScope(value) {
  return FEED_SCOPES.includes(value) ? value : DEFAULT_FEED_SCOPE;
}

// Whether an event involves the viewer (as the actor or the target).
export function isInFeed(scope, viewerId, { playerId, targetId } = {}) {
  if (scope === 'everyone') return true;
  return Boolean(viewerId) && (playerId === viewerId || targetId === viewerId);
}

const possessive = (name) => (name.endsWith('s') ? `${name}'` : `${name}'s`);

// One line describing an ability event, written for whoever is reading it.
export function describeAbilityEvent(event, viewerId) {
  const card = ABILITIES[event.ability]?.label ?? 'card';
  const actorIsMe = event.playerId === viewerId;
  const targetIsMe = Boolean(event.targetId) && event.targetId === viewerId;
  const actor = actorIsMe ? 'You' : event.playerName;
  const target = targetIsMe ? 'you' : event.targetName;

  if (event.outcome === 'blocked') {
    if (targetIsMe) return `Your Shield blocked ${possessive(event.playerName)} ${card}.`;
    if (actorIsMe) return `${possessive(event.targetName)} Shield blocked your ${card}.`;
    return `${possessive(event.targetName)} Shield blocked ${possessive(event.playerName)} ${card}.`;
  }

  switch (event.ability) {
    case 'steal':
      if (event.outcome === 'failed') {
        if (actorIsMe) return `${event.targetName} had no life to spare. Your Steal missed.`;
        if (targetIsMe) return `${event.playerName} tried to steal from you and missed.`;
        return `${possessive(event.playerName)} Steal on ${event.targetName} missed.`;
      }
      return `${actor} stole a life from ${target}.`;
    case 'strike':
      if (event.outcome === 'failed') {
        if (actorIsMe) return `${event.targetName ?? 'Your target'} was already out. Your Strike missed.`;
        return `${possessive(event.playerName)} Strike missed.`;
      }
      if (event.outcome === 'eliminated') return `${actor} struck ${target} out of the game.`;
      if (targetIsMe) return `${event.playerName} struck you. You lost a life.`;
      return `${actor} struck ${target}.`;
    case 'scramble':
      if (targetIsMe) return `${event.playerName} scrambled your sequence. Watch the new one.`;
      return `${actor} scrambled ${possessive(event.targetName)} sequence.`;
    case 'slowMo':
    case 'fastForward':
    case 'lightsOut': {
      if (event.outcome === 'failed') {
        if (actorIsMe) return `Your ${card} on ${event.targetName} missed.`;
        if (targetIsMe) return `${possessive(event.playerName)} ${card} missed you.`;
        return `${possessive(event.playerName)} ${card} on ${event.targetName} missed.`;
      }
      const when = event.pending ? 'next level' : 'sequence';
      if (event.ability === 'lightsOut') {
        if (targetIsMe)
          return `${event.playerName} turned your lights out${event.pending ? ' for your next level' : ''}.`;
        return `${actor} turned the lights out on ${possessive(event.targetName)} ${when}.`;
      }
      const verb = event.ability === 'slowMo' ? 'slowed' : 'sped up';
      if (targetIsMe) return `${event.playerName} ${verb} your ${when}.`;
      return `${actor} ${verb} ${possessive(event.targetName)} ${when}.`;
    }
    case 'freePass':
      return actorIsMe ? 'Free Pass played. Round cleared.' : `${event.playerName} played a Free Pass.`;
    case 'reroll':
      return actorIsMe ? 'New sequence. Watch closely.' : `${event.playerName} rerolled their sequence.`;
    case 'jump':
      return actorIsMe
        ? `You jumped to level ${event.level}.`
        : `${event.playerName} jumped from level ${event.fromLevel} to level ${event.level}.`;
    default:
      return `${actor} played ${card}.`;
  }
}

// The persistent live feed: every ability event plus every elimination, newest first.
// `mine` rows involve the viewer; `aimedAtMe` rows are cards that came for them.
export function buildFeedRows({ abilityEvents = [], players = [], viewerId = null, scope = 'everyone' }) {
  const abilityRows = abilityEvents.map((event) => {
    const aimedAtMe = Boolean(viewerId) && event.targetId === viewerId;
    return {
      key: event._id,
      kind: 'ability',
      ability: event.ability,
      outcome: event.outcome,
      at: event.createdAt,
      round: event.round ?? null,
      text: describeAbilityEvent(event, viewerId),
      mine: isInFeed('me', viewerId, event),
      aimedAtMe,
    };
  });
  const eliminationRows = players
    .filter((player) => player.eliminated && player.eliminatedAt)
    .map((player) => ({
      key: `elimination-${player._id}`,
      kind: 'elimination',
      at: player.eliminatedAt,
      round: player.eliminatedRound ?? null,
      text: player._id === viewerId ? 'You were eliminated.' : `${player.name} was eliminated.`,
      mine: player._id === viewerId,
      aimedAtMe: player._id === viewerId,
    }));

  return [...abilityRows, ...eliminationRows]
    .filter((row) => scope === 'everyone' || row.mine)
    .sort((a, b) => new Date(b.at) - new Date(a.at));
}
