import { notFound } from 'next/navigation'
import { requirePageUserId } from '@/lib/pageAuth'
import { loadTripView } from '@/lib/trips/tripView'
import TripMapView from '../../../../components/map/TripMapView'

// The trip on an interactive globe — an alternative view of the same trip
// as the timeline page, loaded through the same loader so recovery state,
// approvals and monitoring match exactly (lib/trips/tripView.ts).
export default async function TripMapPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const view = await loadTripView(id, await requirePageUserId())
  if (!view) notFound()
  return <TripMapView trip={view.dto} homeTimezone={view.homeTimezone} />
}
