/**
 * Generate iOS PWA startup (splash) images from the source logo.
 * Run with:  npx tsx scripts/generate-splash.ts
 *
 * iOS ignores manifest.json's background_color for home-screen apps and
 * instead wants per-device-resolution <link rel="apple-touch-startup-image">
 * PNGs. Without them the launch screen is blank (the "black screen" before
 * our HTML splash arrives). These render the logo centered on the app
 * background (#0a0e17) so launch feels branded and instant.
 *
 * Outputs into public/splash/ — committed to the repo so deploy is
 * deterministic and we don't depend on sharp at build time. The matching
 * media queries live in src/app/layout.tsx (appleWebApp.startupImage).
 */

import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const SOURCE = 'public/logo-source.png';
const OUT_DIR = 'public/splash';

interface SplashSpec {
  /** CSS points, portrait */
  cssWidth: number;
  cssHeight: number;
  dpr: 2 | 3;
  devices: string;
}

// Portrait-only (manifest locks orientation to portrait). Pixel size =
// css * dpr. iOS matches on EXACT device-width/height + pixel ratio, so
// each distinct screen needs its own file.
const SPLASHES: SplashSpec[] = [
  { cssWidth: 440, cssHeight: 956, dpr: 3, devices: 'iPhone 16 Pro Max' },
  { cssWidth: 430, cssHeight: 932, dpr: 3, devices: 'iPhone 15 Pro Max / 15 Plus / 14 Pro Max' },
  { cssWidth: 428, cssHeight: 926, dpr: 3, devices: 'iPhone 14 Plus / 13 Pro Max / 12 Pro Max' },
  { cssWidth: 414, cssHeight: 896, dpr: 3, devices: 'iPhone 11 Pro Max / XS Max' },
  { cssWidth: 414, cssHeight: 896, dpr: 2, devices: 'iPhone 11 / XR' },
  { cssWidth: 402, cssHeight: 874, dpr: 3, devices: 'iPhone 16 Pro' },
  { cssWidth: 393, cssHeight: 852, dpr: 3, devices: 'iPhone 16 / 15 / 15 Pro / 14 Pro' },
  { cssWidth: 390, cssHeight: 844, dpr: 3, devices: 'iPhone 14 / 13 / 13 Pro / 12 / 12 Pro' },
  { cssWidth: 375, cssHeight: 812, dpr: 3, devices: 'iPhone 13 mini / 12 mini / 11 Pro / XS / X' },
  { cssWidth: 375, cssHeight: 667, dpr: 2, devices: 'iPhone SE (2nd/3rd gen) / 8 / 7 / 6s' },
];

// Matches the app theme + manifest background_color.
const BG = { r: 10, g: 14, b: 23, alpha: 1 }; // #0a0e17

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  for (const spec of SPLASHES) {
    const w = spec.cssWidth * spec.dpr;
    const h = spec.cssHeight * spec.dpr;
    const filename = `splash-${w}x${h}.png`;

    // Logo at ~32% of screen width, centered — same proportion as the
    // in-HTML #app-splash so the native → HTML splash handoff is seamless.
    const logoSize = Math.round(w * 0.32);
    const logo = await sharp(SOURCE)
      .resize(logoSize, logoSize, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toBuffer();

    await sharp({
      create: { width: w, height: h, channels: 4, background: BG },
    })
      .composite([{ input: logo, gravity: 'center' }])
      .png({ compressionLevel: 9 })
      .toFile(join(OUT_DIR, filename));

    console.log(`  wrote ${OUT_DIR}/${filename}  (${spec.devices})`);
  }

  console.log('\nDone. Link tags are declared in src/app/layout.tsx via appleWebApp.startupImage.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
