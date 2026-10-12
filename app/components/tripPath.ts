// Which trip page (if any) a pathname is — shared by the header and the
// chat so they agree. /trips/new is the create page, not a trip.
const TRIP_PATH = /^\/trips\/(?!new(?:\/|$))([^/]+)(\/map)?/

export function tripFromPath(pathname: string | null): { tripId: string | null; onMap: boolean } {
  const m = pathname?.match(TRIP_PATH)
  return { tripId: m?.[1] ?? null, onMap: Boolean(m?.[2]) }
}
