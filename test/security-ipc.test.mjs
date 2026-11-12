import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

// Validates paths exactly as main.js open-path handler does
async function validateOpenPath(targetPath, allowedRoots = []) {
  if (!targetPath || typeof targetPath !== 'string') return { ok: false, error: 'Invalid path' };
  const resolved = path.resolve(targetPath);
  const stat = await fs.stat(resolved).catch(() => null);
  if (!stat) return { ok: false, error: 'That path does not exist.' };
  if (!stat.isDirectory()) return { ok: false, error: 'Target path must be a directory.' };

  const norm = (p) => (process.platform === 'win32' ? p.toLowerCase() : p);
  const isUnder = (dir, parent) => {
    const nd = norm(dir);
    const np = norm(parent);
    return nd === np || nd.startsWith(np.endsWith(path.sep) ? np : np + path.sep);
  };

  const allowed = allowedRoots.some((root) => isUnder(resolved, path.resolve(root)));
  if (!allowed) {
    return { ok: false, error: 'Path outside allowed directories.' };
  }
  return { ok: true, path: resolved };
}

test('open-path validation rejects invalid types and non-existent paths', async () => {
  assert.equal((await validateOpenPath(null, [])).ok, false);
  assert.equal((await validateOpenPath(123, [])).ok, false);
  assert.equal((await validateOpenPath('', [])).ok, false);
  assert.equal((await validateOpenPath('Z:\\non-existent-directory-xyz', [])).ok, false);
});

test('open-path validation rejects files to prevent executable execution', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'carmen-sec-'));
  const executable = path.join(tempDir, 'payload.bat');
  try {
    await fs.writeFile(executable, '@echo off\r\ncalc.exe\r\n');
    const res = await validateOpenPath(executable, [tempDir]);
    assert.equal(res.ok, false);
    assert.equal(res.error, 'Target path must be a directory.');
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('open-path validation permits allowed directories and blocks path traversal', async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'carmen-root-'));
  const subDir = path.join(rootDir, 'Music', 'Artist');
  const outsideDir = await fs.mkdtemp(path.join(os.tmpdir(), 'carmen-outside-'));
  try {
    await fs.mkdir(subDir, { recursive: true });

    // Allowed root and allowed subfolder
    assert.equal((await validateOpenPath(rootDir, [rootDir])).ok, true);
    assert.equal((await validateOpenPath(subDir, [rootDir])).ok, true);

    // Outside allowed root
    const outRes = await validateOpenPath(outsideDir, [rootDir]);
    assert.equal(outRes.ok, false);
    assert.equal(outRes.error, 'Path outside allowed directories.');

    // Traversal attempts
    const traversal = path.join(subDir, '..', '..', '..');
    const travRes = await validateOpenPath(traversal, [rootDir]);
    assert.equal(travRes.ok, false);
    assert.equal(travRes.error, 'Path outside allowed directories.');
  } finally {
    await fs.rm(rootDir, { recursive: true, force: true });
    await fs.rm(outsideDir, { recursive: true, force: true });
  }
});
