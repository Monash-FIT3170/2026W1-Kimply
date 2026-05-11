import assert from "assert";
import "../imports/api/systemMethods.js";
import { createGame } from "../imports/api/system.js";

describe("2026W1-Kimply", function () {
  it("package.json has correct name", async function () {
    const { name } = await import("../package.json");
    assert.strictEqual(name, "2026W1-Kimply");
  });

  if (Meteor.isClient) {
    it("client is not server", function () {
      assert.strictEqual(Meteor.isServer, false);
    });
  }

  if (Meteor.isServer) {
    it("server is not client", function () {
      assert.strictEqual(Meteor.isClient, false);
    });
  }
});

if (Meteor.isServer) {
  describe("game.checkAnswer", function () {
    let gameId;

    beforeEach(function () {
      gameId = createGame();
    });

    it("returns eliminated: false for correct answer", async function () {
      const result = await Meteor.callAsync("system.checkAnswer", gameId, 1, [0, 1, 2]);
      assert.strictEqual(result.eliminated, false);
    });

    it("returns eliminated: true for wrong answer", async function () {
      const result = await Meteor.callAsync("system.checkAnswer", gameId, 1, [0, 1, 9]);
      assert.strictEqual(result.eliminated, true);
    });

    it("returns eliminated: true for wrong length", async function () {
      const result = await Meteor.callAsync("system.checkAnswer", gameId, 1, [0, 1]);
      assert.strictEqual(result.eliminated, true);
    });

    it("returns eliminated: true for empty answer", async function () {
      const result = await Meteor.callAsync("system.checkAnswer", gameId, 1, []);
      assert.strictEqual(result.eliminated, true);
    });
  });
}
