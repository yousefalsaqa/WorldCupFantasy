import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import IosInstallPrompt from '@/components/ios-install-prompt';
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
        {children}
        <IosInstallPrompt />
      </body>
    </html>
  );
}
