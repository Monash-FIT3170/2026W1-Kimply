const { MongoClient } = require('mongodb');
const crypto = require('node:crypto');
const scope = require('./scope');
const { waitUntil } = require('./wait');
let mongo;
async function db() {
  mongo ||= MongoClient.connect(process.env.E2E_MONGO_URL || 'mongodb://localhost:27017/?directConnection=true');
  return (await mongo).db('kimply');
}
async function closeDb() {
  if (mongo) await (await mongo).close();
  mongo = null;
}
async function dbPlayer(p) {
  return (await db()).collection('players').findOne({ _id: p.playerId });
}
async function sequenceFor(pin, name) {
  return (await (await db()).collection('players').findOne({ gameId: pin, name })).secret.sequence.colours;
}
async function seedDraft(player, offered) {
  const d = await db();
  await waitUntil(
    async () => (await dbPlayer(player))?.secret?.draft?.status === 'open',
    20_000,
    `${player.name} draft`
  );
  await d.collection('players').updateOne({ _id: player.playerId }, { $set: { 'secret.draft.offered': offered } });
  if (player.me)
    await waitUntil(
      () => player.me()?.secret?.draft?.offered?.join() === offered.join(),
      20_000,
      'seeded draft publication'
    );
}
async function seedHand(player, type) {
  const me = await dbPlayer(player);
  const card = {
    id: crypto.randomBytes(8).toString('hex'),
    type,
    roundId: me.roundId,
  };
  await (await db()).collection('players').updateOne({ _id: player.playerId }, { $push: { 'secret.hand': card } });
  if (player.me) await waitUntil(() => player.me()?.secret?.hand?.some((c) => c.id === card.id));
  return card.id;
}
async function seedAccount() {
  const id = `e2e-${crypto.randomUUID()}`;
  const token = crypto.randomBytes(32).toString('base64url');
  const displayName = `E2E${crypto.randomBytes(4).toString('hex')}`;
  const now = new Date();
  scope.current().accounts.add(id);
  await (await db()).collection('playerAccounts').insertOne({
    _id: id,
    displayName,
    email: `${id}@example.test`,
    gamesPlayed: 0,
    wins: 0,
    bestRound: 0,
    sessions: [
      {
        hash: crypto.createHash('sha256').update(token).digest('hex'),
        createdAt: now,
        expiresAt: new Date(+now + 86400000),
      },
    ],
    createdAt: now,
    updatedAt: now,
  });
  return { accountId: id, displayName, token };
}
async function cleanup() {
  const state = scope.current();
  for (const player of state.people) player.close();
  // Close every owned socket before removing data; no global collection wipes.
  const d = await db();
  const pins = [...state.pins];
  const players = await d
    .collection('players')
    .find({ gameId: { $in: pins } })
    .project({ accountId: 1 })
    .toArray();
  for (const p of players) if (p.accountId) state.accounts.add(p.accountId);
  for (const name of ['players', 'rounds', 'leaderboard', 'gameEvents'])
    await d.collection(name).deleteMany({ gameId: { $in: pins } });
  await d.collection('rooms').deleteMany({ pin: { $in: pins } });
  for (const name of ['playerAccounts', 'globalLeaderboard'])
    await d
      .collection(name)
      .deleteMany(
        name === 'playerAccounts' ? { _id: { $in: [...state.accounts] } } : { accountId: { $in: [...state.accounts] } }
      );
  const hashes = [...state.browserTokens, ...[...state.people].map((p) => p.browserToken)]
    .filter(Boolean)
    .map((t) => crypto.createHash('sha256').update(t).digest('hex'));
  await d.collection('browserSessions').deleteMany({ tokenHash: { $in: hashes } });
  await closeDb();
}
module.exports = {
  db,
  closeDb,
  dbPlayer,
  sequenceFor,
  seedDraft,
  seedHand,
  seedAccount,
  cleanup,
};
