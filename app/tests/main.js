import assert from 'assert';
import '../imports/api/gameMethods.js';
import './coverage-writer';

const context = require.context('.', false, /\.test\.js$/);
context.keys().forEach(context);

describe('2026W1-Kimply', function () {
  it('package.json has correct name', async function () {
    const { name } = await import('../package.json');
    assert.strictEqual(name, '2026W1-Kimply');
  });

  if (Meteor.isClient) {
    it('client is not server', function () {
      assert.strictEqual(Meteor.isServer, false);
    });
  }

  if (Meteor.isServer) {
    it('server is not client', function () {
      assert.strictEqual(Meteor.isClient, false);
    });
  }
});
