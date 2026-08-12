// Pure matching/classification logic for the Transitland-backed train/bus
// adapters (see transitlandAdapter.ts for the impure half). No network or
// DB access — unit-testable without an API key, same convention as
// lib/agents/contactDiscovery.ts, whose hostnameLikelyBelongsTo this
// mirrors: never guess a low-confidence match, return null and let the
// adapter report an honest noMatch rather than acting on something
// plausible-but-wrong.
import type { MonitoringCheckStatus } from '../../types'

export interface TransitlandOperator {
  onestop_id: string
  name: string | null
}

export interface TransitlandAlert {
  cause?: string | null
  effect?: string | null
  // Transitland's REST JSON serialization of a GTFS-RT Alert's translated
  // text fields hasn't been empirically confirmed (no API key available to
  // test against a live response) — accept whatever shape shows up rather
  // than assuming one, see extractAlertText below.
  header_text?: unknown
  description_text?: unknown
}

export interface TransitlandRoute {
  onestop_id: string
  route_id: string | null
  route_short_name: string | null
  route_long_name: string | null
  alerts?: TransitlandAlert[]
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '')
}

/**
 * Picks the operator whose name most plausibly matches the segment's
 * `provider` field. Requires at least a substring match either direction —
 * never falls back to "first result" the way a lower-stakes UI autocomplete
 * might, since a wrong operator match would misreport a real segment's
 * status against an unrelated one.
 */
export function pickBestOperatorMatch(operators: TransitlandOperator[], providerName: string): TransitlandOperator | null {
  const target = normalize(providerName)
  if (target.length < 2) return null

  let best: TransitlandOperator | null = null
  for (const operator of operators) {
    if (!operator.name) continue
    const candidate = normalize(operator.name)
    if (candidate.length < 2) continue
    if (candidate === target) return operator // exact match short-circuits
    if (!best && (candidate.includes(target) || target.includes(candidate))) {
      best = operator
    }
  }
  return best
}

/**
 * Picks the route whose short/long name most plausibly matches the
 * segment's `identifier` (a train/bus number, e.g. "42" or "Northeast
 * Regional 171"). Short-name exact match is preferred (route numbers are
 * usually filed there), then long-name exact, then a substring match on
 * either.
 */
export function pickBestRouteMatch(routes: TransitlandRoute[], identifier: string): TransitlandRoute | null {
  const target = normalize(identifier)
  if (target.length < 1) return null

  for (const route of routes) {
    if (route.route_short_name && normalize(route.route_short_name) === target) return route
  }
  for (const route of routes) {
    if (route.route_long_name && normalize(route.route_long_name) === target) return route
  }
  for (const route of routes) {
    const short = route.route_short_name ? normalize(route.route_short_name) : ''
    const long = route.route_long_name ? normalize(route.route_long_name) : ''
    if ((short && (short.includes(target) || target.includes(short))) || (long && long.includes(target))) {
      return route
    }
  }
  return null
}

/** Pulls whatever plain text is findable out of an unknown header/description_text shape — a string, a {translation:[{text}]} GTFS-RT-JSON shape, or anything else — without assuming one specific serialization. */
function extractAlertText(value: unknown): string {
  if (!value) return ''
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.map(extractAlertText).filter(Boolean).join(' ')
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>
    if (typeof obj.text === 'string') return obj.text
    if (Array.isArray(obj.translation)) return extractAlertText(obj.translation)
    return Object.values(obj).map(extractAlertText).filter(Boolean).join(' ')
  }
  return ''
}

const CANCELLATION_EFFECTS = new Set(['NO_SERVICE'])
const DELAY_EFFECTS = new Set(['SIGNIFICANT_DELAYS', 'DETOUR', 'REDUCED_SERVICE', 'MODIFIED_SERVICE'])
const CANCELLATION_KEYWORDS = /\b(cancell?ed|suspended|no service)\b/i
const DELAY_KEYWORDS = /\b(delay(?:ed|s)?|detour|disruption)\b/i
const DELAY_MINUTES_PATTERN = /(\d{1,4})\s*\+?\s*min(?:ute)?s?\b/i

export interface AlertClassification {
  status: MonitoringCheckStatus
  delayMinutes?: number
  message?: string
}

/**
 * Turns a route's active GTFS-RT alerts into a MonitoringCheckResult-shaped
 * read. Prefers the structured `effect` field when present (a real signal
 * from the feed itself); falls back to keyword-matching the alert text when
 * `effect` is missing/unrecognized. delayMinutes is only ever set when an
 * explicit "N minutes" figure is extractable from the text — never
 * fabricated from an effect code alone, since GTFS-RT alerts are
 * human-readable banners, not a guaranteed structured delay estimate.
 */
export function classifyAlerts(alerts: TransitlandAlert[] | null | undefined): AlertClassification {
  if (!alerts || alerts.length === 0) return { status: 'ON_TIME' }

  let worst: AlertClassification | null = null

  for (const alert of alerts) {
    const text = [extractAlertText(alert.header_text), extractAlertText(alert.description_text)].filter(Boolean).join(' — ')
    const effect = alert.effect?.toUpperCase()

    let status: MonitoringCheckStatus
    if (effect && CANCELLATION_EFFECTS.has(effect)) status = 'CANCELLED'
    else if (effect && DELAY_EFFECTS.has(effect)) status = 'DELAYED'
    else if (CANCELLATION_KEYWORDS.test(text)) status = 'CANCELLED'
    else if (DELAY_KEYWORDS.test(text)) status = 'DELAYED'
    else continue // an alert that doesn't signal a service disruption (e.g. an informational notice) — skip it

    const minutesMatch = DELAY_MINUTES_PATTERN.exec(text)
    const delayMinutes = minutesMatch ? Number(minutesMatch[1]) : undefined

    const classification: AlertClassification = { status, delayMinutes, message: text || undefined }

    // CANCELLED outranks DELAYED if multiple alerts disagree.
    if (!worst || (status === 'CANCELLED' && worst.status !== 'CANCELLED')) {
      worst = classification
    }
  }

  return worst ?? { status: 'ON_TIME' }
}
