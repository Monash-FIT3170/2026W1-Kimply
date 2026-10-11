import { Meteor } from 'meteor/meteor';
import { PlayersCollection } from './players';
import { isCallerBound } from './abilityRules';
import { closeDraft, playCard, settleDraft } from './abilityEngine';

// Abilities can hurt other players, so unlike the older game methods they only act
// for the connection that owns the player (see D3 in docs/defect-register.md).
async function boundPlayer(playerId, connection) {
  if (typeof playerId !== 'string' || !playerId) throw new Meteor.Error('invalid', 'Invalid player');
  const player = await PlayersCollection.findOneAsync(playerId);
  if (!player) throw new Meteor.Error('not-found', 'Player not found');
  if (!isCallerBound(player, connection?.id)) throw new Meteor.Error('not-yours', 'That is not your player');
  return player;
}

if (Meteor.isServer && !global._abilitiesInitialized) {
  global._abilitiesInitialized = true;
  Meteor.methods({
    // Take one of the cards dealt in the draft. Targeted Steal and Strike name their target now.
    async 'abilities.pick'(playerId, type, targetId = null) {
      if (typeof type !== 'string' || !type) throw new Meteor.Error('invalid-ability', 'Choose a card');
      const player = await boundPlayer(playerId, this.connection);
      await settleDraft(player, type, targetId);
      return true;
    },

    async 'abilities.skip'(playerId) {
      const player = await boundPlayer(playerId, this.connection);
      await settleDraft(player, null, null);
      return true;
    },

    // Play a held card: Free Pass, Reroll, Scramble (targeted) or Jump.
    async 'abilities.use'(playerId, cardId, targetId = null) {
      if (typeof cardId !== 'string' || !cardId) throw new Meteor.Error('invalid-ability', 'Choose a card');
      const player = await boundPlayer(playerId, this.connection);
      return playCard(player, cardId, targetId);
    },

    // Fallback for the server timer that closes a draft, which a restart would lose.
    async 'abilities.closeDraft'(roundId) {
      if (typeof roundId !== 'string' || !roundId) throw new Meteor.Error('invalid', 'Invalid round');
      return closeDraft(roundId);
    },
  });
}
