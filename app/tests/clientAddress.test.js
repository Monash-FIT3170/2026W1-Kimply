import assert from 'assert';
import { Meteor } from 'meteor/meteor';
import { addressOf, normalizeAddress } from '../imports/api/clientAddress';

if (Meteor.isServer) {
  describe('client address normalisation', function () {
    it('keeps IPv4, collapses mapped IPv6, and compresses IPv6', function () {
      assert.strictEqual(normalizeAddress('203.0.113.5'), '203.0.113.5');
      assert.strictEqual(normalizeAddress('::ffff:192.0.2.1'), '192.0.2.1');
      assert.strictEqual(normalizeAddress('[::ffff:192.0.2.1]'), '192.0.2.1');
      assert.strictEqual(normalizeAddress('2001:0db8:0000:0000:0000:0000:0000:0001'), '2001:db8::1');
      assert.strictEqual(normalizeAddress('2001:db8::1'), '2001:db8::1');
      assert.strictEqual(normalizeAddress('fe80::1%eth0'), 'fe80::1');
      assert.strictEqual(normalizeAddress('::1'), '::1');
    });

    it('rejects missing or invalid values', function () {
      assert.strictEqual(normalizeAddress(null), null);
      assert.strictEqual(normalizeAddress(''), null);
      assert.strictEqual(normalizeAddress('not-an-ip'), null);
      assert.strictEqual(normalizeAddress('1.2.3'), null);
    });

    it('reads only connection.clientAddress', function () {
      assert.strictEqual(
        addressOf({
          clientAddress: '203.0.113.8',
          httpHeaders: { 'x-forwarded-for': '198.51.100.9, 203.0.113.8' },
        }),
        '203.0.113.8'
      );
      assert.strictEqual(addressOf({ httpHeaders: { 'x-forwarded-for': '198.51.100.9' } }), null);
      assert.strictEqual(addressOf(null), null);
    });
  });
}
