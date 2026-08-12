import { Meteor } from 'meteor/meteor';
import assert from 'assert';
import { PlayerAccountsCollection } from '/imports/api/playerAccounts';

if (Meteor.isServer) {
  describe('player accounts API', function () {
    beforeEach(async function () {
      await PlayerAccountsCollection.removeAsync({});
    });

    describe('playerAccounts.register', function () {
      it('throws on empty display name', async function () {
        await assert.rejects(
          Meteor.callAsync('playerAccounts.register', {
            displayName: '',
            email: 'alice@example.com',
            password: 'password123',
          }),
          (err) => err.error === 'invalid-name'
        );
      });

      it('throws on invalid email', async function () {
        await assert.rejects(
          Meteor.callAsync('playerAccounts.register', {
            displayName: 'Alice',
            email: 'not-an-email',
            password: 'password123',
          }),
          (err) => err.error === 'invalid-email'
        );
      });

      it('throws on weak password', async function () {
        await assert.rejects(
          Meteor.callAsync('playerAccounts.register', {
            displayName: 'Alice',
            email: 'alice@example.com',
            password: 'short',
          }),
          (err) => err.error === 'weak-password'
        );
      });

      it('creates an account with normalized fields and password hash', async function () {
        const result = await Meteor.callAsync('playerAccounts.register', {
          displayName: '  Alice  ',
          email: 'ALICE@EXAMPLE.COM ',
          password: 'password123',
        });

        const account = await PlayerAccountsCollection.findOneAsync({ email: 'alice@example.com' });

        assert.deepStrictEqual(result, {
          _id: account._id,
          displayName: 'Alice',
          email: 'alice@example.com',
        });

        assert.ok(account);
        assert.strictEqual(account.displayName, 'Alice');
        assert.strictEqual(account.gamesPlayed, 0);
        assert.strictEqual(account.wins, 0);
        assert.strictEqual(account.bestRound, 0);
        assert.ok(account.passwordSalt);
        assert.ok(account.passwordHash);
        assert.notStrictEqual(account.passwordHash, 'password123');
        assert.ok(account.createdAt instanceof Date);
      });

      it('throws when registering an existing email case-insensitively', async function () {
        await Meteor.callAsync('playerAccounts.register', {
          displayName: 'Alice',
          email: 'alice@example.com',
          password: 'password123',
        });

        await assert.rejects(
          Meteor.callAsync('playerAccounts.register', {
            displayName: 'Alice 2',
            email: 'ALICE@EXAMPLE.COM',
            password: 'password456',
          }),
          (err) => err.error === 'account-exists'
        );
      });
    });

    describe('playerAccounts.signIn', function () {
      beforeEach(async function () {
        await Meteor.callAsync('playerAccounts.register', {
          displayName: 'Alice',
          email: 'alice@example.com',
          password: 'password123',
        });
      });

      it('throws on invalid email', async function () {
        await assert.rejects(
          Meteor.callAsync('playerAccounts.signIn', {
            email: 'bad-email',
            password: 'password123',
          }),
          (err) => err.error === 'invalid-email'
        );
      });

      it('throws on missing password', async function () {
        await assert.rejects(
          Meteor.callAsync('playerAccounts.signIn', {
            email: 'alice@example.com',
            password: '',
          }),
          (err) => err.error === 'missing-password'
        );
      });

      it('throws when account is not found', async function () {
        await assert.rejects(
          Meteor.callAsync('playerAccounts.signIn', {
            email: 'missing@example.com',
            password: 'password123',
          }),
          (err) => err.error === 'not-found'
        );
      });

      it('throws on wrong password', async function () {
        await assert.rejects(
          Meteor.callAsync('playerAccounts.signIn', {
            email: 'alice@example.com',
            password: 'wrong-password',
          }),
          (err) => err.error === 'wrong-password'
        );
      });

      it('returns public account fields when credentials are valid', async function () {
        const result = await Meteor.callAsync('playerAccounts.signIn', {
          email: ' ALICE@EXAMPLE.COM ',
          password: 'password123',
        });

        const account = await PlayerAccountsCollection.findOneAsync({ email: 'alice@example.com' });

        assert.deepStrictEqual(result, {
          _id: account._id,
          displayName: 'Alice',
          email: 'alice@example.com',
        });
      });
    });
  });
}
