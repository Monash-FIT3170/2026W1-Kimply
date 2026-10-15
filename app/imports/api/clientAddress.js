// The only address the server trusts is Meteor's connection.clientAddress.
// Method arguments are never an address source. Meteor selects that value using
// HTTP_FORWARDED_COUNT, so a spoofed X-Forwarded-For prefix is not what arrives here
// when the proxy count matches the real hop (see docs/deployment-manual.md).
import { isIP } from 'node:net';

export function addressOf(connection) {
  if (!connection || typeof connection.clientAddress !== 'string') return null;
  return normalizeAddress(connection.clientAddress);
}

// IPv4 stays dotted. IPv4-mapped IPv6 (::ffff:a.b.c.d) collapses to that IPv4.
// IPv6 is lowercased and compressed. Anything else, including a zone id left on a
// non-address, is null so the caller never invents a shared placeholder ban.
export function normalizeAddress(raw) {
  if (typeof raw !== 'string') return null;
  let value = raw.trim();
  if (!value) return null;
  if (value.startsWith('[') && value.endsWith(']')) value = value.slice(1, -1);
  const zone = value.indexOf('%');
  if (zone !== -1) value = value.slice(0, zone);
  if (!value) return null;

  const lower = value.toLowerCase();
  if (lower.startsWith('::ffff:')) {
    const mapped = value.slice('::ffff:'.length);
    if (isIP(mapped) === 4) return mapped;
  }

  const kind = isIP(value);
  if (kind === 4) return value;
  if (kind === 6) return compressIpv6(lower);
  return null;
}

function expandGroup(group) {
  if (group.includes('.')) {
    const parts = group.split('.').map((part) => Number(part));
    if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return null;
    const high = ((parts[0] << 8) | parts[1]).toString(16);
    const low = ((parts[2] << 8) | parts[3]).toString(16);
    return [high, low];
  }
  if (!/^[0-9a-f]{1,4}$/.test(group)) return null;
  return [parseInt(group, 16).toString(16)];
}

function compressIpv6(lower) {
  let left = [];
  let right = [];
  if (lower.includes('::')) {
    const pieces = lower.split('::');
    if (pieces.length !== 2) return null;
    left = pieces[0] ? pieces[0].split(':') : [];
    right = pieces[1] ? pieces[1].split(':') : [];
  } else {
    left = lower.split(':');
  }

  const expandedLeft = [];
  const expandedRight = [];
  for (const group of left) {
    const part = expandGroup(group);
    if (!part) return null;
    expandedLeft.push(...part);
  }
  for (const group of right) {
    const part = expandGroup(group);
    if (!part) return null;
    expandedRight.push(...part);
  }
  const missing = 8 - expandedLeft.length - expandedRight.length;
  if (missing < 0) return null;
  const full = [...expandedLeft, ...Array(missing).fill('0'), ...expandedRight];
  if (full.length !== 8) return null;

  let bestStart = -1;
  let bestLength = 0;
  let runStart = -1;
  for (let i = 0; i <= full.length; i += 1) {
    if (i < full.length && full[i] === '0') {
      if (runStart === -1) runStart = i;
    } else if (runStart !== -1) {
      const length = i - runStart;
      if (length > bestLength) {
        bestStart = runStart;
        bestLength = length;
      }
      runStart = -1;
    }
  }
  if (bestLength < 2) return full.join(':');
  const head = full.slice(0, bestStart).join(':');
  const tail = full.slice(bestStart + bestLength).join(':');
  return `${head}::${tail}`;
}
