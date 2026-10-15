import { Meteor } from 'meteor/meteor';
import { closeDraft, playCard, settleDraft } from './abilityEngine';
import { boundPlayer } from './playerAccess';
import { assertPlayAllowed } from './roomBans';

async function ownPlayer(playerId, connection) {
  const player = await boundPlayer(playerId, connection);
  await assertPlayAllowed(player, connection);
  return player;
}

if (Meteor.isServer && !global._abilitiesInitialized) {
  global._abilitiesInitialized = true;
  Meteor.methods({
    // Take one of the cards dealt in the draft. Targeted Steal and Strike name their target now.
    async 'abilities.pick'(playerId, type, targetId = null) {
      if (typeof type !== 'string' || !type) throw new Meteor.Error('invalid-ability', 'Choose a card');
      const player = await ownPlayer(playerId, this.connection);
      await settleDraft(player, type, targetId);
      return true;
    },

    async 'abilities.skip'(playerId) {
      const player = await ownPlayer(playerId, this.connection);
      await settleDraft(player, null, null);
      return true;
    },

    // Play a held card: Free Pass, Reroll, Scramble (targeted) or Jump.
    async 'abilities.use'(playerId, cardId, targetId = null) {
      if (typeof cardId !== 'string' || !cardId) throw new Meteor.Error('invalid-ability', 'Choose a card');
      const player = await ownPlayer(playerId, this.connection);
      return playCard(player, cardId, targetId);
    },

    // Fallback for the server timer that closes a draft, which a restart would lose.
    async 'abilities.closeDraft'(roundId) {
      if (typeof roundId !== 'string' || !roundId) throw new Meteor.Error('invalid', 'Invalid round');
      return closeDraft(roundId);
    },
  });
}
