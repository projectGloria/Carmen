import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isPrivateIp, isSafePublicHost, PRIVATE_HOST } from '../src/engine/network-guard.mjs';

test('isPrivateIp identifies private, loopback, and reserved addresses', () => {
  // Loopback
  assert.equal(isPrivateIp('127.0.0.1'), true);
  assert.equal(isPrivateIp('127.255.255.254'), true);
  assert.equal(isPrivateIp('::1'), true);

  // Private RFC 1918
  assert.equal(isPrivateIp('10.0.0.1'), true);
  assert.equal(isPrivateIp('172.16.0.1'), true);
  assert.equal(isPrivateIp('172.31.255.255'), true);
  assert.equal(isPrivateIp('192.168.1.1'), true);

  // Carrier-grade NAT (100.64.0.0/10)
  assert.equal(isPrivateIp('100.64.0.1'), true);
  assert.equal(isPrivateIp('100.127.255.255'), true);
  assert.equal(isPrivateIp('100.128.0.1'), false);

  // Link-local & 0.0.0.0
  assert.equal(isPrivateIp('169.254.1.1'), true);
  assert.equal(isPrivateIp('0.0.0.0'), true);

  // IPv6 ULA & Link-local
  assert.equal(isPrivateIp('fc00::1'), true);
  assert.equal(isPrivateIp('fd12:3456::1'), true);
  assert.equal(isPrivateIp('fe80::1'), true);

  // IPv4-mapped IPv6
  assert.equal(isPrivateIp('::ffff:127.0.0.1'), true);
  assert.equal(isPrivateIp('::ffff:192.168.1.5'), true);
  assert.equal(isPrivateIp('::ffff:8.8.8.8'), false);

  // Public addresses
  assert.equal(isPrivateIp('8.8.8.8'), false);
  assert.equal(isPrivateIp('1.1.1.1'), false);
  assert.equal(isPrivateIp('142.250.190.46'), false);
  assert.equal(isPrivateIp('2607:f8b0:4005:805::200e'), false);

  // Invalid strings
  assert.equal(isPrivateIp(''), true);
  assert.equal(isPrivateIp(null), true);
  assert.equal(isPrivateIp('not-an-ip'), true);
});

test('PRIVATE_HOST regex matches raw loopback and local strings', () => {
  assert.equal(PRIVATE_HOST.test('localhost'), true);
  assert.equal(PRIVATE_HOST.test('127.0.0.1'), true);
  assert.equal(PRIVATE_HOST.test('10.0.1.2'), true);
  assert.equal(PRIVATE_HOST.test('192.168.0.1'), true);
  assert.equal(PRIVATE_HOST.test('::1'), true);
  assert.equal(PRIVATE_HOST.test('example.com'), false);
  assert.equal(PRIVATE_HOST.test('cdn.qobuz.com'), false);
});

test('isSafePublicHost resolves and blocks DNS rebinding', async () => {
  // Reject string-level private hosts immediately
  assert.equal(await isSafePublicHost('localhost'), false);
  assert.equal(await isSafePublicHost('127.0.0.1'), false);
  assert.equal(await isSafePublicHost('10.1.2.3'), false);

  // DNS lookup resolves to private IP (e.g. nip.io or local DNS rebind)
  const mockRebindLookup = async (host) => {
    if (host === 'rebind.attacker.com') return { address: '127.0.0.1', family: 4 };
    if (host === 'internal.attacker.com') return { address: '192.168.1.100', family: 4 };
    if (host === 'cgnat.attacker.com') return { address: '100.64.1.2', family: 4 };
    if (host === 'safe.cdn.com') return { address: '93.184.216.34', family: 4 };
    throw new Error('NXDOMAIN');
  };

  assert.equal(await isSafePublicHost('rebind.attacker.com', mockRebindLookup), false);
  assert.equal(await isSafePublicHost('internal.attacker.com', mockRebindLookup), false);
  assert.equal(await isSafePublicHost('cgnat.attacker.com', mockRebindLookup), false);
  assert.equal(await isSafePublicHost('safe.cdn.com', mockRebindLookup), true);
  assert.equal(await isSafePublicHost('nonexistent.domain.xyz', mockRebindLookup), false);

  // Multi-IP resolution where one address is private
  const mockMultiLookup = async () => [
    { address: '93.184.216.34', family: 4 },
    { address: '127.0.0.1', family: 4 },
  ];
  assert.equal(await isSafePublicHost('mixed.attacker.com', mockMultiLookup), false);
});
