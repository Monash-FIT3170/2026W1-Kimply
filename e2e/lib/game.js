const L = require('./fixtures');
const scope = require('./scope');
// SockJS wraps DDP messages in arrays of JSON strings; rules clients use plain DDP.
function ddpMessages(payload) {
  try {
    const text = String(payload);
    const decoded = JSON.parse(text.startsWith('a[') ? text.slice(1) : text);
    return (Array.isArray(decoded) ? decoded : [decoded]).flatMap((message) =>
      typeof message === 'string' ? ddpMessages(message) : [message]
    );
  } catch {
    return []; // SockJS open/heartbeat frames and development HMR frames are not DDP.
  }
}
const test = L.test.extend({
  page: async ({ page, ownedData }, use, testInfo) => {
    const owned = scope.current();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('websocket', (socket) => {
      const resumes = new Set();
      socket.on('framesent', ({ payload }) => {
        for (const message of ddpMessages(payload)) {
          if (message.msg === 'method' && message.method === 'browserSessions.resume') resumes.add(message.id);
        }
      });
      socket.on('framereceived', ({ payload }) => {
        for (const message of ddpMessages(payload)) {
          if (message.msg === 'result' && resumes.delete(message.id) && typeof message.result?.token === 'string') {
            owned.browserTokens.add(message.result.token);
          }
        }
      });
    });
    try {
      await use(page);
    } finally {
      if (!page.isClosed()) {
        const token = await page.evaluate(() => localStorage.getItem('kimply.browser')).catch(() => null);
        if (token) owned.browserTokens.add(token);
        if (testInfo.status !== testInfo.expectedStatus || errors.length) {
          const screenshot = await page.screenshot({ timeout: 5000 }).catch(() => null);
          if (screenshot) await testInfo.attach('failure', { body: screenshot, contentType: 'image/png' });
        }
        // Shut down reconnect hooks before the data fixture deletes the observed sessions.
        await page.close();
      }
      L.expect(errors, 'uncaught browser errors').toEqual([]);
    }
  },
});
const keys = { red: 'w', yellow: 'a', green: 's', blue: 'd' };
async function createRoom(page, { mode = 'Medium', abilities = true, name = 'Human', custom = false } = {}) {
  await page.goto('/play');
  await L.expect(page.getByRole('button', { name: /Create Room/ })).toBeVisible();
  const signedIn = await page.evaluate(() => Boolean(localStorage.getItem('kimply.session')));
  if (signedIn) await L.expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
  const username = page.getByPlaceholder('Enter your username');
  if (await username.isVisible()) await username.fill(name);
  await page.getByRole('button', { name: /Create Room/ }).click();
  await L.expect(page).toHaveURL(/\/play\/modes\/[A-Z2-9]{5}$/);
  const pin = page.url().split('/').pop();
  scope.current().pins.add(pin);
  const browserToken = await page.evaluate(() => localStorage.getItem('kimply.browser'));
  if (browserToken) scope.current().browserTokens.add(browserToken);
  await page.getByRole('button', { name: new RegExp(`^${mode}`) }).click();
  if (custom) {
    await page.getByRole('button', { name: 'Slow', exact: true }).click();
    await page.getByRole('slider').nth(0).press('Home');
    for (let i = 0; i < 3; i++) await page.getByRole('slider').nth(0).press('ArrowRight');
    await page.getByRole('slider').nth(1).press('Home');
    await page.getByRole('slider').nth(1).press('ArrowRight');
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
  }
  await L.expect(page.getByRole('button', { name: 'Start Game', exact: true })).toBeVisible();
  if (!abilities) await page.getByRole('switch').click();
  const room = await (await L.db()).collection('rooms').findOne({ pin });
  return { pin, name: room.hostName };
}
async function bot(pin, name = 'Bot') {
  const p = new L.Player(name);
  await p.connect();
  await p.join(pin);
  return p;
}
async function start(page, game, bots) {
  await page.getByRole('button', { name: 'Start Game', exact: true }).click();
  await L.expect(page).toHaveURL(/\/game$/);
  for (const p of bots) await p.enter(game.battleRoyale);
  const me = await L.waitUntil(async () =>
    (await L.db()).collection('players').findOne({ gameId: game.pin, name: game.name })
  );
  game.playerId = me._id;
  return game;
}
async function yourTurn(page) {
  await L.expect(page.getByTestId('colour-tile-red')).toBeEnabled();
}
async function answer(page, game, { correct = true, click = false } = {}) {
  const before = await L.dbPlayer(game);
  const colours = await L.sequenceFor(game.pin, game.name);
  // A Jump event can arrive before the player's new board. Wait for that board,
  // then for its playback, rather than typing into the previous level's live tiles.
  await L.expect(page.getByText(`Selected: 0/${colours.length}`, { exact: true })).toBeVisible();
  await yourTurn(page);
  for (const c of colours) {
    const colour = correct ? c : c === 'red' ? 'blue' : 'red';
    await L.sleep(90 + Math.floor(Math.random() * 111));
    if (click) await page.getByTestId(`colour-tile-${colour}`).click();
    else await page.keyboard.press(keys[colour]);
  }
  if (click) await page.getByRole('button', { name: 'SUBMIT', exact: true }).click();
  else await page.keyboard.press('Enter');
  const after = await L.waitUntil(
    async () => {
      const me = await L.dbPlayer(game);
      // Grade writes and winner selection are separate writes. Ignore intermediate documents.
      if (correct) return (me.completeRound || me.roundId !== before.roundId || me.gameFinished) && me;
      if (before.lives <= 1) return (me.eliminated || me.gameFinished) && me;
      return me.totalGuesses > before.totalGuesses && me.lives === before.lives - 1 && me;
    },
    20_000,
    'browser answer accepted'
  );
  if (!correct && !after.eliminated && !after.gameFinished) {
    await L.expect(
      page.getByText(`Wrong sequence! ${after.lives} ${after.lives === 1 ? 'life' : 'lives'} remaining.`, {
        exact: true,
      })
    ).toBeVisible();
  }
}

