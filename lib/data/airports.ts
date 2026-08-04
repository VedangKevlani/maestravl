/**
 * Curated subset of IATA airport codes. IATA codes are public identifiers
 * (not proprietary data), so this dictionary is free to embed and extend.
 * Weighted toward major global hubs + the Caribbean, matching Ripple's focus.
 * For broader coverage later, this can be swapped for the free/open
 * openflights.org airports.dat without changing any calling code.
 */
export const AIRPORTS: Record<string, { name: string; city: string; country: string }> = {
  KIN: { name: 'Norman Manley International', city: 'Kingston', country: 'Jamaica' },
  MBJ: { name: 'Sangster International', city: 'Montego Bay', country: 'Jamaica' },
  NAS: { name: 'Lynden Pindling International', city: 'Nassau', country: 'Bahamas' },
  SJU: { name: 'Luis Muñoz Marín International', city: 'San Juan', country: 'Puerto Rico' },
  POS: { name: 'Piarco International', city: 'Port of Spain', country: 'Trinidad and Tobago' },
  BGI: { name: 'Grantley Adams International', city: 'Bridgetown', country: 'Barbados' },
  AUA: { name: 'Queen Beatrix International', city: 'Oranjestad', country: 'Aruba' },
  CUR: { name: 'Hato International', city: 'Willemstad', country: 'Curaçao' },
  PUJ: { name: 'Punta Cana International', city: 'Punta Cana', country: 'Dominican Republic' },
  SDQ: { name: 'Las Américas International', city: 'Santo Domingo', country: 'Dominican Republic' },
  MIA: { name: 'Miami International', city: 'Miami', country: 'USA' },
  FLL: { name: 'Fort Lauderdale–Hollywood International', city: 'Fort Lauderdale', country: 'USA' },
  JFK: { name: 'John F. Kennedy International', city: 'New York', country: 'USA' },
  EWR: { name: 'Newark Liberty International', city: 'Newark', country: 'USA' },
  ATL: { name: 'Hartsfield–Jackson Atlanta International', city: 'Atlanta', country: 'USA' },
  ORD: { name: "O'Hare International", city: 'Chicago', country: 'USA' },
  LAX: { name: 'Los Angeles International', city: 'Los Angeles', country: 'USA' },
  IAH: { name: 'George Bush Intercontinental', city: 'Houston', country: 'USA' },
  YYZ: { name: 'Toronto Pearson International', city: 'Toronto', country: 'Canada' },
  LHR: { name: 'Heathrow', city: 'London', country: 'UK' },
  LGW: { name: 'Gatwick', city: 'London', country: 'UK' },
  CDG: { name: 'Charles de Gaulle', city: 'Paris', country: 'France' },
  AMS: { name: 'Schiphol', city: 'Amsterdam', country: 'Netherlands' },
  FRA: { name: 'Frankfurt', city: 'Frankfurt', country: 'Germany' },
  MEX: { name: 'Mexico City International', city: 'Mexico City', country: 'Mexico' },
  CUN: { name: 'Cancún International', city: 'Cancún', country: 'Mexico' },
  BOG: { name: 'El Dorado International', city: 'Bogotá', country: 'Colombia' },
  PTY: { name: 'Tocumen International', city: 'Panama City', country: 'Panama' },
  GCM: { name: 'Owen Roberts International', city: 'George Town', country: 'Cayman Islands' },
  ANU: { name: 'V.C. Bird International', city: "St. John's", country: 'Antigua and Barbuda' },
  SXM: { name: 'Princess Juliana International', city: 'Philipsburg', country: 'Sint Maarten' },
  GND: { name: 'Maurice Bishop International', city: "St. George's", country: 'Grenada' },
  SLU: { name: 'Hewanorra International', city: 'Vieux Fort', country: 'Saint Lucia' },
  UVF: { name: 'Hewanorra International', city: 'Vieux Fort', country: 'Saint Lucia' },
}

export function lookupAirport(code: string): { name: string; city: string; country: string } | null {
  return AIRPORTS[code.toUpperCase()] ?? null
}
