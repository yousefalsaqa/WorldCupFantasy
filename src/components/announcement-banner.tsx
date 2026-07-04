'use client';

import { useEffect, useState } from 'react';
import { Megaphone, X } from 'lucide-react';

// Site-wide announcement strip shown under the nav on every dashboard page.
// Dismissal is per-announcement (localStorage key includes the id), so
// changing ANNOUNCEMENT_ID re-shows the banner to everyone for the next news.
// Set ANNOUNCEMENT to null to hide the strip entirely.
const ANNOUNCEMENT_ID = 'budget-105';
const ANNOUNCEMENT: string | null =
  'Budget increased to £105m — every team’s bank just got +£5.0m for the knockout rounds.';

export default function AnnouncementBanner() {
  // Start hidden and reveal after the localStorage check so a dismissed
  // banner never flashes on load (SSR can't read localStorage).
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!ANNOUNCEMENT) return;
    try {
      if (localStorage.getItem(`announce-dismissed-${ANNOUNCEMENT_ID}`) !== '1') {
        setVisible(true);
      }
    } catch {
      setVisible(true);
    }
  }, []);

  if (!ANNOUNCEMENT || !visible) return null;

  const dismiss = () => {
    setVisible(false);
    try {
      localStorage.setItem(`announce-dismissed-${ANNOUNCEMENT_ID}`, '1');
    } catch {
      /* private browsing — banner just reappears next visit */
    }
  };

  return (
    <div className="relative z-10 px-4 md:px-6 pt-3">
      <div className="max-w-6xl mx-auto flex items-center gap-2 rounded-lg border border-emerald-400/25 bg-gradient-to-r from-emerald-500/15 to-teal-500/10 px-3 py-1.5">
        <Megaphone className="w-3.5 h-3.5 shrink-0 text-emerald-300" />
        <p className="flex-1 text-xs text-emerald-100/90 font-medium">{ANNOUNCEMENT}</p>
        <button
          onClick={dismiss}
          aria-label="Dismiss announcement"
          className="shrink-0 p-1 rounded-md text-emerald-200/60 hover:text-white hover:bg-white/10 transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
