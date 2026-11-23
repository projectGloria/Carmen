import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { DownloadTracker, ipcAdapter } from '../src/engine/electron-bridge.mjs';
import { Controller, DOWNLOADING } from '../src/engine/controller.mjs';
import { Pool } from '../src/engine/pool.mjs';
import { SourceAccess } from '../src/engine/source-access.mjs';
import { Worker } from '../src/engine/worker.mjs';
import { score, isAcceptable } from '../src/engine/matching.mjs';
import { pickYouTube } from '../src/engine/yt-fallback.mjs';
import { resourceCache } from '../src/engine/resource-cache.mjs';
import { isPrivateIp, isSafePublicHost } from '../src/engine/network-guard.mjs';
import { installSourceObserver } from '../src/engine/source-response.cjs';

test('DownloadTracker ignores late cancelled status and resets per-item state on fresh attempt', async () => {
  const emitter = new EventEmitter();
  emitter.send = () => {};
  const tracker = new DownloadTracker(emitter, { startTimeoutMs: 500 });
  const ipc = ipcAdapter(emitter, tracker);

  const ctl = new AbortController();
  const wait = tracker.await('t1', ctl.signal);
  ctl.abort();
  assert.equal(await wait, null);

  // Late cancelled status from main.js after waiter was aborted must not poison next attempt.
  emitter.emit('download-status', {}, { itemId: 't1', status: 'cancelled' });
  assert.equal(tracker.early.has('t1'), false);

  // Even if an earlier non-cancelled result was held, setDownloadContext resets it.
  emitter.emit('download-status', {}, { itemId: 't1', status: 'interrupted' });
  assert.equal(tracker.early.has('t1'), true);
  ipc.setDownloadContext({ itemId: 't1', webContentsId: 1 });
  assert.equal(tracker.early.has('t1'), false);
  assert.equal(tracker.started.has('t1'), false);
  tracker.dispose();
});

test('Controller evicts cached release URL on detached transfer failure and does not preempt active transfers', async () => {
  const evicted = [];
  const ctl = new Controller({
    services: ['qobuz'],
    concurrency: 1,
    maxTransfers: 0,
    awaitTransfer: () => new Promise(() => {}),
    onTransferFailed: (item, step) => evicted.push(`${item.id}:${step.service}`),
    getWorker: () => ({
      run: async () => ({ outcome: 'transferring' }),
    }),
  });

  // Simulate an active slot currently in DOWNLOADING state waiting in _waitOrDetach.
  const rec = { item: { id: 'a', title: 'A', artist: 'B' }, status: DOWNLOADING, statusText: 'Downloading' };
  ctl.items.set('a', rec);
  let aborted = false;
  ctl.pool.active.set('a', { item: rec.item, slot: 0, controller: { abort: () => { aborted = true; } } });
  ctl.pool._freeSlots = [];
  assert.equal(ctl._preemptSlots(1, new Set(['b'])), 0);
  assert.equal(aborted, false);

  // Verify playlist cache is stored off-object (WeakMap), not serialized onto playlist records.
  ctl.addProfile({ id: 'p1', name: 'P1', folderName: 'P1' }, [{ id: 'pl1', name: 'Mix', trackKeys: ['k1'] }], {
    k1: { title: 'Song', artist: 'Artist', status: 'downloaded' },
  }, { queue: false });
  ctl.getItems();
  assert.equal('_itemCache' in ctl.playlists.get('pl1'), false);

  // Verify onTransferFailed fires when a detached transfer fails.
  const failing = new Controller({
    services: ['qobuz'],
    concurrency: 1,
    maxTransfers: 2,
    awaitTransfer: async () => ({ status: 'rejected-track-identity' }),
    onTransferFailed: (item, step) => evicted.push(`${item.id}:${step.service}`),
    getWorker: () => ({
      run: async () => ({ outcome: 'transferring' }),
    }),
  });
  failing.add([{ id: 'x', title: 'X', artist: 'Y', key: 'x' }]);
  await new Promise((r) => setTimeout(r, 30));
  assert.ok(evicted.includes('x:qobuz'));
  failing.dispose();
  ctl.dispose();
});

