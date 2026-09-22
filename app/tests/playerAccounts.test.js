import { Meteor } from 'meteor/meteor';
import assert from 'assert';
import {
  PlayerAccountsCollection,
  SESSION_LIFETIME_MS,
  hashSessionToken,
  ensureUniqueDisplayNames,
} from '/imports/api/playerAccounts';
import { GlobalLeaderboardCollection } from '/imports/api/globalLeaderboard';
import { setGoogleVerifierForTests } from '/imports/api/googleAuth';

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

    describe('Google sign-in', function () {
      const CLIENT_ID = 'test-client.apps.googleusercontent.com';
      let previousClientId;
      let verifiedAudiences;

      function googleReturns(payload) {
        setGoogleVerifierForTests(async (idToken, audience) => {
          verifiedAudiences.push(audience);
          if (idToken !== 'valid-id-token') throw new Error('bad signature');
          return payload;
        });
      }

      const alice = { sub: 'google-sub-alice', email: 'Alice@Example.com', email_verified: true, name: 'Alice G' };

      beforeEach(function () {
        previousClientId = process.env.GOOGLE_CLIENT_ID;
        process.env.GOOGLE_CLIENT_ID = CLIENT_ID;
        verifiedAudiences = [];
      });

      afterEach(function () {
        if (previousClientId === undefined) delete process.env.GOOGLE_CLIENT_ID;
        else process.env.GOOGLE_CLIENT_ID = previousClientId;
        setGoogleVerifierForTests();
      });

      it('reports the client ID, or null when Google sign-in is off', async function () {
        assert.strictEqual(await Meteor.callAsync('playerAccounts.googleClientId'), CLIENT_ID);
        delete process.env.GOOGLE_CLIENT_ID;
        assert.strictEqual(await Meteor.callAsync('playerAccounts.googleClientId'), null);
      });

      it('refuses every call when Google sign-in is off', async function () {
        delete process.env.GOOGLE_CLIENT_ID;
        googleReturns(alice);
        await assert.rejects(
          Meteor.callAsync('playerAccounts.googleSignIn', 'valid-id-token'),
          (err) => err.error === 'google-disabled'
        );
        assert.deepStrictEqual(verifiedAudiences, []);
      });

      it('creates a passwordless account on first sign-in and issues a session', async function () {
        googleReturns(alice);

        const result = await Meteor.callAsync('playerAccounts.googleSignIn', 'valid-id-token');
        const account = await PlayerAccountsCollection.findOneAsync({ email: 'alice@example.com' });

        assert.deepStrictEqual(verifiedAudiences, [CLIENT_ID]);
        assert.strictEqual(account.googleSub, 'google-sub-alice');
        assert.strictEqual(account.displayName, 'Alice G');
        assert.strictEqual(account.passwordHash, undefined);
        assert.strictEqual(result._id, account._id);
        assert.strictEqual((await Meteor.callAsync('playerAccounts.resume', result.sessionToken))._id, account._id);
      });

      it('signs in to the same account on a later sign-in', async function () {
        googleReturns(alice);
        const first = await Meteor.callAsync('playerAccounts.googleSignIn', 'valid-id-token');
        googleReturns({ ...alice, email: 'alice.new@example.com', name: 'Renamed' });
        const second = await Meteor.callAsync('playerAccounts.googleSignIn', 'valid-id-token');

        assert.strictEqual(second._id, first._id);
        assert.strictEqual(await PlayerAccountsCollection.find({}).countAsync(), 1);
      });

      it('links Google to an existing email-and-password account with the same verified email', async function () {
        const registered = await Meteor.callAsync('playerAccounts.register', {
          displayName: 'Alice',
          email: 'alice@example.com',
          password: 'password123',
        });
        googleReturns(alice);

        const result = await Meteor.callAsync('playerAccounts.googleSignIn', 'valid-id-token');
        const account = await PlayerAccountsCollection.findOneAsync(registered._id);

        assert.strictEqual(result._id, registered._id);
        assert.strictEqual(account.googleSub, 'google-sub-alice');
        assert.ok(account.passwordHash, 'the password still works');
        assert.ok(
          await Meteor.callAsync('playerAccounts.signIn', { email: 'alice@example.com', password: 'password123' })
        );
      });

      it('refuses to link an email already linked to a different Google account', async function () {
        googleReturns(alice);
        await Meteor.callAsync('playerAccounts.googleSignIn', 'valid-id-token');
        googleReturns({ ...alice, sub: 'google-sub-someone-else' });

        await assert.rejects(
          Meteor.callAsync('playerAccounts.googleSignIn', 'valid-id-token'),
          (err) => err.error === 'account-linked'
        );
      });

      it('rejects an unverified Google email without creating an account', async function () {
        googleReturns({ ...alice, email_verified: false });

        await assert.rejects(
          Meteor.callAsync('playerAccounts.googleSignIn', 'valid-id-token'),
          (err) => err.error === 'unverified-email'
        );
        assert.strictEqual(await PlayerAccountsCollection.find({}).countAsync(), 0);
      });

      it('rejects a token the verifier refuses, or a missing token', async function () {
        googleReturns(alice);

        for (const token of ['forged-token', '', undefined]) {
          await assert.rejects(
            Meteor.callAsync('playerAccounts.googleSignIn', token),
            (err) => err.error === 'invalid-google-token'
          );
        }
        assert.strictEqual(await PlayerAccountsCollection.find({}).countAsync(), 0);
      });

      it('tells a Google-only account to use Google when signing in with a password', async function () {
        googleReturns(alice);
        await Meteor.callAsync('playerAccounts.googleSignIn', 'valid-id-token');

        await assert.rejects(
          Meteor.callAsync('playerAccounts.signIn', { email: 'alice@example.com', password: 'password123' }),
          (err) => err.error === 'use-google'
        );
      });
    });

    describe('display names', function () {
      let emailCounter = 0;

      async function register(displayName) {
        emailCounter += 1;
        return Meteor.callAsync('playerAccounts.register', {
          displayName,
          email: `player-${emailCounter}@example.com`,
          password: 'password123',
        });
      }

      beforeEach(async function () {
        await GlobalLeaderboardCollection.removeAsync({});
      });

      afterEach(function () {
        delete process.env.GOOGLE_CLIENT_ID;
        setGoogleVerifierForTests();
      });

      it('stores a normalised name and a case-insensitive key', async function () {
        const { _id } = await register('  Alice   G  ');
        const account = await PlayerAccountsCollection.findOneAsync(_id);

        assert.strictEqual(account.displayName, 'Alice G');
        assert.strictEqual(account.displayNameKey, 'alice g');
      });

      it('refuses to register a name that is taken in any casing or spacing', async function () {
        await register('Alice G');

        for (const name of ['Alice G', 'alice g', '  ALICE   g ']) {
          await assert.rejects(register(name), (err) => err.error === 'name-taken');
        }
        assert.strictEqual(await PlayerAccountsCollection.find({}).countAsync(), 1);
      });

      it('gives a first Google sign-in the next free variant of a taken name', async function () {
        process.env.GOOGLE_CLIENT_ID = 'test-client.apps.googleusercontent.com';
        await register('Alice G');
        await register('Alice G 2');

        let sub = 0;
        setGoogleVerifierForTests(async () => {
          sub += 1;
          return { sub: `google-${sub}`, email: `google-${sub}@example.com`, email_verified: true, name: 'alice g' };
        });

        const first = await Meteor.callAsync('playerAccounts.googleSignIn', 'token');
        const second = await Meteor.callAsync('playerAccounts.googleSignIn', 'token');

        assert.strictEqual(first.displayName, 'alice g 3');
        assert.strictEqual(second.displayName, 'alice g 4');
      });

      it('keeps a suffixed name within the length limit', async function () {
        process.env.GOOGLE_CLIENT_ID = 'test-client.apps.googleusercontent.com';
        const longName = 'N'.repeat(40);
        await register(longName);
        setGoogleVerifierForTests(async () => ({
          sub: 'google-long',
          email: 'long@example.com',
          email_verified: true,
          name: longName,
        }));

        const result = await Meteor.callAsync('playerAccounts.googleSignIn', 'token');

        assert.strictEqual(result.displayName, `${'N'.repeat(38)} 2`);
        assert.strictEqual(result.displayName.length, 40);
      });

      describe('playerAccounts.updateDisplayName', function () {
        it('renames the account behind the session token and updates its leaderboard row', async function () {
          const { _id, sessionToken } = await register('Alice');
          await GlobalLeaderboardCollection.insertAsync({ accountId: _id, displayName: 'Alice', bestRound: 3 });

          const result = await Meteor.callAsync('playerAccounts.updateDisplayName', sessionToken, '  Queen   Alice ');

          assert.deepStrictEqual(result, { _id, displayName: 'Queen Alice', email: result.email });
          const account = await PlayerAccountsCollection.findOneAsync(_id);
          assert.strictEqual(account.displayName, 'Queen Alice');
          assert.strictEqual(account.displayNameKey, 'queen alice');
          const entry = await GlobalLeaderboardCollection.findOneAsync({ accountId: _id });
          assert.strictEqual(entry.displayName, 'Queen Alice');
        });

        it('lets a player change only the casing of their own name', async function () {
          const { sessionToken } = await register('alice');

          const result = await Meteor.callAsync('playerAccounts.updateDisplayName', sessionToken, 'Alice');

          assert.strictEqual(result.displayName, 'Alice');
        });

        it('refuses a name another account holds, in any casing', async function () {
          await register('Bob');
          const { _id, sessionToken } = await register('Alice');

          await assert.rejects(
            Meteor.callAsync('playerAccounts.updateDisplayName', sessionToken, 'BOB'),
            (err) => err.error === 'name-taken'
          );
          assert.strictEqual((await PlayerAccountsCollection.findOneAsync(_id)).displayName, 'Alice');
        });

        it('frees the old name for someone else after a rename', async function () {
          const { sessionToken } = await register('Alice');
          await Meteor.callAsync('playerAccounts.updateDisplayName', sessionToken, 'Queen Alice');

          const newcomer = await register('alice');

          assert.strictEqual(newcomer.displayName, 'alice');
        });

        it('rejects a missing or signed-out session and an empty name', async function () {
          const { sessionToken } = await register('Alice');

          await assert.rejects(
            Meteor.callAsync('playerAccounts.updateDisplayName', undefined, 'Mallory'),
            (err) => err.error === 'invalid-session'
          );
          await assert.rejects(
            Meteor.callAsync('playerAccounts.updateDisplayName', sessionToken, '   '),
            (err) => err.error === 'invalid-name'
          );

          await Meteor.callAsync('playerAccounts.signOut', sessionToken);
          await assert.rejects(
            Meteor.callAsync('playerAccounts.updateDisplayName', sessionToken, 'Mallory'),
            (err) => err.error === 'invalid-session'
          );
        });
      });

      describe('ensureUniqueDisplayNames', function () {
        async function insertLegacyAccount(displayName, createdAt) {
          return PlayerAccountsCollection.insertAsync({
            displayName,
            email: `${createdAt.getTime()}@x.com`,
            createdAt,
          });
        }

        it('suffixes duplicates, keeps the oldest on the original name, and syncs the leaderboard', async function () {
          const oldest = await insertLegacyAccount('Alice', new Date('2026-01-01'));
          const middle = await insertLegacyAccount('alice', new Date('2026-02-01'));
          const newest = await insertLegacyAccount(' ALICE ', new Date('2026-03-01'));
          const other = await insertLegacyAccount('Bob', new Date('2026-01-15'));
          await GlobalLeaderboardCollection.insertAsync({ accountId: newest, displayName: 'in-game name' });

          await ensureUniqueDisplayNames();

          const names = {};
          for (const id of [oldest, middle, newest, other]) {
            const account = await PlayerAccountsCollection.findOneAsync(id);
            names[id] = account.displayName;
            assert.strictEqual(account.displayNameKey, account.displayName.toLowerCase());
          }
          assert.strictEqual(names[oldest], 'Alice');
          assert.strictEqual(names[middle], 'alice 2');
          assert.strictEqual(names[newest], 'ALICE 3');
          assert.strictEqual(names[other], 'Bob');
          assert.strictEqual(
            (await GlobalLeaderboardCollection.findOneAsync({ accountId: newest })).displayName,
            'ALICE 3'
          );
        });

        it('is a no-op on clean data', async function () {
          await register('Alice');
          const before = await PlayerAccountsCollection.find({}).fetchAsync();

          await ensureUniqueDisplayNames();
          await ensureUniqueDisplayNames();

          assert.deepStrictEqual(await PlayerAccountsCollection.find({}).fetchAsync(), before);
        });
      });
    });
  });
}
