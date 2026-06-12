import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import IosInstallPrompt from '@/components/ios-install-prompt';
import SplashRemover from '@/components/splash-remover';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'World Cup 2026 Fantasy',
  description: 'Build your dream World Cup squad and compete with friends!',
  keywords: ['world cup', 'fantasy', 'football', 'soccer', '2026'],
  manifest: '/manifest.json',
  applicationName: 'WC26 Fantasy',
  appleWebApp: {
    capable: true,
    title: 'WC26 Fantasy',
    statusBarStyle: 'black-translucent',
    // Native iOS launch screens (logo on #0a0e17). iOS ignores the
    // manifest background_color for home-screen apps; without these the
    // moment between tapping the icon and our HTML splash arriving is a
    // blank screen. Files come from scripts/generate-splash.ts — iOS
    // matches on EXACT device-width/height + pixel ratio, hence one
    // entry per screen size. Portrait only (manifest locks orientation).
    startupImage: [
      { url: '/splash/splash-1320x2868.png', media: '(device-width: 440px) and (device-height: 956px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)' },
      { url: '/splash/splash-1290x2796.png', media: '(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)' },
      { url: '/splash/splash-1284x2778.png', media: '(device-width: 428px) and (device-height: 926px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)' },
      { url: '/splash/splash-1242x2688.png', media: '(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)' },
      { url: '/splash/splash-828x1792.png', media: '(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)' },
      { url: '/splash/splash-1206x2622.png', media: '(device-width: 402px) and (device-height: 874px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)' },
      { url: '/splash/splash-1179x2556.png', media: '(device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)' },
      { url: '/splash/splash-1170x2532.png', media: '(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)' },
      { url: '/splash/splash-1125x2436.png', media: '(device-width: 375px) and (device-height: 812px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)' },
      { url: '/splash/splash-750x1334.png', media: '(device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)' },
    ],
  },
  icons: {
    icon: [
      { url: '/icons/favicon-16.png', sizes: '16x16', type: 'image/png' },
      { url: '/icons/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    shortcut: '/favicon.ico',
    apple: '/icons/apple-touch-icon.png',
  },
  formatDetection: {
    telephone: false,
  },
};

// Separate viewport export (required by Next 14.x). themeColor here is what
// iOS Safari uses to tint the address bar / app status bar.
export const viewport: Viewport = {
  themeColor: '#0a0e17',
  width: 'device-width',
  initialScale: 1,
  // viewportFit cover lets the app render under the iPhone notch / home
  // indicator when launched from the home screen as a PWA.
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        {/* Static splash – rendered as part of the initial HTML so it appears
         * the instant the page is parsed, long before the React bundle
         * finishes downloading and hydrating. <SplashRemover /> tears this
         * down once the real app paints. */}
        <div id="app-splash" aria-hidden="true">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            id="app-splash__logo"
            src="/icons/apple-touch-icon.png"
            alt=""
            width={96}
            height={96}
          />
          <div id="app-splash__spinner" />
          <div id="app-splash__label">Loading</div>
        </div>
        {children}
        <IosInstallPrompt />
        <SplashRemover />
      </body>
    </html>
  );
}
