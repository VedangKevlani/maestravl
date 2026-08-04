/**
 * Curated subset of IATA airline codes. Like airport codes, these are public
 * identifiers. Weighted toward carriers serving the Caribbean.
 */
export const AIRLINES: Record<string, string> = {
  AA: 'American Airlines',
  DL: 'Delta Air Lines',
  UA: 'United Airlines',
  B6: 'JetBlue Airways',
  WN: 'Southwest Airlines',
  AC: 'Air Canada',
  BA: 'British Airways',
  AF: 'Air France',
  KL: 'KLM',
  LH: 'Lufthansa',
  BW: 'Caribbean Airlines',
  JY: 'InterCaribbean Airways',
  '3M': 'Silver Airways',
  P4: 'Air Peace',
  KX: 'Cayman Airways',
  LI: 'LIAT',
  V3: 'Carpatair',
  NK: 'Spirit Airlines',
  F9: 'Frontier Airlines',
  AM: 'Aeroméxico',
  CM: 'Copa Airlines',
  AV: 'Avianca',
  VS: 'Virgin Atlantic',
  TS: 'Air Transat',
  '4O': 'Interjet',
  Y4: 'Volaris',
  JM: 'Jamaica Air (charter)',
}

export function lookupAirline(code: string): string | null {
  return AIRLINES[code.toUpperCase()] ?? null
}
