'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Kit, { PlayerCard, EmptySlot } from '@/components/kit';
import PitchBg from '@/components/pitch-bg';
import FormationPicker from '@/components/formation-picker';
import { getFlagUrl } from '@/lib/flags';
import { getFixtureDifficulty } from '@/lib/fdr';
import { useUnsavedChanges } from '@/contexts/unsaved-changes';
import { ArrowLeftRight, RotateCcw } from 'lucide-react';
import { useUserTimezone, useNow } from '@/hooks/useTimezone';
import {
  formatDateShort,
  formatTime,
  formatCountdown as fmtCountdown,
  formatDuration,
  deadlineFor,
  parseFixtureDateTime,
} from '@/lib/format-time';
import { Trophy, Wallet, Coins, Sparkles, Zap, RefreshCw, Crown, Users, Save, X, Search, Wand2 } from 'lucide-react';

// Chips
interface ChipData {
  id: string;
  name: string;
  description: string;
  used: boolean;
  available: boolean;
  active: boolean;
  canCancel?: boolean;
  cancelBlockedReason?: string;
}

// Types
interface Nation {
  id: string;
  name: string;
  code: string;
  kitColor1: string;
  kitColor2: string;
}

interface Player {
  id: string;
  displayName: string;
  position: string;
  currentPrice: number;
  shirtNumber: number | null;
  nation: Nation;
  isStarting?: boolean;
  isCaptain?: boolean;
  isViceCaptain?: boolean;
  points?: number;
  stats?: {
    goals: number;
    assists: number;
    passAccuracy: number;
    interceptions: number;
    tackles: number;
    dribbles: number;
  };
}

type Position = 'GK' | 'DEF' | 'MID' | 'FWD';

// World Cup 2026 Fixtures (Group Stage)
interface Fixture {
  id: string;
  home: string;
  away: string;
  date: string;
  time: string;
  stage: string;
  isPlayed?: boolean;
  homeScore?: number;
  awayScore?: number;
  // Player-specific stats (populated when viewing a player's fixtures)
  playerGoals?: number;
  playerAssists?: number;
  playerPoints?: number;
  playerMinutes?: number;
  playerSubbedOff?: boolean;
}

const WORLD_CUP_FIXTURES: Fixture[] = [
  // Group A — Mexico, South Africa, South Korea, Czechia
  { id: '1', home: 'MEX', away: 'RSA', date: '2026-06-11', time: '20:00', stage: 'Group A' },
  { id: '2', home: 'KOR', away: 'CZE', date: '2026-06-12', time: '14:00', stage: 'Group A' },
  { id: '3', home: 'RSA', away: 'KOR', date: '2026-06-16', time: '14:00', stage: 'Group A' },
  { id: '4', home: 'CZE', away: 'MEX', date: '2026-06-16', time: '17:00', stage: 'Group A' },
  { id: '5', home: 'MEX', away: 'KOR', date: '2026-06-20', time: '17:00', stage: 'Group A' },
  { id: '6', home: 'CZE', away: 'RSA', date: '2026-06-20', time: '17:00', stage: 'Group A' },
  // Group B — Canada, Bosnia & Herzegovina, Qatar, Switzerland
  { id: '7', home: 'CAN', away: 'QAT', date: '2026-06-12', time: '17:00', stage: 'Group B' },
  { id: '8', home: 'SUI', away: 'BIH', date: '2026-06-12', time: '20:00', stage: 'Group B' },
  { id: '9', home: 'QAT', away: 'SUI', date: '2026-06-17', time: '14:00', stage: 'Group B' },
  { id: '10', home: 'BIH', away: 'CAN', date: '2026-06-17', time: '17:00', stage: 'Group B' },
  { id: '11', home: 'CAN', away: 'SUI', date: '2026-06-21', time: '14:00', stage: 'Group B' },
  { id: '12', home: 'BIH', away: 'QAT', date: '2026-06-21', time: '14:00', stage: 'Group B' },
  // Group C — Brazil, Morocco, Haiti, Scotland
  { id: '13', home: 'BRA', away: 'MAR', date: '2026-06-13', time: '14:00', stage: 'Group C' },
  { id: '14', home: 'HAI', away: 'SCO', date: '2026-06-13', time: '17:00', stage: 'Group C' },
  { id: '15', home: 'MAR', away: 'HAI', date: '2026-06-18', time: '14:00', stage: 'Group C' },
  { id: '16', home: 'SCO', away: 'BRA', date: '2026-06-18', time: '17:00', stage: 'Group C' },
  { id: '17', home: 'BRA', away: 'HAI', date: '2026-06-23', time: '17:00', stage: 'Group C' },
  { id: '18', home: 'SCO', away: 'MAR', date: '2026-06-23', time: '17:00', stage: 'Group C' },
  // Group D — USA, Paraguay, Australia, Türkiye
  { id: '19', home: 'USA', away: 'PAR', date: '2026-06-13', time: '20:00', stage: 'Group D' },
  { id: '20', home: 'AUS', away: 'TUR', date: '2026-06-14', time: '14:00', stage: 'Group D' },
  { id: '21', home: 'PAR', away: 'AUS', date: '2026-06-18', time: '20:00', stage: 'Group D' },
  { id: '22', home: 'TUR', away: 'USA', date: '2026-06-19', time: '14:00', stage: 'Group D' },
  { id: '23', home: 'USA', away: 'AUS', date: '2026-06-23', time: '20:00', stage: 'Group D' },
  { id: '24', home: 'TUR', away: 'PAR', date: '2026-06-23', time: '20:00', stage: 'Group D' },
  // Group E — Germany, Curaçao, Ivory Coast, Ecuador
  { id: '25', home: 'GER', away: 'CUW', date: '2026-06-14', time: '14:00', stage: 'Group E' },
  { id: '26', home: 'CIV', away: 'ECU', date: '2026-06-14', time: '17:00', stage: 'Group E' },
  { id: '27', home: 'ECU', away: 'GER', date: '2026-06-19', time: '14:00', stage: 'Group E' },
  { id: '28', home: 'CUW', away: 'CIV', date: '2026-06-19', time: '17:00', stage: 'Group E' },
  { id: '29', home: 'GER', away: 'CIV', date: '2026-06-24', time: '17:00', stage: 'Group E' },
  { id: '30', home: 'ECU', away: 'CUW', date: '2026-06-24', time: '17:00', stage: 'Group E' },
  // Group F — Netherlands, Japan, Sweden, Tunisia
  { id: '31', home: 'NED', away: 'JPN', date: '2026-06-14', time: '20:00', stage: 'Group F' },
  { id: '32', home: 'TUN', away: 'SWE', date: '2026-06-15', time: '14:00', stage: 'Group F' },
  { id: '33', home: 'JPN', away: 'TUN', date: '2026-06-19', time: '20:00', stage: 'Group F' },
  { id: '34', home: 'SWE', away: 'NED', date: '2026-06-20', time: '14:00', stage: 'Group F' },
  { id: '35', home: 'NED', away: 'TUN', date: '2026-06-24', time: '20:00', stage: 'Group F' },
  { id: '36', home: 'SWE', away: 'JPN', date: '2026-06-24', time: '20:00', stage: 'Group F' },
  // Group G — Belgium, Egypt, Iran, New Zealand
  { id: '37', home: 'BEL', away: 'EGY', date: '2026-06-15', time: '17:00', stage: 'Group G' },
  { id: '38', home: 'IRN', away: 'NZL', date: '2026-06-15', time: '20:00', stage: 'Group G' },
  { id: '39', home: 'EGY', away: 'IRN', date: '2026-06-20', time: '17:00', stage: 'Group G' },
  { id: '40', home: 'NZL', away: 'BEL', date: '2026-06-20', time: '20:00', stage: 'Group G' },
  { id: '41', home: 'BEL', away: 'IRN', date: '2026-06-25', time: '14:00', stage: 'Group G' },
  { id: '42', home: 'NZL', away: 'EGY', date: '2026-06-25', time: '14:00', stage: 'Group G' },
  // Group H — Spain, Cabo Verde, Saudi Arabia, Uruguay
  { id: '43', home: 'ESP', away: 'CPV', date: '2026-06-16', time: '14:00', stage: 'Group H' },
  { id: '44', home: 'KSA', away: 'URU', date: '2026-06-16', time: '17:00', stage: 'Group H' },
  { id: '45', home: 'URU', away: 'ESP', date: '2026-06-21', time: '14:00', stage: 'Group H' },
  { id: '46', home: 'CPV', away: 'KSA', date: '2026-06-21', time: '17:00', stage: 'Group H' },
  { id: '47', home: 'ESP', away: 'KSA', date: '2026-06-26', time: '14:00', stage: 'Group H' },
  { id: '48', home: 'URU', away: 'CPV', date: '2026-06-26', time: '14:00', stage: 'Group H' },
  // Group I — France, Senegal, Iraq, Norway
  { id: '49', home: 'FRA', away: 'SEN', date: '2026-06-16', time: '20:00', stage: 'Group I' },
  { id: '50', home: 'NOR', away: 'IRQ', date: '2026-06-17', time: '14:00', stage: 'Group I' },
  { id: '51', home: 'SEN', away: 'NOR', date: '2026-06-21', time: '20:00', stage: 'Group I' },
  { id: '52', home: 'IRQ', away: 'FRA', date: '2026-06-22', time: '14:00', stage: 'Group I' },
  { id: '53', home: 'FRA', away: 'NOR', date: '2026-06-26', time: '20:00', stage: 'Group I' },
  { id: '54', home: 'IRQ', away: 'SEN', date: '2026-06-26', time: '20:00', stage: 'Group I' },
  // Group J — Argentina, Algeria, Austria, Jordan
  { id: '55', home: 'ARG', away: 'ALG', date: '2026-06-17', time: '17:00', stage: 'Group J' },
  { id: '56', home: 'AUT', away: 'JOR', date: '2026-06-17', time: '20:00', stage: 'Group J' },
  { id: '57', home: 'ALG', away: 'AUT', date: '2026-06-22', time: '14:00', stage: 'Group J' },
  { id: '58', home: 'ARG', away: 'JOR', date: '2026-06-22', time: '17:00', stage: 'Group J' },
  { id: '59', home: 'JOR', away: 'ALG', date: '2026-06-27', time: '14:00', stage: 'Group J' },
  { id: '60', home: 'AUT', away: 'ARG', date: '2026-06-27', time: '14:00', stage: 'Group J' },
  // Group K — Portugal, DR Congo, Uzbekistan, Colombia
  { id: '61', home: 'POR', away: 'UZB', date: '2026-06-18', time: '14:00', stage: 'Group K' },
  { id: '62', home: 'COL', away: 'COD', date: '2026-06-18', time: '17:00', stage: 'Group K' },
  { id: '63', home: 'UZB', away: 'COL', date: '2026-06-23', time: '14:00', stage: 'Group K' },
  { id: '64', home: 'COD', away: 'POR', date: '2026-06-23', time: '17:00', stage: 'Group K' },
  { id: '65', home: 'POR', away: 'COL', date: '2026-06-28', time: '17:00', stage: 'Group K' },
  { id: '66', home: 'COD', away: 'UZB', date: '2026-06-28', time: '17:00', stage: 'Group K' },
  // Group L — England, Croatia, Ghana, Panama
  { id: '67', home: 'ENG', away: 'CRO', date: '2026-06-18', time: '20:00', stage: 'Group L' },
  { id: '68', home: 'GHA', away: 'PAN', date: '2026-06-19', time: '14:00', stage: 'Group L' },
  { id: '69', home: 'CRO', away: 'GHA', date: '2026-06-23', time: '20:00', stage: 'Group L' },
  { id: '70', home: 'PAN', away: 'ENG', date: '2026-06-24', time: '14:00', stage: 'Group L' },
  { id: '71', home: 'ENG', away: 'GHA', date: '2026-06-28', time: '20:00', stage: 'Group L' },
  { id: '72', home: 'CRO', away: 'PAN', date: '2026-06-28', time: '20:00', stage: 'Group L' },
];

// Nation names for display – all 48 qualified nations
const NATION_NAMES: Record<string, string> = {
  // Group A
  MEX: 'Mexico', RSA: 'South Africa', KOR: 'Korea Republic', CZE: 'Czechia',
  // Group B
  CAN: 'Canada', BIH: 'Bosnia & Herzegovina', QAT: 'Qatar', SUI: 'Switzerland',
  // Group C
  BRA: 'Brazil', MAR: 'Morocco', HAI: 'Haiti', SCO: 'Scotland',
  // Group D
  USA: 'USA', PAR: 'Paraguay', AUS: 'Australia', TUR: 'Türkiye',
  // Group E
  GER: 'Germany', CUW: 'Curaçao', CIV: 'Ivory Coast', ECU: 'Ecuador',
  // Group F
  NED: 'Netherlands', JPN: 'Japan', SWE: 'Sweden', TUN: 'Tunisia',
  // Group G
  BEL: 'Belgium', EGY: 'Egypt', IRN: 'Iran', NZL: 'New Zealand',
  // Group H
  ESP: 'Spain', CPV: 'Cabo Verde', KSA: 'Saudi Arabia', URU: 'Uruguay',
  // Group I
  FRA: 'France', SEN: 'Senegal', IRQ: 'Iraq', NOR: 'Norway',
  // Group J
  ARG: 'Argentina', ALG: 'Algeria', AUT: 'Austria', JOR: 'Jordan',
  // Group K
  POR: 'Portugal', COD: 'DR Congo', UZB: 'Uzbekistan', COL: 'Colombia',
  // Group L
  ENG: 'England', CRO: 'Croatia', GHA: 'Ghana', PAN: 'Panama',
};

