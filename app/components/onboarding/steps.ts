// Pure — the interactive onboarding tour's content and completion rules,
// no JSX. Kept as plain data so the flow can be scanned/edited without
// touching the rendering logic in OnboardingOverlay.tsx.

export interface TourStepCompletion {
  /**
   * This step's action navigates away entirely (e.g. clicking "+ New Trip"
   * lands on /trips/new). Advance once the current pathname no longer
   * matches this step's own `path` — works regardless of which of several
   * valid actions the passenger took, since it only cares that they left.
   */
  onNavigateAway?: true
  /**
   * This step's action happens on the same page (e.g. adding a passenger
   * renders a new chip). Advance once
   * `document.querySelectorAll(selector).length` exceeds the count
   * observed the moment this step became active.
   */
  selectorCountIncreases?: string
}

export interface TourStep {
  id: string
  /** Matched against the current pathname — the step is only ever shown on a matching route. */
  path: RegExp
  /** Matches a `data-tour="..."` attribute on the real element to highlight. */
  target: string
  title: string
  note: string
  placement: 'top' | 'bottom' | 'left' | 'right'
  /** Present = the passenger does the real thing to advance (no "Next" button); absent = informational, advances on "Next". */
  completion?: TourStepCompletion
}

const TRIP_PATH = /^\/trips\/[^/]+$/

export const TOUR_STEPS: TourStep[] = [
  {
    id: 'dashboard-welcome',
    path: /^\/dashboard$/,
    target: 'dashboard-heading',
    title: 'Welcome to Maestravl',
    note: "This is your dashboard — every trip you're tracking lives here, with anything that needs your attention surfaced first.",
    placement: 'bottom',
  },
  {
    id: 'dashboard-new-trip',
    path: /^\/dashboard$/,
    target: 'new-trip-button',
    title: 'Start your first trip',
    note: "Click here to create one — nothing is booked or charged, this just gives Maestravl something to watch over.",
    placement: 'bottom',
    completion: { onNavigateAway: true },
  },
  {
    id: 'trips-new-start',
    path: /^\/trips\/new$/,
    target: 'trip-start-options',
    title: 'Two ways to start',
    note: 'Drop a screenshot or PDF of a confirmation and Maestravl reads the details automatically — or skip straight to naming a trip and building it by hand. Try either one now.',
    placement: 'bottom',
    completion: { onNavigateAway: true },
  },
  {
    id: 'trip-header',
    path: TRIP_PATH,
    target: 'trip-header',
    title: 'Your trip',
    note: 'Title, status, a menu to delete the trip, and a downloadable activity log — the full record of everything Maestravl has done here.',
    placement: 'bottom',
  },
  {
    id: 'trip-add-passenger',
    path: TRIP_PATH,
    target: 'add-passenger',
    title: "Add who's traveling",
    note: "Add a passenger with an email or phone number and Maestravl notifies them directly if anything changes. Try adding one now.",
    placement: 'top',
    completion: { selectorCountIncreases: '[data-tour="passenger-chip"]' },
  },
  {
    id: 'trip-timezone',
    path: TRIP_PATH,
    target: 'home-timezone',
    title: 'Your home time zone',
    note: 'Set this once and every time on this trip is also shown in your terms — handy for a late-night arrival in a different zone.',
    placement: 'top',
  },
  {
    id: 'trip-add-segment',
    path: TRIP_PATH,
    target: 'add-segment-form',
    title: 'Add a segment',
    note: 'A flight, train, hotel — anything with a time and place. Click "+ New Trip Segment," pick a type, and fill in what you know. Try it now.',
    placement: 'top',
    completion: { selectorCountIncreases: '[data-tour="segment-card"]' },
  },
  {
    id: 'trip-timeline',
    path: TRIP_PATH,
    target: 'timeline',
    title: 'The timeline',
    note: 'Every segment shows up here in order — drag the handle on the left to reorder, and open "Manage" on any segment to edit it, remove it, or report a delay.',
    placement: 'bottom',
  },
  {
    id: 'trip-upload-more',
    path: TRIP_PATH,
    target: 'upload-more',
    title: 'Import more as you go',
    note: 'Got another confirmation email? Drop it here any time — it gets added to this same trip.',
    placement: 'top',
  },
  {
    id: 'trip-voice',
    path: TRIP_PATH,
    target: 'voice-widget',
    title: 'Ask Maestravl',
    note: "Hold this to ask about your itinerary or what Maestravl is handling — out loud. It only answers questions; changes always happen here in the app, never by voice.",
    placement: 'left',
  },
]
