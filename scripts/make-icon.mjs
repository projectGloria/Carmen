// Build icon assets from Carmen branding.
// Copies Carmen.ico, extracts 32px tray.png, and ensures 512px icon.png.
//
//   node scripts/make-icon.mjs

import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'build');
mkdirSync(OUT, { recursive: true });

const icoPath = join(ROOT, 'Carmen.ico');
const jpgPath = join(ROOT, 'Carmen.jpg');

if (existsSync(icoPath)) {
  copyFileSync(icoPath, join(OUT, 'icon.ico'));

  // Extract 32x32 PNG for tray
  const ico = readFileSync(icoPath);
  const count = ico.readUInt16LE(4);
  for (let i = 0; i < count; i++) {
    const at = 6 + i * 16;
    const w = ico[at] || 256;
    const h = ico[at + 1] || 256;
    const size = ico.readUInt32LE(at + 8);
    const offset = ico.readUInt32LE(at + 12);
    if (w === 32 && h === 32) {
      const png = ico.subarray(offset, offset + size);
      writeFileSync(join(OUT, 'tray.png'), png);
      break;
    }
  }
}

// Ensure 512x512 icon.png from Carmen.jpg if python/pillow available
if (existsSync(jpgPath)) {
  const pyCode = `
from PIL import Image, ImageDraw
jpg = Image.open(r"${jpgPath.replace(/\\/g, '/')}").convert("RGBA")
img512 = jpg.resize((512, 512), Image.Resampling.LANCZOS)
mask512 = Image.new("L", (512, 512), 0)
draw = ImageDraw.Draw(mask512)
draw.rounded_rectangle([(0, 0), (512, 512)], radius=102, fill=255)
img512.putalpha(mask512)
img512.save(r"${join(OUT, 'icon.png').replace(/\\/g, '/')}", "PNG")
`;
  spawnSync('python', ['-c', pyCode], { stdio: 'inherit' });
}

console.log('build/icon.ico');
console.log('build/icon.png  512');
console.log('build/tray.png  32');