test('Worker defaults Monochrome endpoint to empty without robots.txt hop and suppresses pending artwork', async () => {
  const access = new SourceAccess({ intervalMs: 0 });
  const visited = [];
  const contexts = [];
  const view = {
    webContentsId: 7,
    navigate(url) { visited.push(url); queueMicrotask(() => this._cb?.()); },
    onDomReady(cb) { this._cb = cb; return () => { if (this._cb === cb) this._cb = null; }; },
    executeJavaScript: async () => ({ outcome: 'no-results' }),
    reset() {},
  };
  const ipc = {
    setDownloadContext: (ctx) => contexts.push(ctx),
    clearDownloadContext: () => {},
  };
  const worker = new Worker({ slot: 0, view, ipc, access, getMonochromeApiUrl: () => '' });
  await worker.run(
    { id: '1', title: 'Song', artist: 'Artist', image: 'https://playlist-cover.example/1.jpg', artworkPending: true },
    { source: 'monochrome', service: 'monochrome', query: 'Song Artist', index: 0 },
  );
  assert.equal(visited.some((u) => u.includes('robots.txt')), false);
  assert.equal(contexts[0].trackArtworkUrl, null);
});

test('matching handles contractions/apostrophes and unparenthesized feat./ft. credits', () => {
  assert.ok(isAcceptable(score({ title: "Don't Stop", artist: 'Fleetwood Mac' }, 'Dont Stop', 'Fleetwood Mac')));
  assert.ok(isAcceptable(score({ title: 'Song (ft. Guest)', artist: 'Main' }, 'Song', 'Main')));
  assert.ok(isAcceptable(score({ title: 'Song', artist: 'Main, Guest' }, 'Song feat. Guest', 'Main')));
});

test('yt-fallback refuses wrong song for self-titled track', () => {
  const { chosen } = pickYouTube(
    { title: 'Black Sabbath', artist: 'Black Sabbath' },
    [{ title: 'Black Sabbath - Paranoid', uploader: 'Black Sabbath', url: 'https://youtu.be/1' }],
  );
  assert.equal(chosen, null);
});

test('resourceCache immediate retry inside catch starts a fresh request', async () => {
  let calls = 0;
  const cached = resourceCache(async () => {
    calls++;
    if (calls === 1) throw new Error('boom');
    return 'ok';
  });
  const value = await cached('k').catch(() => cached('k'));
  assert.equal(value, 'ok');
  assert.equal(calls, 2);
});

test('network-guard blocks IPv4-mapped IPv6 hex/uppercase and bracketed IPv6 literals', async () => {
  assert.equal(isPrivateIp('::FFFF:127.0.0.1'), true);
  assert.equal(isPrivateIp('::ffff:7f00:1'), true);
  assert.equal(isPrivateIp('::ffff:a00:1'), true);
  assert.equal(await isSafePublicHost('[fe80::1]'), false);
  assert.equal(await isSafePublicHost('[::ffff:7f00:1]'), false);
});

test('source-response clears tracking when a request redirects off-origin', () => {
  const hooks = {};
  const published = [];
  const webRequest = Object.fromEntries(
    ['onBeforeSendHeaders', 'onHeadersReceived', 'onCompleted', 'onErrorOccurred'].map((n) => [n, (h) => { hooks[n] = h; }]),
  );
  const ctx = { itemId: 'i1', service: 'qobuz', sourceUrl: 'https://lucida.to/search' };
  installSourceObserver(webRequest, () => ctx, (r) => published.push(r));
  hooks.onBeforeSendHeaders({ id: 9, webContentsId: 1, resourceType: 'xhr', url: 'https://lucida.to/api' }, () => {});
  hooks.onBeforeSendHeaders({ id: 9, webContentsId: 1, resourceType: 'xhr', url: 'https://cdn.unrelated.example/x' }, () => {});
  hooks.onHeadersReceived({ id: 9, webContentsId: 1, resourceType: 'xhr', statusCode: 429 }, () => {});
  assert.equal(published.length, 0);
});

test('Pool.cancelMany removes queued items and aborts active items in one pass', () => {
  const pool = new Pool({ concurrency: 1, run: () => new Promise(() => {}) });
  pool.pause();
  pool.submit([{ id: '1' }, { id: '2' }, { id: '3' }]);
  const n = pool.cancelMany(['1', '3']);
  assert.equal(n, 2);
  assert.deepEqual(pool.queue.map((i) => i.id), ['2']);
});
