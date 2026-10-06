import { Meteor } from 'meteor/meteor';
import assert from 'assert';
import { PlayerAccountsCollection, SESSION_LIFETIME_MS, hashSessionToken } from '/imports/api/playerAccounts';

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

        const { sessionToken, ...publicFields } = result;
        assert.deepStrictEqual(publicFields, {
          _id: account._id,
          displayName: 'Alice',
          email: 'alice@example.com',
        });
        assert.strictEqual(typeof sessionToken, 'string');

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

        const { sessionToken, ...publicFields } = result;
        assert.deepStrictEqual(publicFields, {
          _id: account._id,
          displayName: 'Alice',
          email: 'alice@example.com',
        });
        assert.strictEqual(typeof sessionToken, 'string');
      });
    });

    describe('sessions', function () {
      async function registerAlice() {
        return Meteor.callAsync('playerAccounts.register', {
          displayName: 'Alice',
          email: 'alice@example.com',
          password: 'password123',
        });
      }

      it('stores only the hash of an issued session token', async function () {
        const { _id, sessionToken } = await registerAlice();
        const account = await PlayerAccountsCollection.findOneAsync(_id);

        assert.strictEqual(account.sessions.length, 1);
        assert.strictEqual(account.sessions[0].hash, hashSessionToken(sessionToken));
        assert.ok(!JSON.stringify(account).includes(sessionToken));
        assert.strictEqual(
          account.sessions[0].expiresAt.getTime() - account.sessions[0].createdAt.getTime(),
          SESSION_LIFETIME_MS
        );
      });

      it('resumes the account from a valid token', async function () {
        const { _id, sessionToken } = await registerAlice();

        const resumed = await Meteor.callAsync('playerAccounts.resume', sessionToken);

        assert.deepStrictEqual(resumed, { _id, displayName: 'Alice', email: 'alice@example.com' });
      });

      it('gives each sign-in its own session, so signing in elsewhere keeps the first', async function () {
        const first = await registerAlice();
        const second = await Meteor.callAsync('playerAccounts.signIn', {
          email: 'alice@example.com',
          password: 'password123',
        });

        assert.notStrictEqual(first.sessionToken, second.sessionToken);
        assert.strictEqual((await Meteor.callAsync('playerAccounts.resume', first.sessionToken))._id, first._id);
        assert.strictEqual((await Meteor.callAsync('playerAccounts.resume', second.sessionToken))._id, first._id);
      });

      it('rejects a missing or unknown token', async function () {
        await registerAlice();

        for (const token of [undefined, '', 42, 'not-a-real-token']) {
          await assert.rejects(
            Meteor.callAsync('playerAccounts.resume', token),
            (err) => err.error === 'invalid-session'
          );
        }
      });

      it('rejects an expired token and prunes it on the next sign-in', async function () {
        const { _id, sessionToken } = await registerAlice();
        await PlayerAccountsCollection.updateAsync(_id, {
          $set: { 'sessions.0.expiresAt': new Date(Date.now() - 1000) },
        });

        await assert.rejects(
          Meteor.callAsync('playerAccounts.resume', sessionToken),
          (err) => err.error === 'invalid-session'
        );

        await Meteor.callAsync('playerAccounts.signIn', { email: 'alice@example.com', password: 'password123' });
        const account = await PlayerAccountsCollection.findOneAsync(_id);
        assert.strictEqual(account.sessions.length, 1);
        assert.notStrictEqual(account.sessions[0].hash, hashSessionToken(sessionToken));
      });

      it('signs out only the session whose token is given', async function () {
        const first = await registerAlice();
        const second = await Meteor.callAsync('playerAccounts.signIn', {
          email: 'alice@example.com',
          password: 'password123',
        });

        await Meteor.callAsync('playerAccounts.signOut', first.sessionToken);

        await assert.rejects(
          Meteor.callAsync('playerAccounts.resume', first.sessionToken),
          (err) => err.error === 'invalid-session'
        );
        assert.strictEqual((await Meteor.callAsync('playerAccounts.resume', second.sessionToken))._id, first._id);
      });

      it('treats signing out with an unknown token as a no-op', async function () {
        await registerAlice();
        await Meteor.callAsync('playerAccounts.signOut', 'not-a-real-token');
        await Meteor.callAsync('playerAccounts.signOut', undefined);
      });
    });
  });
}