async function noOverflow(page) {
  await L.expect
    .poll(() =>
      page.evaluate(() => {
        const offenders = [...document.querySelectorAll('*')]
          .filter((el) => {
            const style = getComputedStyle(el);
            if (style.overflowX !== 'hidden' || el.scrollWidth <= el.clientWidth + 1) return false;
            // Leaf text uses ellipsis intentionally (for example the copyable invite URL).
            // It cannot hide an overflowing child layout, which is the regression here.
            if (el.childElementCount === 0 && style.textOverflow === 'ellipsis') return false;
            return !el.matches('.pointer-events-none.absolute.inset-0.overflow-hidden');
          })
          .map((el) => `${el.tagName}.${el.className}`);
        return {
          pageOverflow: document.scrollingElement.scrollWidth > innerWidth,
          offenders,
        };
      })
    )
    .toEqual({ pageOverflow: false, offenders: [] });
}
async function insideViewport(locator) {
  await L.expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  const viewport = locator.page().viewportSize();
  L.expect(box.x).toBeGreaterThanOrEqual(0);
  L.expect(box.y).toBeGreaterThanOrEqual(0);
  L.expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
  L.expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);
}
async function draftClock(page, game) {
  const me = await L.dbPlayer(game);
  const expected = Math.max(0, Math.ceil((+me.secret.draft.endsAt - Date.now()) / 1000));
  const displayed = Number((await page.getByTestId('draft-countdown').innerText()).replace(/\D/g, ''));
  L.expect(Math.abs(displayed - expected), `draft reads ${displayed}, server has ${expected}`).toBeLessThanOrEqual(2);
}
async function nextRound(page, game, bots, number) {
  await answer(page, game);
  for (const p of bots) await p.answer();
  await L.waitUntil(
    async () =>
      (await (await L.db()).collection('rounds').findOne({ gameId: game.pin, isCurrent: true, advanced: false }))
        ?.roundNumber === number
  );
  await L.expect(page.getByRole('dialog')).toBeVisible();
}
module.exports = {
  ...L,
  test,
  createRoom,
  bot,
  start,
  yourTurn,
  answer,
  noOverflow,
  insideViewport,
  draftClock,
  nextRound,
};
