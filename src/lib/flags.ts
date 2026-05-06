// Flag CDN URL generator
// Using flagcdn.com - free and reliable

// 3-letter FIFA-style code → 2-letter ISO code (or special slugs)
// Official 2026 FIFA World Cup qualified nations.
const FLAG_CODES: Record<string, string> = {
  // Group A
  MEX: 'mx',
  RSA: 'za',
  KOR: 'kr',
  CZE: 'cz', // Czechia – UEFA Playoff D winner

  // Group B
  CAN: 'ca',
  BIH: 'ba', // Bosnia & Herzegovina – UEFA Playoff A winner
  QAT: 'qa',
  SUI: 'ch',

  // Group C
  BRA: 'br',
  MAR: 'ma',
  HAI: 'ht',
  SCO: 'gb-sct',

  // Group D
  USA: 'us',
  PAR: 'py',
  AUS: 'au',
  TUR: 'tr', // Türkiye – UEFA Playoff C winner

  // Group E
  GER: 'de',
  CUW: 'cw',
  CIV: 'ci',
  ECU: 'ec',

  // Group F
  NED: 'nl',
  JPN: 'jp',
  SWE: 'se', // Sweden – UEFA Playoff B winner
  TUN: 'tn',

  // Group G
  BEL: 'be',
  EGY: 'eg',
  IRN: 'ir',
  NZL: 'nz',

  // Group H
  ESP: 'es',
  CPV: 'cv',
  KSA: 'sa',
  URU: 'uy',

  // Group I
  FRA: 'fr',
  SEN: 'sn',
  IRQ: 'iq', // Iraq – FIFA Inter-Confederation Playoff 2 winner
  NOR: 'no',

  // Group J
  ARG: 'ar',
  ALG: 'dz',
  AUT: 'at',
  JOR: 'jo',

  // Group K
  POR: 'pt',
  COD: 'cd', // DR Congo – FIFA Inter-Confederation Playoff 1 winner
  UZB: 'uz',
  COL: 'co',

  // Group L
  ENG: 'gb-eng',
  CRO: 'hr',
  GHA: 'gh',
  PAN: 'pa',
};

// Size presets for flag dimensions (width x height)
const FLAG_SIZES = {
  sm: '20x15',
  md: '40x30',
  lg: '80x60',
} as const;

export function getFlagUrl(nationCode: string | undefined | null, size: 'sm' | 'md' | 'lg' = 'md'): string {
  if (!nationCode) return '';
  try {
    const isoCode = FLAG_CODES[nationCode.toUpperCase()] || nationCode.toLowerCase();
    const dimensions = FLAG_SIZES[size];
    return `https://flagcdn.com/${dimensions}/${isoCode}.png`;
  } catch {
    return '';
  }
}

export function getFlagCode(nationCode: string | undefined | null): string {
  if (!nationCode) return '';
  return FLAG_CODES[nationCode.toUpperCase()] || nationCode.toLowerCase();
}