// Get fixtures for a nation
function getNationFixtures(nationCode: string): Fixture[] {
  return WORLD_CUP_FIXTURES.filter(f => f.home === nationCode || f.away === nationCode)
    .sort(
      (a, b) =>
        parseFixtureDateTime(a.date, a.time).getTime() -
        parseFixtureDateTime(b.date, b.time).getTime(),
    );
}

// Get next opponent for a nation (first upcoming unplayed game)
function getNextOpponent(nationCode: string): string {
  const now = new Date();
  const fixtures = getNationFixtures(nationCode);
  
  // Find the next unplayed game
  const nextFixture = fixtures.find(f => {
    const fixtureDate = parseFixtureDateTime(f.date, f.time);
    return fixtureDate > now && !f.isPlayed;
  });
  
  if (!nextFixture) {
    // If no upcoming games, show last opponent or dash
    const lastFixture = fixtures[fixtures.length - 1];
    if (lastFixture) {
      const opponent = lastFixture.home === nationCode ? lastFixture.away : lastFixture.home;
      return opponent;
    }
    return '-';
  }
  
  const opponent = nextFixture.home === nationCode ? nextFixture.away : nextFixture.home;
  return opponent;
}

// Format a calendar date string (YYYY-MM-DD) for display. We anchor at noon
// to dodge timezone off-by-one errors — at midnight a UTC-shifted client can
// see "May 31" for "June 1" depending on the user's chosen zone.
function formatFixtureDate(dateStr: string, tz?: string): string {
  const date = new Date(dateStr + 'T12:00:00');
  return formatDateShort(date, tz);
}

// Position limits
const POSITION_LIMITS: Record<Position, number> = { GK: 2, DEF: 5, MID: 5, FWD: 3 };
const MAX_PER_NATION = 3;

