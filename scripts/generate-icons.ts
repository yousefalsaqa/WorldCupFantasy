/**
 * Generate every PWA icon size we need from the single source logo.
 * Run with:  npx tsx scripts/generate-icons.ts
 *
 * Outputs into public/icons/ — committed to the repo so deploy is
 * deterministic and we don't depend on sharp at build time.
 */

import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const SOURCE = 'public/logo-source.png';
const OUT_DIR = 'public/icons';

interface IconSpec {
  filename: string;
  size: number;
  /** If true, pad inside the image so the logo survives Android's circular mask. */
  maskable?: boolean;
}

const ICONS: IconSpec[] = [
  { filename: 'favicon-16.png', size: 16 },
  { filename: 'favicon-32.png', size: 32 },
  { filename: 'apple-touch-icon.png', size: 180 },
  { filename: 'icon-192.png', size: 192 },
  { filename: 'icon-512.png', size: 512 },
  // Maskable: leaves ~20% safe area around the logo so Android's
  // adaptive-icon crop doesn't chop off important detail.
  { filename: 'icon-maskable-512.png', size: 512, maskable: true },
];

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const meta = await sharp(SOURCE).metadata();
  console.log(`Source: ${meta.width}x${meta.height}`);

  for (const spec of ICONS) {
    const outPath = join(OUT_DIR, spec.filename);
    if (spec.maskable) {
      // Render the logo at 60% of the canvas, centered on a dark background
      // matching the app theme. That gives ~20% safe-area on each edge.
      const inner = Math.round(spec.size * 0.6);
      const innerBuffer = await sharp(SOURCE)
        .resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toBuffer();
      await sharp({
        create: {
          width: spec.size,
          height: spec.size,
          channels: 4,
          background: { r: 10, g: 14, b: 23, alpha: 1 }, // matches #0a0e17
        },
      })
        .composite([{ input: innerBuffer, gravity: 'center' }])
        .png()
        .toFile(outPath);
    } else {
      await sharp(SOURCE)
        .resize(spec.size, spec.size, {
          fit: 'contain',
          background: { r: 10, g: 14, b: 23, alpha: 1 }, // #0a0e17 fill behind transparent
        })
        .png()
        .toFile(outPath);
    }
    console.log(`  wrote ${outPath} (${spec.size}x${spec.size}${spec.maskable ? ' maskable' : ''})`);
  }

  // favicon.ico — sharp can't write ICO multi-resolution natively, but a
  // 32x32 PNG renamed to .ico is widely supported by every browser since
  // ~2016 and Next.js handles app/favicon.ico cleanly.
  const ico32 = await sharp(SOURCE)
    .resize(32, 32, {
      fit: 'contain',
      background: { r: 10, g: 14, b: 23, alpha: 1 },
    })
    .png()
    .toBuffer();
  await writeFile('public/favicon.ico', ico32);
  console.log('  wrote public/favicon.ico (32x32 PNG)');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
