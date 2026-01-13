// Flag CDN URL generator
// Using flagcdn.com - free and reliable

// Map our 3-letter codes to 2-letter ISO codes for flags
const FLAG_CODES: Record<string, string> = {
  // Group A
  MEX: 'mx',
  RSA: 'za',
  KOR: 'kr',
  
  // Group B
  CAN: 'ca',
  QAT: 'qa',
  SUI: 'ch',
  
  // Group C
  BRA: 'br',
  MAR: 'ma',
  HAI: 'ht',
  SCO: 'gb-sct', // Scotland
  
  // Group D
  USA: 'us',
  PAR: 'py',
  AUS: 'au',
  
  // Group E
  GER: 'de',
  CUW: 'cw',
  CIV: 'ci',
  ECU: 'ec',
  
  // Group F
  NED: 'nl',
  JPN: 'jp',
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
  NOR: 'no',
  
  // Group J
  ARG: 'ar',
  ALG: 'dz',
  JOR: 'jo',
  
  // Group K
  POR: 'pt',
  UZB: 'uz',
  COL: 'co',
  
  // Group L
  ENG: 'gb-eng', // England
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
