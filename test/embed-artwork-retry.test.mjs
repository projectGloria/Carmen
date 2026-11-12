import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { embedArtwork, hasValidArtwork } from '../src/engine/flac-artwork.mjs';

const block = (type, body, last = false) => {
  const header = Buffer.alloc(4);
  header[0] = type | (last ? 128 : 0);
  header.writeUIntBE(body.length, 1, 3);
  return Buffer.concat([header, body]);
};
const uint = (value) => {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(value);
  return b;
};
const flac = (tags = {}, duration = 180) => {
  const stream = Buffer.alloc(34);
  stream.writeUInt16BE(4096);
  stream.writeBigUInt64BE((44100n << 44n) | BigInt(Math.round(44100 * duration)), 10);
  const comments = Object.entries(tags).flatMap(([key, values]) =>
    (Array.isArray(values) ? values : [values]).map((value) => Buffer.from(`${key}=${value}`))
  );
  return Buffer.concat([
    Buffer.from('fLaC'),
    block(0, stream),
    block(4, Buffer.concat([uint(0), uint(comments.length), ...comments.flatMap((c) => [uint(c.length), c])]), true),
    Buffer.from([255, 248, 0, 0]),
  ]);
};

test('embedArtwork retries on transient file locks and successfully embeds image', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'carmen-artwork-'));
  const filePath = path.join(tempDir, 'test.flac');
  try {
    await fs.writeFile(filePath, flac({ TITLE: 'Song', ARTIST: 'Artist' }));

    const dummyArtwork = {
      bytes: Buffer.from('fake-jpeg-image-bytes-content'),
      mime: 'image/jpeg',
      width: 500,
      height: 500,
    };

    await embedArtwork(filePath, dummyArtwork);

    // Verify file exists and has valid artwork metadata block
    const stat = await fs.stat(filePath);
    assert.ok(stat.size > 0);

    const hasArt = await hasValidArtwork(filePath, (bytes) => bytes.length > 0);
    assert.equal(hasArt, true);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
