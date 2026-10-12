import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { requirePageUserId } from '@/lib/pageAuth'
import { loadTripActivity } from '@/lib/trips/activityFeed'
import { loadTripView } from '@/lib/trips/tripView'
import TripActivityTabs, { type ActivityItemDTO } from '../../../components/TripActivityTabs'
import UploadDropzone from '../../../components/UploadDropzone'
import TripHeader from '../../../components/TripHeader'
import TripAddSegmentClient from '../../../components/TripAddSegmentClient'
import VoiceWidget from '../../../components/VoiceWidget'

export default async function TripDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const userId = await requirePageUserId()

  // The trip itself comes from the loader shared with the map view
  // (lib/trips/tripView.ts). The activity feed is only shown here; nothing
  // from it renders unless the ownership-checked loader finds the trip.
  const [view, activityEntries] = await Promise.all([loadTripView(id, userId), loadTripActivity(id)])
  if (!view) notFound()
  const { dto } = view
  const user = { homeTimezone: view.homeTimezone }

  // Newest first — the data behind the "Trip Updates" tab.
  const activity: ActivityItemDTO[] = activityEntries.map((e) => ({
    id: e.id,
    segmentId: e.segmentId,
    segmentLabel: e.segmentLabel,
    detectedAt: e.createdAt.toISOString(),
    type: e.type,
    message: e.message,
  }))

  // Segments actively being watched by the monitoring service — surfaced
  // in TripHeader's "Monitoring N Segments" pill.

  return (
    <div>
      <TripHeader trip={dto} homeTimezone={user?.homeTimezone ?? null} />

      <TripAddSegmentClient
        segments={dto.segments}
        passengers={dto.passengers}
        tripId={dto.id}
      />

      <div data-tour="upload-more">
        <UploadDropzone tripId={dto.id} variant="mini" />
      </div>

      <section className="mt-8">
        {/* TripActivityTabs reads ?tab=/&segment= via useSearchParams (the
            BoardingPass "View full history" link lands here) — wrapped in
            Suspense to match the pattern used on the auth pages, so this
            doesn't force a client-side bailout during the build's static
            analysis of this route. */}
        <Suspense fallback={null}>
          <TripActivityTabs
            tripId={dto.id}
            tripTitle={dto.title}
            segments={dto.segments}
            passengers={dto.passengers}
            homeTimezone={user?.homeTimezone ?? null}
            activity={activity}
          />
        </Suspense>
      </section>

      <VoiceWidget tripId={dto.id} />
    </div>
  )
}
