import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

async function promoteFileWithFallback(savePath, finalPath, linkFn = fs.link, copyFn = fs.copyFile) {
  if (savePath !== finalPath) {
    try {
      await linkFn(savePath, finalPath);
    } catch (err) {
      if (err.code === 'EXDEV' || err.code === 'ENOTSUP' || err.code === 'EPERM') {
        await copyFn(savePath, finalPath, constants.COPYFILE_EXCL);
      } else {
        throw err;
      }
    }
    await fs.unlink(savePath);
  }
}

test('non-NTFS fallback recovers from EXDEV, ENOTSUP, and EPERM by copying', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'carmen-fs-'));
  try {
    for (const code of ['EXDEV', 'ENOTSUP', 'EPERM']) {
      const source = path.join(tempDir, `temp-${code}.flac`);
      const target = path.join(tempDir, `final-${code}.flac`);
      await fs.writeFile(source, 'flac-audio-content');

      let linkAttempts = 0;
      let copyAttempts = 0;

      const mockLink = async () => {
        linkAttempts++;
        const err = new Error(`Link failed with ${code}`);
        err.code = code;
        throw err;
      };

      const mockCopy = async (src, dst, flags) => {
        copyAttempts++;
        assert.equal(flags, constants.COPYFILE_EXCL);
        return fs.copyFile(src, dst, flags);
      };

      await promoteFileWithFallback(source, target, mockLink, mockCopy);

      assert.equal(linkAttempts, 1);
      assert.equal(copyAttempts, 1);
      assert.equal(await fs.readFile(target, 'utf8'), 'flac-audio-content');

      // Verify source was unlinked
      await assert.rejects(() => fs.stat(source));
    }
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('non-NTFS fallback rethrows unexpected filesystem errors', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'carmen-fs-'));
  const source = path.join(tempDir, 'temp.flac');
  const target = path.join(tempDir, 'final.flac');
  try {
    await fs.writeFile(source, 'data');
    const mockLink = async () => {
      const err = new Error('Disk full');
      err.code = 'ENOSPC';
      throw err;
    };
    await assert.rejects(
      () => promoteFileWithFallback(source, target, mockLink),
      /Disk full/
    );
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
