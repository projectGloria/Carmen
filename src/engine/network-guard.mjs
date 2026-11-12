import net from 'node:net';
import dns from 'node:dns/promises';

export const PRIVATE_HOST = /^(localhost$|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.|\[?::1\]?$|\[?f[cd])/i;

export function isPrivateIp(ip) {
  if (!ip || typeof ip !== 'string') return true;
  let target = ip.trim();
  if (target.startsWith('::ffff:')) {
    const v4 = target.slice(7);
    if (net.isIPv4(v4)) target = v4;
  }
  if (net.isIPv4(target)) {
    const parts = target.split('.').map(Number);
    if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return true;
    return (
      parts[0] === 0 || // 0.0.0.0/8
      parts[0] === 10 || // 10.0.0.0/8
      parts[0] === 127 || // 127.0.0.0/8
      (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) || // 100.64.0.0/10 CGNAT
      (parts[0] === 169 && parts[1] === 254) || // 169.254.0.0/16 Link-local
      (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) || // 172.16.0.0/12
      (parts[0] === 192 && parts[1] === 168) || // 192.168.0.0/16
      (parts[0] === 192 && parts[1] === 0 && parts[2] === 2) || // 192.0.2.0/24 documentation
      (parts[0] === 198 && parts[1] === 51 && parts[2] === 100) || // 198.51.100.0/24 documentation
      (parts[0] === 203 && parts[1] === 0 && parts[2] === 113) || // 203.0.113.0/24 documentation
      parts[0] >= 224 // 224.0.0.0+ Multicast & Future/Broadcast
    );
  }
  if (net.isIPv6(target)) {
    const norm = target.toLowerCase();
    return (
      norm === '::1' || norm === '::' ||
      norm.startsWith('fc') || norm.startsWith('fd') || // Unique Local Address (ULA)
      norm.startsWith('fe80') || // Link-local
      norm.startsWith('ff') // Multicast
    );
  }
  return true; // Not a valid IP, treat as unsafe
}

export async function isSafePublicHost(hostname, lookupFn = dns.lookup) {
  if (!hostname || typeof hostname !== 'string') return false;
  if (PRIVATE_HOST.test(hostname)) return false;
  if (net.isIP(hostname)) {
    return !isPrivateIp(hostname);
  }
  try {
    const result = await lookupFn(hostname, { all: true });
    const addresses = Array.isArray(result) ? result : [result];
    if (!addresses.length) return false;
    for (const entry of addresses) {
      const addr = entry?.address || entry;
      if (!addr || isPrivateIp(addr)) return false;
    }
    return true;
  } catch {
    return false;
  }
}