export default function SquadPage() {
  const router = useRouter();
  const { setDirty, forceClean } = useUnsavedChanges();
  // Reactive timezone + per-minute clock — drives the deadline tile, fixture
  // dates and chip countdowns so they all stay in lockstep when the user
  // changes their preferred zone.
  const { timezone } = useUserTimezone();
  const now = useNow(60_000);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<'loading' | 'builder' | 'view'>('loading');

  // Local helpers to mark/unmark unsaved changes – wired into the layout-level
  // confirmation modal so users don't silently lose work when navigating away.
  const markDirty = useCallback(
    (label?: string) => setDirty(true, label),
    [setDirty]
  );
  const markClean = useCallback(() => setDirty(false), [setDirty]);

  // Always clean up the dirty flag if this page unmounts (e.g. after the user
  // confirmed leaving). Belt and suspenders – the modal already clears it.
  useEffect(() => {
    return () => setDirty(false);
  }, [setDirty]);
  
  // All available players (for builder)
  const [allPlayers, setAllPlayers] = useState<Player[]>([]);
  
  // Squad state
  const [squad, setSquad] = useState<Player[]>([]);
  const [startingXI, setStartingXI] = useState<Player[]>([]);
  const [bench, setBench] = useState<Player[]>([]);
  const [captainId, setCaptainId] = useState<string | null>(null);
  const [viceCaptainId, setViceCaptainId] = useState<string | null>(null);
  const [bankBalance, setBankBalance] = useState(100);
  const [teamValue, setTeamValue] = useState(0);
  const [formation, setFormation] = useState('4-4-2');
  
  // Builder state
  const [showModal, setShowModal] = useState(false);
  const [selectingPosition, setSelectingPosition] = useState<Position | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'price' | 'name'>('price');

  // View mode state
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [playerToSub, setPlayerToSub] = useState<Player | null>(null);

  // Transfer mode state
  //
  // Transfer mode is a sub-state of "view" mode — the team is built and we're
  // mid-tournament. Toggling `transferMode` switches the squad page to a
  // 15-on-pitch layout where users swap players via a picker. Until the user
  // confirms or discards, the underlying `squad` array is untouched; the
  // pending transfers live in `pendingTransfers` and are projected onto the
  // display via `transferDisplaySquad` below.
  const [transferMode, setTransferMode] = useState(false);
  const [freeTransfers, setFreeTransfers] = useState(0);
  const [pendingTransfers, setPendingTransfers] = useState<
    Array<{ playerOut: Player; playerIn: Player }>
  >([]);
  // The squad player the user just tapped Replace on. Drives the picker
  // modal's position filter and refund math. Distinct from `selectedPlayer`
  // (view-mode player detail) and `selectingPosition` (builder slot).
  const [transferReplacingFor, setTransferReplacingFor] = useState<Player | null>(null);
  const [transferSubmitting, setTransferSubmitting] = useState(false);
  const [transferError, setTransferError] = useState<string | null>(null);
  // True when the user has tapped Discard but we're waiting for confirmation.
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false);

  // Chips state
  const [chips, setChips] = useState<ChipData[]>([]);
  const [chipConfirm, setChipConfirm] = useState<ChipData | null>(null);
  const [chipCancelConfirm, setChipCancelConfirm] = useState<ChipData | null>(null);
  const [chipLoading, setChipLoading] = useState(false);
  const [chipDeadline, setChipDeadline] = useState<string | null>(null);
  const [stageLocked, setStageLocked] = useState(false);

  const fetchChips = useCallback(async () => {
    try {
      const res = await fetch('/api/chips', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setChips(data.chips || []);
        setChipDeadline(data.deadlineTime ?? null);
        setStageLocked(Boolean(data.stageLocked));
      }
    } catch (err) {
      console.error('Failed to fetch chips:', err);
    }
  }, []);

  useEffect(() => {
    if (mode === 'view') fetchChips();
  }, [mode, fetchChips]);

  // The `now` value above (via useNow(60_000)) drives both the squad
  // deadline tile and the chip countdowns, so we don't need a second timer
  // here. 60s granularity is fine — chip cards show "Locks in 2h 5m", not
  // seconds, so a more frequent tick would just burn battery.

  const activateChip = async (chipId: string) => {
    setChipLoading(true);
    try {
      const res = await fetch('/api/chips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ chipId }),
      });
      if (res.ok) {
        await fetchChips();
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.error || `Failed to activate chip (status ${res.status})`);
      }
    } catch (err) {
      console.error('Activate chip error:', err);
      alert('Failed to activate chip \u2013 check your connection and try again.');
    } finally {
      setChipLoading(false);
      setChipConfirm(null);
    }
  };

  const cancelActiveChip = async () => {
    setChipLoading(true);
    const cancellingId = chipCancelConfirm?.id;
    try {
      const res = await fetch('/api/chips', {
        method: 'DELETE',
        credentials: 'include',
      });
      if (res.ok) {
        // Free Hit cancellation reverts squad + bank + transfers, so reload to
        // resync. forceClean() removes the beforeunload guard synchronously
        // (state updates are async, which previously made the reload silently
        // abort if the user had any unsaved squad change).
        if (cancellingId === 'FREE_HIT') {
          forceClean();
          window.location.reload();
          return;
        }
        await fetchChips();
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.error || `Failed to cancel chip (status ${res.status})`);
      }
    } catch (err) {
      console.error('Cancel chip error:', err);
      alert('Failed to cancel chip \u2013 check your connection and try again.');
    } finally {
      setChipLoading(false);
      setChipCancelConfirm(null);
    }
  };

  // Prevent body scroll when modal is open. Keep this minimal – the previous
  // position:fixed + scroll-restore dance was a known iOS Safari freeze trigger.
  useEffect(() => {
    if (!selectedPlayer) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [selectedPlayer]);

  // Fetch data
  useEffect(() => {
    let cancelled = false;
    // Manual timeout via AbortController (AbortSignal.timeout not supported on older iOS Safari)
    const ctrl = new AbortController();
    const timeoutId = setTimeout(() => ctrl.abort(), 20000);

    async function fetchWithRetry(url: string, init?: RequestInit, retries = 1): Promise<Response> {
      try {
        return await fetch(url, { ...init, signal: ctrl.signal });
      } catch (err) {
        if (retries > 0 && !cancelled) {
          await new Promise(r => setTimeout(r, 800));
          return fetchWithRetry(url, init, retries - 1);
        }
        throw err;
      }
    }

    async function fetchData() {
      setLoadError(null);
      try {
        // Only block on the squad endpoint. /api/players (~204 records) is
        // only used by the builder-mode picker and the transfer flow, so
        // there's no reason to delay first paint on it. We kick off the
        // players fetch in the background after the squad arrives, and
        // also lazy-fetch on demand if the user opens the picker first.
        const squadRes = await fetchWithRetry('/api/squad/get', { credentials: 'include' });
        if (cancelled) return;

        if (squadRes.ok) {
          const squadData = await squadRes.json();
          if (cancelled) return;

          if (squadData.squad && squadData.squad.length === 15) {
            // User has complete squad - VIEW mode
            setBankBalance(squadData.bankBalance || 0);
            setTeamValue(squadData.teamValue || 0);
            // Capture free transfers so the transfer mode UI can show the
            // correct "X free transfers" badge. The API may not return this
            // pre-tournament — fall back to 0 in that case.
            setFreeTransfers(squadData.freeTransfers ?? 0);
            
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const players: Player[] = squadData.squad.map((sp: any) => ({
              id: sp.player.id,
              displayName: sp.player.displayName,
              position: sp.player.position,
              currentPrice: sp.purchasePrice || sp.player.currentPrice,
              shirtNumber: sp.player.shirtNumber,
              nation: sp.player.nation,
              isStarting: sp.isStarting,
              isCaptain: sp.isCaptain,
              isViceCaptain: sp.isViceCaptain,
              points: sp.points || 0,
              stats: sp.stats || {
                goals: 0,
                assists: 0,
                passAccuracy: 0,
                interceptions: 0,
                tackles: 0,
                dribbles: 0,
              },
            }));
            
            setSquad(players);
            const starting = players.filter(p => p.isStarting);
            setStartingXI(starting);
            setBench(players.filter(p => !p.isStarting));
            
            // Set formation based on starting XI
            const defs = starting.filter(p => p.position === 'DEF').length;
            const mids = starting.filter(p => p.position === 'MID').length;
            const fwds = starting.filter(p => p.position === 'FWD').length;
            setFormation(`${defs}-${mids}-${fwds}`);
            
            const captain = players.find(p => p.isCaptain);
            const vice = players.find(p => p.isViceCaptain);
            if (captain) setCaptainId(captain.id);
            if (vice) setViceCaptainId(vice.id);
            
            setMode('view');
          } else if (squadData.squad && squadData.squad.length > 0) {
            // Partial squad - BUILDER mode with existing players
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const players: Player[] = squadData.squad.map((sp: any) => ({
              id: sp.player.id,
              displayName: sp.player.displayName,
              position: sp.player.position,
              currentPrice: sp.purchasePrice || sp.player.currentPrice,
              shirtNumber: sp.player.shirtNumber,
              nation: sp.player.nation,
            }));
            setSquad(players);
            setBankBalance(squadData.bankBalance || 100);
            setMode('builder');
          } else {
            // No squad - BUILDER mode
            setMode('builder');
          }
        } else {
          setMode('builder');
        }

        // Kick off the players fetch in the background. Doesn't block render.
        // Builder mode needs it for the picker; view mode never needs it.
        if (!cancelled) {
          fetchWithRetry('/api/players')
            .then(async (res) => {
              if (!cancelled && res.ok) {
                const data = await res.json();
                const players = Array.isArray(data) ? data : (data.players || []);
                if (!cancelled) setAllPlayers(players);
              }
            })
            .catch(() => { /* non-fatal: picker will lazy-fetch if needed */ });
        }
      } catch (error) {
        if (cancelled) return;
        console.error('Failed to fetch data:', error);
        const aborted = (error as Error)?.name === 'AbortError';
        setLoadError(
          aborted
            ? 'The request took too long. Tap retry.'
            : 'Could not load your squad. Check your connection and try again.'
        );
      } finally {
        clearTimeout(timeoutId);
        if (!cancelled) setLoading(false);
      }
    }
    fetchData();

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
      ctrl.abort();
    };
  }, [loadAttempt]);

  // Calculate squad stats
  const squadValue = useMemo(() => squad.reduce((sum, p) => sum + p.currentPrice, 0), [squad]);
  const remainingBudget = useMemo(() => 100 - squadValue, [squadValue]);
  
  const positionCounts = useMemo(() => {
    const counts: Record<Position, number> = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
    squad.forEach(p => counts[p.position as Position]++);
    return counts;
  }, [squad]);

  const nationCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    squad.forEach(p => {
      counts[p.nation?.id || ''] = (counts[p.nation?.id || ''] || 0) + 1;
    });
    return counts;
  }, [squad]);

  // ============================================
  // TRANSFER MODE — derived state
  // ============================================
  //
  // The "display squad" projects pending transfers onto the current 15-man
  // roster: each outgoing player is swapped for its incoming counterpart so
  // the pitch reflects what the team WILL look like after Confirm. Outgoing
  // players keep their slot but visually fade; we render the replacements
  // with an amber glow + Undo button instead.
  const transferDisplaySquad = useMemo(() => {
    if (!transferMode) return squad;
    return squad.map((sp) => {
      const t = pendingTransfers.find((pt) => pt.playerOut.id === sp.id);
      if (!t) return sp;
      // Project the incoming player onto the slot. We re-stamp `currentPrice`
      // as the *new* player's price so budget math downstream is correct;
      // `purchasePrice` (refund) stays on the original via t.playerOut.
      return { ...t.playerIn };
    });
  }, [transferMode, squad, pendingTransfers]);

  // True iff the given slot is showing an incoming pending transfer. Drives
  // the amber glow border and the Replace ↔ Undo button switch.
  const isPendingIncoming = useCallback(
    (playerId: string) =>
      pendingTransfers.some((t) => t.playerIn.id === playerId),
    [pendingTransfers],
  );

  const findOutgoingFor = useCallback(
    (incomingPlayerId: string) =>
      pendingTransfers.find((t) => t.playerIn.id === incomingPlayerId)
        ?.playerOut ?? null,
    [pendingTransfers],
  );

  // Net £m change after pending transfers. World Cup uses fixed prices so the
  // refund equals the original purchase price — same rule as the legacy
  // /transfers page.
  const transferBudgetImpact = useMemo(() => {
    let change = 0;
    for (const t of pendingTransfers) {
      change += t.playerOut.currentPrice - t.playerIn.currentPrice;
    }
    return change;
  }, [pendingTransfers]);

  const projectedBank = bankBalance + transferBudgetImpact;

  // Points hit cost = (transfers beyond freeTransfers) × 4. Matches the
  // server-side rule in /api/transfers.
  const transferHitCost = useMemo(() => {
    const extra = Math.max(0, pendingTransfers.length - freeTransfers);
    return extra * 4;
  }, [pendingTransfers.length, freeTransfers]);

  // Nation counts after applying pending transfers, used by the picker to
  // grey out players who would breach the 3-per-nation cap. We start from
  // the CURRENT squad minus outs, then add ins.
  const projectedNationCounts = useMemo(() => {
    const out = new Set(pendingTransfers.map((t) => t.playerOut.id));
    const counts: Record<string, number> = {};
    squad.forEach((p) => {
      if (out.has(p.id)) return;
      const k = p.nation?.id || '';
      counts[k] = (counts[k] || 0) + 1;
    });
    pendingTransfers.forEach((t) => {
      const k = t.playerIn.nation?.id || '';
      counts[k] = (counts[k] || 0) + 1;
    });
    return counts;
  }, [squad, pendingTransfers]);

  // Keep the unsaved-changes guard in sync with pending transfers so the
  // user can't accidentally navigate away mid-flow.
  useEffect(() => {
    if (transferMode && pendingTransfers.length > 0) {
      setDirty(
        true,
        `You have ${pendingTransfers.length} pending transfer${pendingTransfers.length === 1 ? '' : 's'} that hasn\u2019t been confirmed.`,
      );
    }
    // We don't clear here — the discard handler / submit handler are
    // explicit about when the dirty flag goes away.
  }, [transferMode, pendingTransfers.length, setDirty]);

  // Open the picker for a squad slot. Stashes the player being replaced so
  // the picker can filter by position and refund correctly.
  const startReplace = useCallback(
    (squadPlayer: Player) => {
      setTransferReplacingFor(squadPlayer);
      setShowModal(true);
      setSelectingPosition(squadPlayer.position as Position);
      setSearchTerm('');
      // Defensive lazy-load identical to builder.openModal so the picker
      // isn't empty if /api/players hadn't resolved yet.
      if (allPlayers.length === 0) {
        fetch('/api/players')
          .then((r) => (r.ok ? r.json() : null))
          .then((data) => {
            if (!data) return;
            const players = Array.isArray(data) ? data : data.players || [];
            setAllPlayers(players);
          })
          .catch(() => {});
      }
    },
    [allPlayers.length],
  );

  // Undo a pending transfer — find the entry by incoming-player id and drop
  // it. Safe to call multiple times; idempotent if the entry's gone.
  const undoTransfer = useCallback((incomingPlayerId: string) => {
    setPendingTransfers((prev) =>
      prev.filter((t) => t.playerIn.id !== incomingPlayerId),
    );
  }, []);

  // Commit a replacement: replaces an existing pending transfer for this
  // slot if any (so users can change their mind mid-flow), otherwise pushes
  // a new entry.
  const commitTransfer = useCallback(
    (playerOut: Player, playerIn: Player) => {
      setPendingTransfers((prev) => {
        // If the slot was already being replaced (rare — would require
        // tapping Replace on an already-pending player, which we don't
        // render — defensive anyway), drop the prior entry first.
        const filtered = prev.filter((t) => t.playerOut.id !== playerOut.id);
        return [...filtered, { playerOut, playerIn }];
      });
      setTransferReplacingFor(null);
      setSelectingPosition(null);
      setShowModal(false);
      setSearchTerm('');
    },
    [],
  );

  const enterTransferMode = useCallback(() => {
    setTransferMode(true);
    setTransferError(null);
    setPendingTransfers([]);
  }, []);

  const exitTransferMode = useCallback(() => {
    setTransferMode(false);
    setPendingTransfers([]);
    setTransferReplacingFor(null);
    setTransferError(null);
    setDiscardConfirmOpen(false);
    setDirty(false);
  }, [setDirty]);

  const submitTransfers = useCallback(async () => {
    if (pendingTransfers.length === 0) return;
    setTransferSubmitting(true);
    setTransferError(null);
    try {
      const res = await fetch('/api/transfers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          transfers: pendingTransfers.map((t) => ({
            playerOutId: t.playerOut.id,
            playerInId: t.playerIn.id,
          })),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setTransferError(
          data.error || `Failed to confirm transfers (status ${res.status})`,
        );
        setTransferSubmitting(false);
        return;
      }
      // Drop the unsaved guard BEFORE reload — see /transfers for the reason.
      setPendingTransfers([]);
      forceClean();
      window.location.reload();
    } catch (err) {
      console.error('Submit transfers error:', err);
      setTransferError(
        'Could not reach the server. Check your connection and try again.',
      );
      setTransferSubmitting(false);
    }
  }, [pendingTransfers, forceClean]);

  // Filter available players for modal. Works for both the builder (no
  // `transferReplacingFor`) and the transfer-mode picker (set). In transfer
  // mode the math is different:
  //   - budget = current bank + (price of player being replaced)
  //     The world cup model uses fixed prices, so refund = purchase price.
  //   - the player being replaced is allowed to "reappear" (you can pick
  //     them back if you change your mind mid-tap), so we don't filter them
  //     out unconditionally — only their PRESENT-IN-SQUAD siblings.
  //   - the nation cap uses the projected count (squad minus all pending
  //     outs, plus all pending ins), which already excludes the slot being
  //     replaced.
  const availablePlayers = useMemo(() => {
    if (!selectingPosition) return [];

    const isTransferPicker = Boolean(transferReplacingFor);
    const squadIds = new Set(squad.map((p) => p.id));
    const pendingInIds = new Set(pendingTransfers.map((t) => t.playerIn.id));
    const pendingOutIds = new Set(pendingTransfers.map((t) => t.playerOut.id));

    const effectiveBudget = isTransferPicker
      ? bankBalance + (transferReplacingFor?.currentPrice ?? 0)
      : remainingBudget;

    const counts = isTransferPicker ? projectedNationCounts : nationCounts;

    return allPlayers
      .filter((p) => {
        if (p.position !== selectingPosition) return false;
        if (searchTerm && !p.displayName.toLowerCase().includes(searchTerm.toLowerCase())) {
          return false;
        }
        if (isTransferPicker) {
          // Hide players that are STILL in the squad (and not on their way
          // out via a pending transfer) and players already lined up to come
          // in — these would create duplicates after Confirm.
          const inSquad = squadIds.has(p.id);
          const alreadyIncoming = pendingInIds.has(p.id);
          const goingOut = pendingOutIds.has(p.id);
          if (alreadyIncoming) return false;
          if (inSquad && !goingOut) return false;
        } else {
          if (squadIds.has(p.id)) return false;
        }
        if (p.currentPrice > effectiveBudget) return false;
        if ((counts[p.nation?.id || ''] || 0) >= MAX_PER_NATION) return false;
        return true;
      })
      .sort((a, b) =>
        sortBy === 'price'
          ? b.currentPrice - a.currentPrice
          : a.displayName.localeCompare(b.displayName),
      );
  }, [
    allPlayers,
    squad,
    selectingPosition,
    remainingBudget,
    nationCounts,
    searchTerm,
    sortBy,
    transferReplacingFor,
    pendingTransfers,
    bankBalance,
    projectedNationCounts,
  ]);

  // Add player to squad. Two distinct flows share this handler:
  //   - Builder mode: append to `squad` and mark page dirty.
  //   - Transfer-mode picker: commit a swap via commitTransfer(), no
  //     mutation of `squad` (only `pendingTransfers` changes).
  const addPlayer = (player: Player) => {
    if (transferReplacingFor) {
      commitTransfer(transferReplacingFor, player);
      return;
    }
    setSquad(prev => [...prev, player]);
    setShowModal(false);
    setSelectingPosition(null);
    setSearchTerm('');
    markDirty('You added a player to your squad but haven\u2019t saved yet.');
  };

  // Remove player from squad
  const removePlayer = (playerId: string) => {
    setSquad(prev => prev.filter(p => p.id !== playerId));
    markDirty('You removed a player from your squad but haven\u2019t saved yet.');
  };

  // Open modal for position
  const openModal = (position: Position) => {
    if (positionCounts[position] < POSITION_LIMITS[position]) {
      setSelectingPosition(position);
      setShowModal(true);
      // Defensive lazy-load: if the background fetch hasn't populated yet,
      // pull players now so the picker isn't empty.
      if (allPlayers.length === 0) {
        fetch('/api/players')
          .then(r => r.ok ? r.json() : null)
          .then(data => {
            if (!data) return;
            const players = Array.isArray(data) ? data : (data.players || []);
            setAllPlayers(players);
          })
          .catch(() => {});
      }
    }
  };

  // Save initial squad
  const saveSquad = async () => {
    if (squad.length !== 15) {
      alert('Please select all 15 players');
      return;
    }
    
    setSaving(true);
    try {
      // Auto-select starting 11 (4-4-2)
      const gks = squad.filter(p => p.position === 'GK');
      const defs = squad.filter(p => p.position === 'DEF');
      const mids = squad.filter(p => p.position === 'MID');
      const fwds = squad.filter(p => p.position === 'FWD');
      
      const starting: Player[] = [
        gks[0], // 1 GK
        ...defs.slice(0, 4), // 4 DEF
        ...mids.slice(0, 4), // 4 MID
        ...fwds.slice(0, 2), // 2 FWD
      ];
      
      const benchPlayers = squad.filter(p => !starting.includes(p));
      
      // Captain = highest priced, Vice = second highest
      const sortedByPrice = [...starting].sort((a, b) => b.currentPrice - a.currentPrice);
      const captain = sortedByPrice[0];
      const vice = sortedByPrice[1];
      
      const res = await fetch('/api/squad/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          players: squad.map(p => ({ playerId: p.id, purchasePrice: p.currentPrice })),
          startingXI: starting.map(p => p.id),
          bench: benchPlayers.map(p => p.id),
          captainId: captain.id,
          viceCaptainId: vice.id,
        }),
      });
      
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || 'Failed to save');
        return;
      }
      
      markClean();
      // Refresh to view mode
      window.location.reload();
    } catch (error) {
      console.error('Save error:', error);
      alert('Failed to save squad');
    } finally {
      setSaving(false);
    }
  };

  // Pure check: would swapping p1 and p2 produce a valid formation?
  const isSwapValid = (p1: Player, p2: Player): boolean => {
    if (p1.id === p2.id) return false;
    if (p1.isStarting === p2.isStarting) return false;

    const playerOut = p1.isStarting ? p1 : p2;
    const playerIn = p1.isStarting ? p2 : p1;

    const nextStarting = startingXI.map(p => p.id === playerOut.id ? { ...playerIn, isStarting: true } : p);
    const counts: Record<Position, number> = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
    nextStarting.forEach(p => counts[p.position as Position]++);

    return (
      counts.GK === 1 &&
      counts.DEF >= 3 && counts.DEF <= 5 &&
      counts.MID >= 2 && counts.MID <= 5 &&
      counts.FWD >= 1 && counts.FWD <= 3
    );
  };

  // Set of valid swap target IDs given the currently picked player
  const validSwapTargets = useMemo(() => {
    if (!playerToSub) return new Set<string>();
    const out = new Set<string>();
    [...startingXI, ...bench].forEach(p => {
      if (isSwapValid(playerToSub, p)) out.add(p.id);
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerToSub, startingXI, bench]);

  // Drag-and-drop ref (sync with state for HTML5 DnD)
  const draggingRef = useRef<Player | null>(null);

  // Core swap routine used by both tap-to-sub and drag-and-drop
  const performSwap = (p1: Player, p2: Player) => {
    if (!isSwapValid(p1, p2)) {
      alert('Invalid formation!\n\n• 1 Goalkeeper\n• 3–5 Defenders\n• 2–5 Midfielders\n• 1–3 Forwards');
      setPlayerToSub(null);
      return;
    }

    const playerOut = p1.isStarting ? p1 : p2;
    const playerIn = p1.isStarting ? p2 : p1;

    const nextStarting = startingXI.map(p => p.id === playerOut.id ? { ...playerIn, isStarting: true } : p);
    const nextBench = bench.map(p => p.id === playerIn.id ? { ...playerOut, isStarting: false } : p);

    setStartingXI(nextStarting);
    setBench(nextBench);

    // Captain / vice transfer rules
    // The armband stays with the starting slot — the incoming player inherits it.
    if (captainId === playerOut.id) {
      setCaptainId(playerIn.id);
    }
    if (viceCaptainId === playerOut.id) {
      setViceCaptainId(playerIn.id);
    }

    // Update formation string
    const counts: Record<Position, number> = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
    nextStarting.forEach(p => counts[p.position as Position]++);
    setFormation(`${counts.DEF}-${counts.MID}-${counts.FWD}`);

    setPlayerToSub(null);
    setSelectedPlayer(null);
    markDirty('You made a substitution but haven\u2019t saved your lineup.');
  };

  // Tap-based selection: first tap selects, second tap swaps
  const swapPlayer = (player: Player) => {
    if (!playerToSub) {
      setPlayerToSub(player);
      return;
    }
    if (playerToSub.id === player.id) {
      setPlayerToSub(null);
      return;
    }
    if (playerToSub.isStarting === player.isStarting) {
      setPlayerToSub(player); // Just switch focus
      return;
    }
    performSwap(playerToSub, player);
  };

  // Drag handlers
  const handleDragStart = (player: Player) => (e: React.DragEvent) => {
    draggingRef.current = player;
    setPlayerToSub(player);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', player.id);
  };
  const handleDragEnd = () => {
    draggingRef.current = null;
  };
  const handleDragOver = (target: Player) => (e: React.DragEvent) => {
    const dragged = draggingRef.current;
    if (!dragged || !isSwapValid(dragged, target)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };
  const handleDrop = (target: Player) => (e: React.DragEvent) => {
    e.preventDefault();
    const dragged = draggingRef.current;
    if (!dragged) return;
    performSwap(dragged, target);
    draggingRef.current = null;
  };

  const setCaptain = (playerId: string) => {
    if (viceCaptainId === playerId) setViceCaptainId(null);
    setCaptainId(playerId);
    markDirty('You changed the captain but haven\u2019t saved.');
  };

  const setViceCaptain = (playerId: string) => {
    if (captainId === playerId) setCaptainId(null);
    setViceCaptainId(playerId);
    markDirty('You changed the vice-captain but haven\u2019t saved.');
  };

  // Save squad changes (view mode)
  const saveChanges = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/squad/update', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          startingXI: startingXI.map(p => p.id),
          bench: bench.map(p => p.id),
          captainId,
          viceCaptainId,
        }),
      });
      
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || 'Failed to save');
        return;
      }

      markClean();
      alert('Squad saved!');
    } catch (error) {
      console.error('Save error:', error);
      alert('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (loading || mode === 'loading') {
    return (
      <div className="min-h-[70vh] flex items-center justify-center px-6">
        {loadError ? (
          <div className="max-w-sm w-full bg-white/5 border border-white/10 rounded-2xl p-6 text-center">
            <div className="w-12 h-12 mx-auto rounded-full bg-rose-500/20 flex items-center justify-center mb-3">
              <X className="w-6 h-6 text-rose-400" />
            </div>
            <div className="text-white font-semibold mb-1">Something went wrong</div>
            <div className="text-white/60 text-sm mb-4">{loadError}</div>
            <button
              onClick={() => {
                setLoading(true);
                setLoadError(null);
                setLoadAttempt(a => a + 1);
              }}
              className="w-full bg-rose-500 hover:bg-rose-600 active:scale-95 text-white font-semibold py-2.5 rounded-lg transition"
            >
              Retry
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-2 border-white/20 border-t-rose-400 rounded-full animate-spin" />
            <div className="text-white/60 text-sm">Loading your squad…</div>
          </div>
        )}
      </div>
    );
  }

  // ============================================
  // BUILDER MODE
  // ============================================
  if (mode === 'builder') {
    const gks = squad.filter(p => p.position === 'GK');
    const defs = squad.filter(p => p.position === 'DEF');
    const mids = squad.filter(p => p.position === 'MID');
    const fwds = squad.filter(p => p.position === 'FWD');

    const progress = (squad.length / 15) * 100;
    return (
      <div
        className="max-w-5xl mx-auto px-0 sm:px-4 py-4 sm:py-6 sm:pb-6"
        style={{
          overflowX: 'auto',
          overflowY: 'visible',
          width: '100%',
          // Reserve space for the mobile sticky bottom bar PLUS the iPhone
          // home indicator. 6rem covers the bar; env() adds the safe area.
          paddingBottom: 'calc(6rem + env(safe-area-inset-bottom))',
        }}
      >
        {/* Header */}
        <div className="px-3 sm:px-0 mb-5 sm:mb-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-br from-pink-500 to-rose-600 flex items-center justify-center shadow-[0_0_20px_rgba(244,63,94,0.45)]">
              <Sparkles className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">Build Your Squad</h1>
              <p className="text-white/50 text-xs sm:text-sm">Pick 15 players within your £100m budget</p>
            </div>
          </div>

          {/* Stat strip */}
          <div className="grid grid-cols-3 gap-2">
            <StatCard icon={<Users className="w-4 h-4" />} label="Players" value={`${squad.length}/15`} accent="text-white" />
            <StatCard icon={<Wallet className="w-4 h-4" />} label="Budget" value={`£${remainingBudget.toFixed(1)}m`} accent={remainingBudget >= 0 ? 'text-emerald-400' : 'text-red-400'} />
            <StatCard icon={<Coins className="w-4 h-4" />} label="Spent" value={`£${squadValue.toFixed(1)}m`} accent="text-amber-300" />
          </div>

          {/* Progress bar */}
          <div className="mt-3 h-1.5 bg-white/5 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-pink-500 via-rose-500 to-amber-400 transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Pitch */}
        <div className="relative rounded-2xl mb-6 overflow-hidden shadow-[0_20px_60px_-20px_rgba(0,0,0,0.6)] ring-1 ring-white/10">
          <PitchBg />
          <div className="relative z-10 p-2 sm:p-6 space-y-4 sm:space-y-6 overflow-x-auto scrollbar-hide" style={{ WebkitOverflowScrolling: 'touch' }}>
            {/* FWD row */}
            <div className="flex justify-center gap-1.5 sm:gap-6 min-w-max sm:min-w-0 animate-slide-down">
              {[...Array(3)].map((_, i) => (
                fwds[i] ? (
                  <div key={fwds[i].id} className="group cursor-pointer flex-shrink-0" onClick={() => removePlayer(fwds[i].id)}>
                    <PlayerCard player={fwds[i]} showOpponent={getNextOpponent(fwds[i].nation?.code || '')} difficulty={getFixtureDifficulty(fwds[i].nation?.code || '', getNextOpponent(fwds[i].nation?.code || ''))} size="xs" />
                  </div>
                ) : (
                  <div key={`fwd-${i}`} className="flex-shrink-0">
                    <EmptySlot position="FWD" onClick={() => openModal('FWD')} />
                  </div>
                )
              ))}
            </div>

            {/* MID row */}
            <div className="flex justify-center gap-1 sm:gap-4 min-w-max sm:min-w-0 animate-slide-down" style={{ animationDelay: '60ms' }}>
              {[...Array(5)].map((_, i) => (
                mids[i] ? (
                  <div key={mids[i].id} className="group cursor-pointer flex-shrink-0" onClick={() => removePlayer(mids[i].id)}>
                    <PlayerCard player={mids[i]} showOpponent={getNextOpponent(mids[i].nation?.code || '')} difficulty={getFixtureDifficulty(mids[i].nation?.code || '', getNextOpponent(mids[i].nation?.code || ''))} size="xs" />
                  </div>
                ) : (
                  <div key={`mid-${i}`} className="flex-shrink-0">
                    <EmptySlot position="MID" onClick={() => openModal('MID')} />
                  </div>
                )
              ))}
            </div>

            {/* DEF row */}
            <div className="flex justify-center gap-1 sm:gap-4 min-w-max sm:min-w-0 animate-slide-down" style={{ animationDelay: '120ms' }}>
              {[...Array(5)].map((_, i) => (
                defs[i] ? (
                  <div key={defs[i].id} className="group cursor-pointer flex-shrink-0" onClick={() => removePlayer(defs[i].id)}>
                    <PlayerCard player={defs[i]} showOpponent={getNextOpponent(defs[i].nation?.code || '')} difficulty={getFixtureDifficulty(defs[i].nation?.code || '', getNextOpponent(defs[i].nation?.code || ''))} size="xs" />
                  </div>
                ) : (
                  <div key={`def-${i}`} className="flex-shrink-0">
                    <EmptySlot position="DEF" onClick={() => openModal('DEF')} />
                  </div>
                )
              ))}
            </div>

            {/* GK row */}
            <div className="flex justify-center gap-2 sm:gap-6 min-w-max sm:min-w-0 animate-slide-down" style={{ animationDelay: '180ms' }}>
              {[...Array(2)].map((_, i) => (
                gks[i] ? (
                  <div key={gks[i].id} className="group cursor-pointer flex-shrink-0" onClick={() => removePlayer(gks[i].id)}>
                    <PlayerCard player={gks[i]} showOpponent={getNextOpponent(gks[i].nation?.code || '')} difficulty={getFixtureDifficulty(gks[i].nation?.code || '', getNextOpponent(gks[i].nation?.code || ''))} size="xs" />
                  </div>
                ) : (
                  <div key={`gk-${i}`} className="flex-shrink-0">
                    <EmptySlot position="GK" onClick={() => openModal('GK')} />
                  </div>
                )
              ))}
            </div>
          </div>
        </div>

        {/* Desktop actions */}
        <div className="hidden sm:flex items-center justify-between px-3 sm:px-0">
          <button
            onClick={() => {
              if (squad.length === 0) return;
              setSquad([]);
              markDirty('You cleared your squad but haven\u2019t saved.');
            }}
            className="px-4 py-2 text-white/60 hover:text-white transition-colors"
          >
            Clear All
          </button>
          <button
            onClick={saveSquad}
            disabled={saving || squad.length !== 15 || remainingBudget < 0}
            className="px-8 py-3 bg-gradient-to-r from-pink-500 to-rose-500 text-white rounded-xl font-bold hover:from-pink-600 hover:to-rose-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-[0_10px_30px_-10px_rgba(244,63,94,0.6)]"
          >
            {saving ? 'Saving...' : 'Save Squad'}
          </button>
        </div>

        {/* Mobile sticky bottom bar */}
        <div className="sm:hidden fixed bottom-0 left-0 right-0 z-40 bg-slate-950/95 backdrop-blur-md border-t border-white/10 px-3 pt-2.5 add-pb-safe flex items-center justify-between gap-3">
          <button
            onClick={() => {
              if (squad.length === 0) return;
              setSquad([]);
              markDirty('You cleared your squad but haven\u2019t saved.');
            }}
            className="px-3 py-2 text-white/60 hover:text-white text-sm font-medium"
          >
            Clear
          </button>
          <button
            onClick={saveSquad}
            disabled={saving || squad.length !== 15 || remainingBudget < 0}
            className="flex-1 px-4 py-3 bg-gradient-to-r from-pink-500 to-rose-500 text-white rounded-xl font-black text-sm hover:from-pink-600 hover:to-rose-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg flex items-center justify-center gap-2"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving...' : `Save Squad (${squad.length}/15)`}
          </button>
        </div>

        {/* Player Selection Modal */}
        {showModal && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
            <div className="bg-slate-900 rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden border border-white/10 shadow-2xl">
              <div className="p-4 border-b border-white/10 flex items-center justify-between bg-gradient-to-r from-slate-900 to-slate-800">
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center font-black text-sm ${
                    selectingPosition === 'GK' ? 'bg-amber-500/20 text-amber-300' :
                    selectingPosition === 'DEF' ? 'bg-sky-500/20 text-sky-300' :
                    selectingPosition === 'MID' ? 'bg-emerald-500/20 text-emerald-300' :
                    'bg-rose-500/20 text-rose-300'
                  }`}>
                    {selectingPosition}
                  </div>
                  <div>
                    <h2 className="text-lg sm:text-xl font-bold text-white">Select {selectingPosition}</h2>
                    <p className="text-xs text-white/40">Budget remaining: £{remainingBudget.toFixed(1)}m</p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setShowModal(false);
                    setSelectingPosition(null);
                    setTransferReplacingFor(null);
                  }}
                  className="text-white/60 hover:text-white p-2 rounded-lg hover:bg-white/5"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Filters */}
              <div className="p-4 border-b border-white/10 flex gap-3">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                  <input
                    type="text"
                    placeholder="Search players..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-white/30 focus:bg-white/10 transition-colors"
                  />
                </div>
                <select
                  value={sortBy}
                  onChange={e => setSortBy(e.target.value as 'price' | 'name')}
                  className="px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm cursor-pointer"
                >
                  <option value="price">By Price</option>
                  <option value="name">By Name</option>
                </select>
              </div>

              {/* Player List */}
              <div className="max-h-[55vh] overflow-y-auto">
                {availablePlayers.length === 0 ? (
                  <div className="p-8 text-center text-white/40">No players available</div>
                ) : (
                  availablePlayers.slice(0, 50).map(player => (
                    <button
                      key={player.id}
                      onClick={() => addPlayer(player)}
                      className="w-full p-3 sm:p-4 flex items-center gap-3 sm:gap-4 hover:bg-white/5 border-b border-white/5 text-left group transition-colors"
                    >
                      <Kit
                        primaryColor={player.nation?.kitColor1 || '#FFF'}
                        secondaryColor={player.nation?.kitColor2 || '#000'}
                        number={player.shirtNumber}
                        nationCode={player.nation?.code || ''}
                        size="sm"
                      />
                      <img src={getFlagUrl(player.nation?.code || '')} alt="" className="w-6 h-4 rounded-sm object-cover" />
                      <div className="flex-1 min-w-0">
                        <p className="text-white font-semibold truncate">{player.displayName}</p>
                        <p className="text-white/40 text-xs">{player.nation?.name}</p>
                      </div>
                      <p className="text-emerald-400 font-bold whitespace-nowrap">£{player.currentPrice.toFixed(1)}m</p>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ============================================
  // VIEW MODE (Starting 11 + Bench)
  // ============================================
  
  // All formations - we'll filter based on available players
  const ALL_FORMATIONS = [
    '4-4-2', '4-3-3', '4-5-1', '4-4-1-1', '4-2-3-1', '4-3-2-1', '4-1-2-3', '4-1-4-1', '4-2-2-2', '4-1-3-2',
    '3-5-2', '3-4-3', '3-4-2-1', '3-5-1-1', '3-4-1-2',
    '5-3-2', '5-4-1', '5-2-2-1', '5-3-1-1',
  ];
  
  // Parse formation to get DEF-MID-FWD counts
  const parseFormation = (f: string): { def: number; mid: number; fwd: number } => {
    const parts = f.split('-').map(Number);
    const def = parts[0];
    const fwd = parts[parts.length - 1];
    const mid = 10 - def - fwd;
    return { def, mid, fwd };
  };
  
  // Count available players by position (all 15 in squad)
  const allSquadPlayers = [...startingXI, ...bench];
  const availableGKs = allSquadPlayers.filter(p => p.position === 'GK').length;
  const availableDEFs = allSquadPlayers.filter(p => p.position === 'DEF').length;
  const availableMIDs = allSquadPlayers.filter(p => p.position === 'MID').length;
  const availableFWDs = allSquadPlayers.filter(p => p.position === 'FWD').length;
  
  // Filter formations that are possible with current squad
  const validFormations = ALL_FORMATIONS.filter(f => {
    const { def, mid, fwd } = parseFormation(f);
    return def <= availableDEFs && mid <= availableMIDs && fwd <= availableFWDs;
  });
  
  // Change formation
  const changeFormation = (newFormation: string) => {
    const { def, mid, fwd } = parseFormation(newFormation);
    
    const gkPlayers = allSquadPlayers.filter(p => p.position === 'GK');
    const defPlayers = allSquadPlayers.filter(p => p.position === 'DEF');
    const midPlayers = allSquadPlayers.filter(p => p.position === 'MID');
    const fwdPlayers = allSquadPlayers.filter(p => p.position === 'FWD');
    
    // Build new starting 11
    const newStarting: Player[] = [
      gkPlayers[0],
      ...defPlayers.slice(0, def),
      ...midPlayers.slice(0, mid),
      ...fwdPlayers.slice(0, fwd),
    ].filter(Boolean);
    
    // Everyone else goes to bench
    const startingIds = new Set(newStarting.map(p => p.id));
    const newBench = allSquadPlayers.filter(p => !startingIds.has(p.id));
    
    setStartingXI(newStarting.map(p => ({ ...p, isStarting: true })));
    setBench(newBench.map(p => ({ ...p, isStarting: false })));
    setFormation(newFormation);
    markDirty('You changed your formation but haven\u2019t saved.');
  };
  
  // Current players on pitch by position
  const gks = startingXI.filter(p => p.position === 'GK');
  const defs = startingXI.filter(p => p.position === 'DEF');
  const mids = startingXI.filter(p => p.position === 'MID');
  const fwds = startingXI.filter(p => p.position === 'FWD');

  // Render helper for pitch player cards (DRY) – includes drag/drop + highlight logic
  const renderPitchPlayer = (p: Player) => {
    const opponent = getNextOpponent(p.nation?.code || '');
    const difficulty = getFixtureDifficulty(p.nation?.code || '', opponent);
    const isSelected = playerToSub?.id === p.id;
    const isValid = !!playerToSub && !isSelected && validSwapTargets.has(p.id);
    const isDimmed = !!playerToSub && !isSelected && !validSwapTargets.has(p.id);
    return (
      <div key={p.id} className="flex-shrink-0">
        <PlayerCard
          player={p}
          onClick={() => {
            if (playerToSub) {
              if (isValid || isSelected) {
                swapPlayer(p);
              } else {
                // Just refocus to a same-side selection – or open detail
                setSelectedPlayer(p);
              }
            } else {
              setSelectedPlayer(p);
            }
          }}
          showOpponent={opponent}
          difficulty={difficulty}
          livePoints={p.points}
          isCaptain={captainId === p.id}
          isViceCaptain={viceCaptainId === p.id}
          selectedForSub={isSelected}
          validTarget={isValid}
          dimmed={isDimmed}
          draggable
          onDragStart={handleDragStart(p)}
          onDragEnd={handleDragEnd}
          onDragOver={handleDragOver(p)}
          onDrop={handleDrop(p)}
          size="xs"
        />
      </div>
    );
  };

  // Total points across squad
  const totalPoints = allSquadPlayers.reduce((sum, p) => sum + (p.points || 0), 0);

  // Next gameweek countdown – first upcoming fixture across whole tournament.
  // parseFixtureDateTime anchors the schedule to Eastern Time so the cutoff
  // matches reality regardless of where the user (or our Vercel region) is.
  const nextFixture = WORLD_CUP_FIXTURES
    .map(f => ({ ...f, dt: parseFixtureDateTime(f.date, f.time) }))
    .filter(f => f.dt > new Date())
    .sort((a, b) => a.dt.getTime() - b.dt.getTime())[0];

  // Countdown to next kickoff. `formatDuration` returns "—" once we're past
  // kickoff (matchday window) which is the right thing to show in the tile.
  const countdownStr = nextFixture ? formatDuration(nextFixture.dt.getTime(), now) : '—';

  // Squad-lock deadline: 1 hour before the first match of the upcoming
  // gameweek (see DEADLINE_OFFSET_MS in @/lib/format-time). We approximate
  // "first match of the gameweek" as the next fixture in chronological
  // order – exactly right pre-tournament and during the gap between
  // matchdays. Once the tournament is in full swing we may want to anchor
  // this on the Stage record's `deadline` field instead.
  let deadlineDateShort = '—';
  let deadlineHint = '';
  if (nextFixture) {
    const dl = deadlineFor(nextFixture.dt);
    deadlineDateShort = formatDateShort(dl, timezone);
    const timeStr = formatTime(dl, timezone);
    const countdown = fmtCountdown(dl.getTime(), now, 'Locked');
    deadlineHint = `${timeStr} · ${countdown}`;
  }

  // ============================================
  // TRANSFER MODE — pitch layout for swaps
  // ============================================
  if (transferMode) {
    // Group the projected squad by position. We always show 2 GK / 5 DEF /
    // 5 MID / 3 FWD slots regardless of formation — transfer mode is
    // squad-level, not lineup-level.
    const tGks = transferDisplaySquad.filter((p) => p.position === 'GK');
    const tDefs = transferDisplaySquad.filter((p) => p.position === 'DEF');
    const tMids = transferDisplaySquad.filter((p) => p.position === 'MID');
    const tFwds = transferDisplaySquad.filter((p) => p.position === 'FWD');

    // Renders one player card with a 44pt-min tap target in the bottom-right
    // corner. When the player is a pending incoming transfer the button
    // becomes Undo (amber, prominent); otherwise it's Replace (subtle gold).
    const renderTransferCard = (p: Player) => {
      const incoming = isPendingIncoming(p.id);
      return (
        <div key={p.id} className="relative flex-shrink-0">
          <div
            className={
              incoming
                ? 'rounded-2xl ring-2 ring-amber-400 shadow-[0_0_22px_rgba(251,191,36,0.45)]'
                : ''
            }
          >
            <PlayerCard
              player={p}
              showOpponent={getNextOpponent(p.nation?.code || '')}
              difficulty={getFixtureDifficulty(
                p.nation?.code || '',
                getNextOpponent(p.nation?.code || ''),
              )}
              size="xs"
            />
          </div>
          {/* Bottom-right corner action. 44×44pt min tap target per Apple
              HIG (~11 Tailwind units). The button visually clips below the
              card so it doesn't crowd the points/captain badges. */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (incoming) {
                undoTransfer(p.id);
              } else {
                startReplace(p);
              }
            }}
            className={`absolute -bottom-2 -right-2 min-w-[44px] min-h-[44px] px-2 rounded-full text-[10px] font-black tracking-wide inline-flex items-center justify-center gap-1 shadow-lg transition-transform active:scale-95 ${
              incoming
                ? 'bg-amber-400 text-amber-950 ring-2 ring-amber-200'
                : 'bg-laliga-gold text-laliga-dark ring-2 ring-amber-100/20 hover:bg-amber-300'
            }`}
            aria-label={incoming ? 'Undo transfer' : 'Replace player'}
          >
            {incoming ? (
              <>
                <RotateCcw className="w-3.5 h-3.5" />
                <span>UNDO</span>
              </>
            ) : (
              <>
                <ArrowLeftRight className="w-3.5 h-3.5" />
                <span>SWAP</span>
              </>
            )}
          </button>
        </div>
      );
    };

    return (
      <div
        className="max-w-5xl mx-auto px-0 sm:px-4 py-4 sm:py-6"
        style={{
          // Reserve room for BOTH sticky bars (top + bottom) and iPhone
          // safe-area insets.
          paddingTop: 'calc(env(safe-area-inset-top))',
          paddingBottom: 'calc(7rem + env(safe-area-inset-bottom))',
        }}
      >
        {/* Sticky top bar: budget / free / hits. We keep it inside the page
            container (not fixed) so it scrolls correctly above the pitch on
            short viewports. The sticky-position keeps it pinned during the
            "scroll the picker" interaction. */}
        <div className="sticky top-0 z-30 bg-[#0a0e17]/95 backdrop-blur-md border-b border-white/10 -mx-0 sm:-mx-4 px-3 sm:px-4 py-3 mb-4">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  if (pendingTransfers.length > 0) {
                    setDiscardConfirmOpen(true);
                  } else {
                    exitTransferMode();
                  }
                }}
                className="text-white/60 hover:text-white text-xs sm:text-sm font-medium px-2 py-1.5 rounded-lg hover:bg-white/5"
              >
                ← Back
              </button>
              <h1 className="text-lg sm:text-xl font-black text-white tracking-tight">TRANSFERS</h1>
            </div>
            <div className="flex items-center gap-2 sm:gap-3 text-[10px] sm:text-xs">
              <div className="px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                <span className="text-white/50 mr-1">Bank</span>
                <span className={`font-black ${projectedBank < 0 ? 'text-red-400' : 'text-emerald-300'}`}>
                  £{projectedBank.toFixed(1)}m
                </span>
              </div>
              <div className="px-2.5 py-1 rounded-lg bg-sky-500/10 border border-sky-500/20">
                <span className="text-white/50 mr-1">Free</span>
                <span className="font-black text-sky-300">
                  {Math.max(0, freeTransfers - pendingTransfers.length)}
                </span>
              </div>
              <div
                className={`px-2.5 py-1 rounded-lg border ${
                  transferHitCost > 0
                    ? 'bg-red-500/15 border-red-500/30'
                    : 'bg-white/5 border-white/10'
                }`}
              >
                <span className="text-white/50 mr-1">Hit</span>
                <span className={`font-black ${transferHitCost > 0 ? 'text-red-300' : 'text-white/70'}`}>
                  {transferHitCost > 0 ? `-${transferHitCost}` : '0'}
                </span>
              </div>
            </div>
          </div>
          <p className="text-[11px] text-white/40">
            Tap <span className="text-laliga-gold font-bold">SWAP</span> on a card to replace that player.
            Tap <span className="text-amber-300 font-bold">UNDO</span> to revert a pending change.
          </p>
        </div>

        {transferError && (
          <div className="mx-3 sm:mx-0 mb-3 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-sm text-red-300">
            {transferError}
          </div>
        )}

        {/* Pitch */}
        <div className="relative rounded-2xl mb-6 overflow-hidden shadow-[0_20px_60px_-20px_rgba(0,0,0,0.6)] ring-1 ring-white/10">
          <PitchBg />
          <div
            className="relative z-10 p-2 sm:p-6 space-y-4 sm:space-y-6 overflow-x-auto scrollbar-hide"
            style={{ WebkitOverflowScrolling: 'touch' }}
          >
            <div className="flex justify-center gap-1.5 sm:gap-6 min-w-max sm:min-w-0">
              {tFwds.map(renderTransferCard)}
            </div>
            <div className="flex justify-center gap-1 sm:gap-4 min-w-max sm:min-w-0">
              {tMids.map(renderTransferCard)}
            </div>
            <div className="flex justify-center gap-1 sm:gap-4 min-w-max sm:min-w-0">
              {tDefs.map(renderTransferCard)}
            </div>
            <div className="flex justify-center gap-2 sm:gap-6 min-w-max sm:min-w-0">
              {tGks.map(renderTransferCard)}
            </div>
          </div>
        </div>

        {/* Sticky bottom action bar — fixed at viewport bottom on mobile so
            it survives Safari address-bar collapse without jumping. iOS
            safe-area inset is added on top of the 1rem base padding. */}
        <div
          className="fixed bottom-0 left-0 right-0 z-30 bg-[#0a0e17]/95 backdrop-blur-md border-t border-white/10 px-3 sm:px-4 py-3"
          style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
        >
          <div className="max-w-5xl mx-auto flex items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={() => {
                if (pendingTransfers.length > 0) {
                  setDiscardConfirmOpen(true);
                } else {
                  exitTransferMode();
                }
              }}
              className="px-4 py-3 rounded-xl bg-white/5 hover:bg-white/10 text-white/80 hover:text-white text-sm font-bold border border-white/10"
            >
              {pendingTransfers.length > 0 ? 'Discard' : 'Cancel'}
            </button>
            <button
              type="button"
              onClick={submitTransfers}
              disabled={pendingTransfers.length === 0 || transferSubmitting || projectedBank < 0}
              className="flex-1 px-4 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-white font-black text-sm disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              {transferSubmitting
                ? 'Confirming…'
                : pendingTransfers.length === 0
                ? 'No transfers yet'
                : `Confirm ${pendingTransfers.length} transfer${pendingTransfers.length === 1 ? '' : 's'}${transferHitCost > 0 ? ` · -${transferHitCost} pts` : ''}`}
            </button>
          </div>
        </div>

        {/* Player Selection Modal — reuses the same modal markup as the
            builder. The transfer-mode branch is selected automatically
            because `transferReplacingFor` is set; addPlayer() forwards to
            commitTransfer() in that case. */}
        {showModal && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
            <div className="bg-slate-900 rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden border border-white/10 shadow-2xl">
              <div className="p-4 border-b border-white/10 flex items-center justify-between bg-gradient-to-r from-slate-900 to-slate-800">
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`w-9 h-9 rounded-lg flex items-center justify-center font-black text-sm flex-shrink-0 ${
                      selectingPosition === 'GK'
                        ? 'bg-amber-500/20 text-amber-300'
                        : selectingPosition === 'DEF'
                        ? 'bg-sky-500/20 text-sky-300'
                        : selectingPosition === 'MID'
                        ? 'bg-emerald-500/20 text-emerald-300'
                        : 'bg-rose-500/20 text-rose-300'
                    }`}
                  >
                    {selectingPosition}
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-base sm:text-lg font-bold text-white truncate">
                      Replace {transferReplacingFor?.displayName}
                    </h2>
                    <p className="text-xs text-white/40">
                      Budget after refund: £
                      {(bankBalance + (transferReplacingFor?.currentPrice ?? 0)).toFixed(1)}m
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setShowModal(false);
                    setSelectingPosition(null);
                    setTransferReplacingFor(null);
                  }}
                  className="text-white/60 hover:text-white p-2 rounded-lg hover:bg-white/5 flex-shrink-0"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-4 border-b border-white/10 flex gap-3">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                  <input
                    type="text"
                    placeholder="Search players..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-white/30 focus:bg-white/10 transition-colors"
                  />
                </div>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as 'price' | 'name')}
                  className="px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm cursor-pointer"
                >
                  <option value="price">By Price</option>
                  <option value="name">By Name</option>
                </select>
              </div>

              <div className="max-h-[55vh] overflow-y-auto">
                {availablePlayers.length === 0 ? (
                  <div className="p-8 text-center text-white/40">
                    No players available within budget for this slot.
                  </div>
                ) : (
                  availablePlayers.slice(0, 50).map((player) => (
                    <button
                      key={player.id}
                      onClick={() => addPlayer(player)}
                      className="w-full p-3 sm:p-4 flex items-center gap-3 sm:gap-4 hover:bg-white/5 border-b border-white/5 text-left group transition-colors"
                    >
                      <Kit
                        primaryColor={player.nation?.kitColor1 || '#FFF'}
                        secondaryColor={player.nation?.kitColor2 || '#000'}
                        number={player.shirtNumber}
                        nationCode={player.nation?.code || ''}
                        size="sm"
                      />
                      <img
                        src={getFlagUrl(player.nation?.code || '')}
                        alt=""
                        className="w-6 h-4 rounded-sm object-cover"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-white font-semibold truncate">{player.displayName}</p>
                        <p className="text-white/40 text-xs">{player.nation?.name}</p>
                      </div>
                      <p className="text-emerald-400 font-bold whitespace-nowrap">
                        £{player.currentPrice.toFixed(1)}m
                      </p>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* Discard-confirm dialog — only shows when there are pending
            transfers to throw away. Plain modal, no Portal needed because
            this entire render branch already lives at the top of the
            view-mode tree. */}
        {discardConfirmOpen && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
            <div className="bg-slate-900 rounded-2xl w-full max-w-sm border border-white/10 p-5">
              <h3 className="text-lg font-black text-white mb-2">Discard pending transfers?</h3>
              <p className="text-sm text-white/60 mb-5">
                You&apos;ll lose your {pendingTransfers.length} pending change
                {pendingTransfers.length === 1 ? '' : 's'}. This can&apos;t be undone.
              </p>
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setDiscardConfirmOpen(false)}
                  className="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/80 text-sm font-semibold"
                >
                  Keep editing
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDiscardConfirmOpen(false);
                    exitTransferMode();
                  }}
                  className="px-4 py-2 rounded-lg bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 text-red-200 text-sm font-bold"
                >
                  Discard
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className="max-w-5xl mx-auto px-0 sm:px-4 py-4 sm:py-6 sm:pb-6"
      style={{
        overflowX: 'auto',
        overflowY: 'visible',
        width: '100%',
        paddingBottom: 'calc(6rem + env(safe-area-inset-bottom))',
      }}
    >
      {/* Header */}
      <div className="px-3 sm:px-0 mb-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center shadow-[0_0_20px_rgba(16,185,129,0.45)]">
              <Trophy className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">My Squad</h1>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[10px] sm:text-xs uppercase tracking-wider text-white/40 font-bold">Next match in</span>
                <span className="text-[11px] sm:text-xs text-amber-300 font-black">{countdownStr}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <FormationPicker formations={validFormations} current={formation} onChange={changeFormation} />
            <button
              type="button"
              onClick={enterTransferMode}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-200 hover:bg-amber-500/25 hover:text-amber-100 text-xs sm:text-sm font-bold transition-colors"
              title="Make transfers"
            >
              <ArrowLeftRight className="w-4 h-4" />
              <span>Transfer</span>
            </button>
          </div>
        </div>

        {/* Stats strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <StatCard icon={<Trophy className="w-4 h-4" />} label="Total Pts" value={`${totalPoints}`} accent="text-emerald-400" highlight />
          <StatCard icon={<Coins className="w-4 h-4" />} label="Value" value={`£${teamValue.toFixed(1)}m`} accent="text-white" />
          <StatCard icon={<Wallet className="w-4 h-4" />} label="Bank" value={`£${bankBalance.toFixed(1)}m`} accent="text-emerald-300" />
          <StatCard
            icon={<Zap className="w-4 h-4" />}
            label="Deadline"
            value={deadlineDateShort}
            hint={deadlineHint}
            accent="text-amber-300"
          />
        </div>
      </div>

      {/* Free Hit live banner – shown when the chip is currently active so the
          user is reminded their squad will revert at end of stage. */}
      {chips.some(c => c.id === 'FREE_HIT' && c.active) && (
        <div className="px-3 sm:px-0 mb-3">
          <div className="rounded-2xl border border-amber-500/30 bg-gradient-to-r from-amber-500/15 via-amber-500/10 to-transparent p-3 sm:p-4 flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center flex-shrink-0">
              <Wand2 className="w-5 h-5 text-amber-300" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-amber-200 font-black text-sm sm:text-base flex items-center gap-2 flex-wrap">
                Free Hit Active
                <span className="text-[10px] font-bold bg-amber-500/20 text-amber-200 px-2 py-0.5 rounded-full uppercase tracking-wider">
                  This stage only
                </span>
              </div>
              <p className="text-amber-200/70 text-xs sm:text-sm mt-0.5 leading-snug">
                Make as many transfers as you like. Your squad will automatically revert to its previous lineup once this stage ends.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Chips Bar */}
      {chips.length > 0 && (
        <div className="px-3 sm:px-0 mb-5">
          <div className="bg-gradient-to-br from-slate-900/80 to-slate-950/80 border border-white/10 rounded-2xl p-3 sm:p-4 backdrop-blur-sm">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-black text-white/50 uppercase tracking-widest flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" />
                Power-Up Chips
              </h3>
              {chips.some(c => c.active) && (
                <span className="text-[10px] font-black text-emerald-300 bg-emerald-500/15 ring-1 ring-emerald-500/40 px-2 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Active
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {chips.map(chip => {
                const Icon = chipIcon(chip.name);
                const clickable = chip.available && !chipLoading;
                const handleCardClick = () => {
                  if (clickable) setChipConfirm(chip);
                };
                return (
                  <div
                    key={chip.id}
                    role={clickable ? 'button' : undefined}
                    tabIndex={clickable ? 0 : undefined}
                    onClick={handleCardClick}
                    onKeyDown={clickable ? (e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleCardClick();
                      }
                    } : undefined}
                    aria-disabled={!clickable && !chip.active}
                    className={`relative p-3 rounded-xl border text-left transition-all overflow-hidden group ${
                      chip.active
                        ? 'bg-gradient-to-br from-emerald-500/20 to-emerald-700/10 border-emerald-500/60 shadow-[0_0_20px_rgba(16,185,129,0.25)]'
                        : chip.used
                        ? 'bg-white/[0.02] border-white/5 opacity-50'
                        : clickable
                        ? 'bg-white/5 border-white/10 hover:border-white/30 hover:bg-white/10 hover:-translate-y-0.5 cursor-pointer'
                        : 'bg-white/[0.02] border-white/5 opacity-60'
                    }`}
                  >
                    {/* Active glow */}
                    {chip.active && (
                      <div className="absolute -inset-px rounded-xl opacity-30 pointer-events-none animate-pulse-slow"
                        style={{ boxShadow: 'inset 0 0 30px rgba(16,185,129,0.4)' }} />
                    )}

                    <div className="flex items-center justify-between mb-1.5 relative">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${
                          chip.active
                            ? 'bg-emerald-500/30 text-emerald-200'
                            : chip.used
                            ? 'bg-white/5 text-white/30'
                            : 'bg-white/10 text-white/80 group-hover:bg-white/15'
                        }`}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <span className={`text-[11px] sm:text-xs font-black tracking-tight truncate ${
                          chip.active ? 'text-emerald-200' : chip.used ? 'text-white/30 line-through' : 'text-white/90'
                        }`}>
                          {chip.name}
                        </span>
                      </div>
                      {chip.used && !chip.active && (
                        <span className="text-[8px] font-black text-white/30 bg-white/5 px-1.5 py-0.5 rounded">USED</span>
                      )}
                    </div>
                    <p className="text-[10px] text-white/40 leading-tight relative">{chip.description}</p>

                    {/* Cancel control on the active chip (only before deadline) */}
                    {chip.active && (
                      <div className="mt-2 pt-2 border-t border-emerald-500/20 relative">
                        {chip.canCancel ? (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setChipCancelConfirm(chip); }}
                            disabled={chipLoading}
                            className="w-full text-[10px] sm:text-[11px] font-bold text-rose-300 hover:text-rose-200 hover:bg-rose-500/10 active:scale-[0.98] disabled:opacity-50 transition px-2 py-1 rounded"
                          >
                            Cancel chip
                          </button>
                        ) : stageLocked ? (
                          <p className="text-[9px] sm:text-[10px] text-white/40 text-center font-medium">
                            Locked &mdash; stage has started
                          </p>
                        ) : chip.cancelBlockedReason ? (
                          <p className="text-[9px] sm:text-[10px] text-amber-300/70 text-center font-medium leading-tight">
                            {chip.cancelBlockedReason}
                          </p>
                        ) : null}
                        {chipDeadline && !stageLocked && (
                          <p className="text-[9px] sm:text-[10px] text-emerald-300/70 text-center mt-1">
                            Locks in {formatCountdown(chipDeadline, now)}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Chip Confirmation Modal */}
      {chipConfirm && (
        <div
          className="fixed inset-0 bg-black/80 z-[9999] backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setChipConfirm(null)}
        >
          <div
            className="bg-slate-900 border border-white/10 rounded-2xl w-full max-w-sm p-6 shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-white mb-2">Activate {chipConfirm.name}?</h3>
            <p className="text-white/60 text-sm mb-1">{chipConfirm.description}</p>
            {chipConfirm.id === 'FREE_HIT' && (
              <div className="mt-3 mb-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
                <p className="text-amber-300 text-xs font-semibold mb-1">How Free Hit works</p>
                <ul className="text-amber-200/80 text-xs space-y-1 list-disc list-inside">
                  <li>Unlimited free transfers for this stage</li>
                  <li>Your current squad is saved as a snapshot</li>
                  <li>At the end of the stage, your squad reverts to that snapshot automatically</li>
                </ul>
              </div>
            )}
            <p className="text-white/50 text-xs mb-6">
              You can still cancel this until the stage deadline starts.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setChipConfirm(null)}
                className="flex-1 px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white/70 font-medium hover:bg-white/10 transition-colors"
              >
                Back
              </button>
              <button
                onClick={() => activateChip(chipConfirm.id)}
                disabled={chipLoading}
                className="flex-1 px-4 py-2.5 bg-gradient-to-r from-emerald-500 to-emerald-600 rounded-xl text-white font-bold hover:from-emerald-600 hover:to-emerald-700 disabled:opacity-50 transition-all"
              >
                {chipLoading ? 'Activating...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Chip Cancellation Modal */}
      {chipCancelConfirm && (
        <div
          className="fixed inset-0 bg-black/80 z-[9999] backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setChipCancelConfirm(null)}
        >
          <div
            className="bg-slate-900 border border-white/10 rounded-2xl w-full max-w-sm p-6 shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-white mb-2">Cancel {chipCancelConfirm.name}?</h3>
            <p className="text-white/60 text-sm mb-3">
              Your {chipCancelConfirm.name} will be returned and you can use it again later.
            </p>
            {chipCancelConfirm.id === 'FREE_HIT' && (
              <div className="mb-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
                <p className="text-amber-300 text-xs font-semibold mb-1">Heads up</p>
                <p className="text-amber-200/80 text-xs leading-snug">
                  Any transfers you made under Free Hit will be reverted &mdash; your squad goes
                  back to exactly what it was before activation.
                </p>
              </div>
            )}
            {chipDeadline && !stageLocked && (
              <p className="text-emerald-300/80 text-xs mb-6">
                Stage locks in {formatCountdown(chipDeadline, now)}.
              </p>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => setChipCancelConfirm(null)}
                className="flex-1 px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white/70 font-medium hover:bg-white/10 transition-colors"
              >
                Keep it active
              </button>
              <button
                onClick={cancelActiveChip}
                disabled={chipLoading}
                className="flex-1 px-4 py-2.5 bg-gradient-to-r from-rose-500 to-rose-600 rounded-xl text-white font-bold hover:from-rose-600 hover:to-rose-700 disabled:opacity-50 transition-all"
              >
                {chipLoading ? 'Cancelling...' : 'Cancel chip'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pitch */}
      <div className="relative rounded-2xl mb-5 sm:mb-6 overflow-hidden shadow-[0_20px_60px_-20px_rgba(0,0,0,0.65)] ring-1 ring-white/10">
        <PitchBg />
        <div className="relative z-10 p-2 sm:p-6 space-y-4 sm:space-y-7 overflow-x-auto scrollbar-hide" style={{ WebkitOverflowScrolling: 'touch' }}>
          {/* FWD */}
          <div className="flex justify-center gap-1.5 sm:gap-6 min-w-max sm:min-w-0 animate-slide-down">
            {fwds.map(renderPitchPlayer)}
          </div>

          {/* MID */}
          <div className="flex justify-center gap-1 sm:gap-4 min-w-max sm:min-w-0 animate-slide-down" style={{ animationDelay: '60ms' }}>
            {mids.map(renderPitchPlayer)}
          </div>

          {/* DEF */}
          <div className="flex justify-center gap-1 sm:gap-4 min-w-max sm:min-w-0 animate-slide-down" style={{ animationDelay: '120ms' }}>
            {defs.map(renderPitchPlayer)}
          </div>

          {/* GK */}
          <div className="flex justify-center gap-2 sm:gap-6 min-w-max sm:min-w-0 animate-slide-down" style={{ animationDelay: '180ms' }}>
            {gks.map(renderPitchPlayer)}
          </div>
        </div>

        {/* Sub-mode floating banner */}
        {playerToSub && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 z-20 px-3 py-1.5 rounded-full bg-amber-500/95 text-black text-[11px] sm:text-xs font-black shadow-lg flex items-center gap-2 backdrop-blur-sm">
            <RefreshCw className="w-3 h-3 animate-spin-slow" />
            <span>Pick a player to swap with <span className="underline">{playerToSub.displayName}</span></span>
            <button
              onClick={() => setPlayerToSub(null)}
              className="ml-1 w-4 h-4 rounded-full bg-black/20 flex items-center justify-center hover:bg-black/30"
            >
              <X className="w-2.5 h-2.5" />
            </button>
          </div>
        )}
      </div>

      {/* Bench / Dugout */}
      <div className="px-3 sm:px-0 mb-5">
        <div className="relative rounded-2xl overflow-hidden ring-1 ring-white/10 shadow-xl">
          {/* Dugout roof */}
          <div className="h-2 bg-gradient-to-b from-slate-700 to-slate-900" />
          <div className="bg-gradient-to-b from-slate-900 via-slate-950 to-black p-3 sm:p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs sm:text-sm font-black text-white/70 uppercase tracking-widest flex items-center gap-2">
                <Users className="w-3.5 h-3.5" />
                Substitutes Bench
              </h2>
              <span className="text-[10px] text-white/30 uppercase tracking-wider">Auto-sub priority →</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
              {bench.map((p, i) => {
                const isSelected = playerToSub?.id === p.id;
                const isValid = !!playerToSub && !isSelected && validSwapTargets.has(p.id);
                const isDimmed = !!playerToSub && !isSelected && !validSwapTargets.has(p.id);
                return (
                  <div
                    key={p.id}
                    onClick={() => {
                      if (playerToSub) {
                        if (isValid || isSelected) {
                          swapPlayer(p);
                        } else {
                          setSelectedPlayer(p);
                        }
                      } else {
                        setSelectedPlayer(p);
                      }
                    }}
                    draggable
                    onDragStart={handleDragStart(p)}
                    onDragEnd={handleDragEnd}
                    onDragOver={handleDragOver(p)}
                    onDrop={handleDrop(p)}
                    className={`relative flex items-center gap-2 sm:gap-3 p-2 sm:p-3 rounded-xl cursor-pointer transition-all group overflow-hidden ${
                      isSelected
                        ? 'bg-amber-500/15 ring-2 ring-amber-400 animate-pulse'
                        : isValid
                        ? 'bg-emerald-500/10 ring-2 ring-emerald-400 shadow-[0_0_15px_rgba(52,211,153,0.4)] animate-pulse'
                        : isDimmed
                        ? 'bg-white/[0.02] ring-1 ring-white/5 opacity-30 grayscale'
                        : 'bg-white/[0.04] hover:bg-white/[0.08] ring-1 ring-white/5 hover:ring-white/15'
                    }`}
                  >
                    {/* Sub-priority number badge */}
                    <div className="flex flex-col items-center justify-center w-6 h-6 sm:w-7 sm:h-7 rounded-md bg-gradient-to-br from-pink-500 to-rose-600 text-white font-black text-xs shadow-md shrink-0">
                      {i + 1}
                    </div>
                    <Kit
                      primaryColor={p.nation?.kitColor1 || '#FFF'}
                      secondaryColor={p.nation?.kitColor2 || '#000'}
                      number={p.shirtNumber}
                      nationCode={p.nation?.code || ''}
                      size="xs"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-xs sm:text-sm font-bold truncate leading-tight">{p.displayName}</p>
                      <div className="flex items-center gap-1 mt-0.5">
                        <span className={`px-1 py-[1px] rounded-sm text-[8px] font-black ${
                          p.position === 'GK' ? 'bg-amber-500/20 text-amber-300' :
                          p.position === 'DEF' ? 'bg-sky-500/20 text-sky-300' :
                          p.position === 'MID' ? 'bg-emerald-500/20 text-emerald-300' :
                          'bg-rose-500/20 text-rose-300'
                        }`}>{p.position}</span>
                        <span className="text-white/40 text-[10px]">{p.points || 0} pts</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Desktop actions */}
      <div className="hidden sm:flex items-center justify-between px-3 sm:px-0">
        <p className="text-white/40 text-sm">Tap players to manage your team. Coloured badges show fixture difficulty.</p>
        <button
          onClick={saveChanges}
          disabled={saving}
          className="px-8 py-3 bg-gradient-to-r from-pink-500 to-rose-500 text-white rounded-xl font-bold hover:from-pink-600 hover:to-rose-600 disabled:opacity-50 transition-all shadow-[0_10px_30px_-10px_rgba(244,63,94,0.6)] flex items-center gap-2"
        >
          <Save className="w-4 h-4" />
          {saving ? 'Saving...' : 'Save Squad'}
        </button>
      </div>

      {/* Mobile sticky bottom bar */}
      <div className="sm:hidden fixed bottom-0 left-0 right-0 z-40 bg-slate-950/95 backdrop-blur-md border-t border-white/10 px-3 pt-2.5 add-pb-safe flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="text-center">
            <p className="text-[9px] text-white/40 uppercase font-bold leading-none">Pts</p>
            <p className="text-emerald-400 font-black text-sm leading-tight">{totalPoints}</p>
          </div>
          <div className="text-center">
            <p className="text-[9px] text-white/40 uppercase font-bold leading-none">Bank</p>
            <p className="text-white font-black text-sm leading-tight">£{bankBalance.toFixed(1)}m</p>
          </div>
        </div>
        <button
          onClick={saveChanges}
          disabled={saving}
          className="flex-1 max-w-[200px] px-4 py-3 bg-gradient-to-r from-pink-500 to-rose-500 text-white rounded-xl font-black text-sm hover:from-pink-600 hover:to-rose-600 disabled:opacity-50 transition-all shadow-lg flex items-center justify-center gap-2"
        >
          <Save className="w-4 h-4" />
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>

      {/* Player Detail Modal - Compact Card */}
      {selectedPlayer && (
        <div 
          className="fixed inset-0 bg-black/80 z-[9999] backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelectedPlayer(null);
          }}
          style={{ 
            position: 'fixed', 
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
            overflow: 'hidden'
          }}
        >
          <div 
            className="bg-slate-900 border border-white/10 rounded-2xl w-full max-w-sm shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Compact Header with X button */}
            <div className="relative bg-gradient-to-br from-emerald-600 via-emerald-700 to-emerald-900 p-4 rounded-t-2xl overflow-hidden">
              {/* Subtle pitch stripes background */}
              <div
                className="absolute inset-0 opacity-20 pointer-events-none"
                style={{
                  backgroundImage: 'repeating-linear-gradient(to bottom, rgba(255,255,255,0.06) 0 8%, rgba(0,0,0,0.10) 8% 16%)',
                }}
              />

              <button
                onClick={() => setSelectedPlayer(null)}
                className="absolute top-3 right-3 z-10 text-white bg-black/70 hover:bg-black p-2 rounded-full transition-all touch-manipulation shadow-lg"
                style={{
                  minWidth: '36px',
                  minHeight: '36px',
                  WebkitTapHighlightColor: 'transparent'
                }}
              >
                <X className="w-4 h-4" />
              </button>

              <div className="relative flex items-center gap-3 pr-10">
                <Kit
                  primaryColor={selectedPlayer.nation?.kitColor1 || '#FFF'}
                  secondaryColor={selectedPlayer.nation?.kitColor2 || '#000'}
                  number={selectedPlayer.shirtNumber}
                  nationCode={selectedPlayer.nation?.code || ''}
                  size="xs"
                  isCaptain={captainId === selectedPlayer.id}
                  isViceCaptain={viceCaptainId === selectedPlayer.id}
                />
                <div className="text-white flex-1 min-w-0">
                  <h2 className="text-lg font-black leading-tight truncate">{selectedPlayer.displayName}</h2>
                  <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                    <span className="inline-flex items-center gap-1 px-1.5 py-[2px] rounded-md bg-white/10 ring-1 ring-white/15">
                      <img src={getFlagUrl(selectedPlayer.nation?.code || '')} alt="" className="w-3.5 h-2.5 rounded-[1px] object-cover" />
                      <span className="text-white text-[10px] font-bold">{selectedPlayer.nation?.code}</span>
                    </span>
                    <span className={`px-1.5 py-[2px] rounded-md text-[10px] font-black ${
                      selectedPlayer.position === 'GK' ? 'bg-amber-500/30 text-amber-200 ring-1 ring-amber-400/40' :
                      selectedPlayer.position === 'DEF' ? 'bg-sky-500/30 text-sky-200 ring-1 ring-sky-400/40' :
                      selectedPlayer.position === 'MID' ? 'bg-emerald-500/30 text-emerald-200 ring-1 ring-emerald-400/40' :
                      'bg-rose-500/30 text-rose-200 ring-1 ring-rose-400/40'
                    }`}>{selectedPlayer.position}</span>
                    {(() => {
                      const opp = getNextOpponent(selectedPlayer.nation?.code || '');
                      const fdr = getFixtureDifficulty(selectedPlayer.nation?.code || '', opp);
                      return (
                        <span className="inline-flex items-center gap-1 px-1.5 py-[2px] rounded-md bg-black/30 ring-1 ring-white/10">
                          <span className="text-white/70 text-[9px] font-bold uppercase">Next</span>
                          <img src={getFlagUrl(opp)} alt={opp} className="w-3.5 h-2.5 rounded-[1px] object-cover" />
                          <span className="text-white text-[10px] font-bold">{opp}</span>
                          <span className={`inline-flex items-center justify-center w-3.5 h-3.5 rounded-sm text-[9px] font-black ${fdrPill(fdr)}`}>{fdr}</span>
                        </span>
                      );
                    })()}
                  </div>
                </div>
              </div>
            </div>

            {/* Compact Content */}
            <div className="p-4 space-y-4">
              {/* Quick Actions */}
              <div className="grid grid-cols-4 gap-2">
                <button
                  onClick={() => {
                    swapPlayer(selectedPlayer);
                    if (!playerToSub) setSelectedPlayer(null);
                  }}
                  className={`flex flex-col items-center justify-center p-2 rounded-lg border transition-all text-xs ${
                    playerToSub?.id === selectedPlayer.id
                      ? 'bg-amber-500/20 border-amber-500 text-amber-500'
                      : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10'
                  }`}
                >
                  <span className="text-sm mb-0.5">🔄</span>
                  <span className="text-[9px] font-bold">Sub</span>
                </button>

                <button
                  onClick={() => setCaptain(selectedPlayer.id)}
                  className={`flex flex-col items-center justify-center p-2 rounded-lg border transition-all text-xs ${
                    captainId === selectedPlayer.id
                      ? 'bg-yellow-500/20 border-yellow-500 text-yellow-500'
                      : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10'
                  }`}
                >
                  <span className="text-sm font-black mb-0.5">C</span>
                  <span className="text-[9px] font-bold">Capt</span>
                </button>

                <button
                  onClick={() => setViceCaptain(selectedPlayer.id)}
                  className={`flex flex-col items-center justify-center p-2 rounded-lg border transition-all text-xs ${
                    viceCaptainId === selectedPlayer.id
                      ? 'bg-gray-400/20 border-gray-400 text-gray-400'
                      : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10'
                  }`}
                >
                  <span className="text-sm font-black mb-0.5">V</span>
                  <span className="text-[9px] font-bold">V-Capt</span>
                </button>

                <div className="flex flex-col items-center justify-center p-2 rounded-lg bg-white/5 border border-white/10 text-emerald-400">
                  <span className="text-sm font-bold mb-0.5">{selectedPlayer.points || 0}</span>
                  <span className="text-[9px] font-bold text-white/40">Points</span>
                </div>
              </div>

              {/* Sub Mode Hint */}
              {playerToSub && playerToSub.id !== selectedPlayer.id && (
                <div className="p-2 bg-amber-500/10 border border-amber-500/30 rounded-lg text-center">
                  <p className="text-amber-500 text-xs font-medium">
                    Select player to swap with <span className="font-bold">{playerToSub.displayName}</span>
                  </p>
                  <button 
                    onClick={() => setPlayerToSub(null)}
                    className="mt-1 text-[10px] text-amber-500 underline"
                  >
                    Cancel
                  </button>
                </div>
              )}

              {/* World Cup Stats */}
              <div>
                <h3 className="text-[10px] font-bold text-white/40 uppercase tracking-wider mb-2">Stats</h3>
                <div className="grid grid-cols-3 gap-2">
                  <StatItem label="Goals" value={selectedPlayer.stats?.goals || 0} />
                  <StatItem label="Assists" value={selectedPlayer.stats?.assists || 0} />
                  <StatItem label="Pass %" value={selectedPlayer.stats?.passAccuracy ? `${selectedPlayer.stats.passAccuracy}%` : '0%'} />
                  <StatItem label="Inter" value={selectedPlayer.stats?.interceptions || 0} />
                  <StatItem label="Tackles" value={selectedPlayer.stats?.tackles || 0} />
                  <StatItem label="Dribbles" value={selectedPlayer.stats?.dribbles || 0} />
                </div>
              </div>

              {/* Fixtures Table */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-[10px] font-bold text-white/40 uppercase tracking-wider">Fixtures</h3>
                  <FdrLegend />
                </div>
                <div className="rounded-lg border border-white/10 overflow-hidden">
                  {/* Table Header */}
                  <div className="grid grid-cols-12 gap-1 bg-white/5 px-2 py-1.5 text-[9px] font-bold text-white/40 uppercase tracking-wider items-center">
                    <div className="col-span-3">Date</div>
                    <div className="col-span-5">Opponent</div>
                    <div className="col-span-1 text-center">G</div>
                    <div className="col-span-1 text-center">A</div>
                    <div className="col-span-2 text-center">Pts</div>
                  </div>

                  {/* Table Body */}
                  <div className="max-h-40 overflow-y-auto">
                    {getNationFixtures(selectedPlayer.nation?.code || '').map((fixture) => {
                      const opponent = fixture.home === selectedPlayer.nation?.code ? fixture.away : fixture.home;
                      const opponentName = NATION_NAMES[opponent] || opponent;
                      const fixtureDate = parseFixtureDateTime(fixture.date, fixture.time);
                      const isPast = fixtureDate < new Date();
                      const isPlayed = fixture.isPlayed;
                      const isHome = fixture.home === selectedPlayer.nation?.code;
                      const fdr = getFixtureDifficulty(selectedPlayer.nation?.code || '', opponent);

                      const goals = isPlayed ? (fixture.playerGoals || 0) : null;
                      const assists = isPlayed ? (fixture.playerAssists || 0) : null;
                      const points = isPlayed ? (fixture.playerPoints || 0) : null;

                      return (
                        <div
                          key={fixture.id}
                          className={`grid grid-cols-12 gap-1 px-2 py-1.5 border-t border-white/5 items-center ${
                            isPast && !isPlayed ? 'opacity-40' : ''
                          }`}
                        >
                          {/* Date */}
                          <div className="col-span-3 text-[10px] text-white/60">
                            {formatFixtureDate(fixture.date)}
                          </div>

                          {/* Opponent (flag + difficulty pill) */}
                          <div className="col-span-5 flex items-center gap-1.5 min-w-0">
                            <img
                              src={getFlagUrl(opponent)}
                              alt={opponent}
                              className="w-4 h-3 rounded-sm object-cover ring-1 ring-white/10 shrink-0"
                            />
                            <span className="text-[10px] text-white/80 font-medium truncate">
                              {isHome ? 'vs' : '@'} {opponentName}
                            </span>
                            <span
                              className={`shrink-0 ml-auto inline-flex items-center justify-center w-4 h-4 rounded-sm text-[9px] font-black ${fdrPill(fdr)}`}
                              title={`FDR ${fdr}`}
                            >
                              {fdr}
                            </span>
                          </div>

                          {/* Goals */}
                          <div className="col-span-1 text-center">
                            <span className={`text-[10px] font-bold ${goals && goals > 0 ? 'text-emerald-400' : 'text-white/40'}`}>
                              {goals ?? '–'}
                            </span>
                          </div>

                          {/* Assists */}
                          <div className="col-span-1 text-center">
                            <span className={`text-[10px] font-bold ${assists && assists > 0 ? 'text-emerald-400' : 'text-white/40'}`}>
                              {assists ?? '–'}
                            </span>
                          </div>

                          {/* Points */}
                          <div className="col-span-2 text-center">
                            <span className={`text-[10px] font-bold ${points && points > 0 ? 'text-emerald-400' : 'text-white/40'}`}>
                              {points ?? '–'}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                    {getNationFixtures(selectedPlayer.nation?.code || '').length === 0 && (
                      <div className="text-center text-white/30 text-xs py-3">No fixtures</div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatItem({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-white/5 rounded-lg p-2 border border-white/5">
      <p className="text-[9px] font-bold text-white/30 uppercase tracking-wider mb-0.5">{label}</p>
      <p className="text-sm font-bold text-white">{value}</p>
    </div>
  );
}

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  /** Optional small subtext shown under the value (e.g. "7:00 PM · in 29d"). */
  hint?: string;
  accent?: string;
  highlight?: boolean;
}

function StatCard({ icon, label, value, hint, accent = 'text-white', highlight = false }: StatCardProps) {
  return (
    <div className={`relative px-3 py-2 rounded-xl border overflow-hidden transition-all ${
      highlight
        ? 'bg-gradient-to-br from-emerald-500/10 to-emerald-700/5 border-emerald-500/30 shadow-[0_0_20px_-5px_rgba(16,185,129,0.4)]'
        : 'bg-white/5 border-white/10'
    }`}>
      <div className="flex items-center gap-1.5 mb-0.5">
        <span className={accent}>{icon}</span>
        <p className="text-[9px] sm:text-[10px] uppercase tracking-wider font-bold text-white/50 leading-none">{label}</p>
      </div>
      <p className={`text-base sm:text-xl font-black leading-tight ${accent}`}>{value}</p>
      {hint && (
        <p className="text-[9px] sm:text-[10px] font-medium text-white/40 mt-0.5 leading-tight truncate">
          {hint}
        </p>
      )}
    </div>
  );
}

// Compact countdown like "2d 5h", "3h 12m", "47m", "now" — used for the chip
// "Locks in …" hint on the active chip card. Thin wrapper around the shared
// formatter so this file keeps its existing call signature.
function formatCountdown(deadlineIso: string, nowMs: number): string {
  const target = new Date(deadlineIso).getTime();
  if (target - nowMs <= 0) return 'now';
  return formatDuration(target, nowMs);
}

// Map a chip name to a Lucide icon
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function chipIcon(name: string): any {
  const n = name.toLowerCase();
  if (n.includes('free hit') || n.includes('free-hit')) return Wand2;
  if (n.includes('wildcard')) return RefreshCw;
  if (n.includes('triple') || n.includes('captain')) return Crown;
  if (n.includes('bench')) return Users;
  if (n.includes('boost')) return Zap;
  return Sparkles;
}

// FDR cell pill color
function fdrPill(fdr: number): string {
  switch (fdr) {
    case 1: return 'bg-emerald-500 text-white';
    case 2: return 'bg-emerald-700 text-emerald-100';
    case 3: return 'bg-slate-500 text-white';
    case 4: return 'bg-rose-600 text-white';
    case 5: return 'bg-rose-900 text-rose-100';
    default: return 'bg-slate-700 text-white';
  }
}

// Color legend for fixture difficulty (1 easiest → 5 hardest)
function FdrLegend() {
  const items: { n: number; label: string }[] = [
    { n: 1, label: 'Easy' },
    { n: 2, label: '' },
    { n: 3, label: 'Avg' },
    { n: 4, label: '' },
    { n: 5, label: 'Hard' },
  ];
  return (
    <div className="flex items-center gap-1">
      <span className="text-[8px] uppercase tracking-wider font-bold text-white/30 mr-1">FDR</span>
      {items.map(it => (
        <span
          key={it.n}
          className={`inline-flex items-center justify-center w-3.5 h-3.5 rounded-sm text-[8px] font-black ${fdrPill(it.n)}`}
          title={`${it.n} – ${it.label || (it.n < 3 ? 'Easy' : 'Hard')}`}
        >
          {it.n}
        </span>
      ))}
    </div>
  );
}
