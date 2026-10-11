// Pure ability rules shared by the server and the client. No database access here.
import { ABILITY_CARDS_OFFERED, ABILITY_WEIGHTS } from '../constants';

// timing 'pre': resolved when the draft closes (on pick in Battle Royale).
// timing 'in': held in the hand and played during a round.
// kept: survives the end of the round until it is played.
export const ABILITIES = {
  steal: {
    label: 'Steal',
    timing: 'pre',
    targeted: true,
    hostile: true,
    kept: false,
    description: 'Take a life from another player. Fails if they are on their last life.',
  },
  strike: {
    label: 'Strike',
    timing: 'pre',
    targeted: true,
    hostile: true,
    kept: false,
    description: 'Knock a life off another player. This one can eliminate.',
  },
  shield: {
    label: 'Shield',
    timing: 'pre',
    targeted: false,
    hostile: false,
    kept: false,
    description: 'Block every card aimed at you this round. If nobody comes for you, it blocks nothing.',
  },
  freePass: {
    label: 'Free Pass',
    timing: 'in',
    targeted: false,
    hostile: false,
    kept: true,
    description: 'Clear a round instantly. Saved until you use it.',
  },
  reroll: {
    label: 'Reroll',
    timing: 'in',
    targeted: false,
    hostile: false,
    kept: false,
    description: 'Swap your sequence for a fresh one this round. It could be easier. It could be worse.',
  },
  scramble: {
    label: 'Scramble',
    timing: 'in',
    targeted: true,
    hostile: true,
    kept: false,
    description: 'Give another player a fresh sequence this round. Their clock keeps running.',
  },
  jump: {
    label: 'Jump',
    timing: 'in',
    targeted: false,
    hostile: false,
    kept: true,
    battleRoyaleOnly: true,
    description: "Move to a random player's level. Up or down. Saved until you use it.",
  },
};

export const ABILITY_TYPES = Object.keys(ABILITIES);

// The cards that can be dealt in a game. Steal needs a target with a spare life,
// so it is only worth dealing when players start with more than one.
export function eligibleAbilities({ isBattleRoyale = false, startingLives = 3 } = {}) {
  return ABILITY_TYPES.filter((type) => {
    if (ABILITIES[type].battleRoyaleOnly && !isBattleRoyale) return false;
    if (type === 'steal' && startingLives <= 1) return false;
    return true;
  });
}

// Weighted draw without replacement, so the cards in one draft are always distinct.
export function dealCards(options = {}, rng = Math.random, count = ABILITY_CARDS_OFFERED) {
  const pool = eligibleAbilities(options).map((type) => ({ type, weight: ABILITY_WEIGHTS[type] ?? 1 }));
  const dealt = [];
  while (dealt.length < count && pool.length > 0) {
    const total = pool.reduce((sum, card) => sum + card.weight, 0);
    let roll = rng() * total;
    let index = pool.findIndex((card) => {
      roll -= card.weight;
      return roll < 0;
    });
    if (index === -1) index = pool.length - 1;
    dealt.push(pool[index].type);
    pool.splice(index, 1);
  }
  return dealt;
}

// A Shield covers the round it was raised in. In Battle Royale that is the level the
// player is on, so it lapses as soon as they clear it.
export function isShielded(player) {
  const shieldRoundId = player?.secret?.shieldRoundId;
  return Boolean(shieldRoundId) && shieldRoundId === player.roundId;
}

// Ability methods only act for the connection that owns the player. A server-side
// call has no connection and is trusted.
export function isCallerBound(player, connectionId) {
  if (!connectionId) return true;
  return Boolean(player) && player.connectionId === connectionId;
}

// Cards in a hand that can still be played this round: kept cards always, the rest
// only in the round they were dealt for.
export function playableHand(player) {
  const hand = player?.secret?.hand ?? [];
  return hand.filter((card) => ABILITIES[card.type]?.kept || card.roundId === player.roundId);
}
