import type { MonitorableSegment, MonitoringAdapter, MonitoringCheckResult, MonitoringCheckStatus } from '../types'

const ENV_VAR = 'FLIGHT_MONITORING_API_KEY'

// AviationStack's free tier only serves over plain HTTP, not HTTPS — switch
// to https:// if the connected key is on a paid plan.
const AVIATIONSTACK_URL = 'http://api.aviationstack.com/v1/flights'

function buildTrackingKey(segment: MonitorableSegment): string | null {
  if (!segment.identifier || !segment.departureTime) return null
  return `${segment.identifier}:${segment.departureTime.toISOString().slice(0, 10)}`
}

function mapStatus(flightStatus: string | undefined, delayMinutes: number | undefined): MonitoringCheckStatus {
  switch (flightStatus) {
    case 'scheduled':
      return delayMinutes && delayMinutes > 0 ? 'DELAYED' : 'ON_TIME'
    case 'active':
      return 'DEPARTED'
    case 'landed':
      return 'ARRIVED'
    case 'cancelled':
      return 'CANCELLED'
    default:
      return 'UNKNOWN'
  }
}

export const flightAdapter: MonitoringAdapter = {
  id: 'flight-adapter-v1',
  supports: ['FLIGHT'],
  isConfigured() {
    return Boolean(process.env[ENV_VAR])
  },
  buildTrackingKey,
  async check(segment: MonitorableSegment): Promise<MonitoringCheckResult> {
    const apiKey = process.env[ENV_VAR]
    if (!apiKey) {
      return {
        status: 'UNKNOWN',
        message: `flight-adapter-v1 is not connected yet — set ${ENV_VAR} to enable live checks.`,
        checkedAt: new Date(),
      }
    }

    const flightIata = segment.identifier?.replace(/\s+/g, '')
    if (!flightIata || !segment.departureTime) {
      return { status: 'UNKNOWN', message: 'Segment is missing a flight number or departure date', checkedAt: new Date() }
    }

    // The free AviationStack plan rejects `flight_date` on this endpoint
    // with a 403 "function_access_restricted" — historical/specific-date
    // lookup is a paid-plan feature. Query by flight_iata alone (which the
    // free plan supports) and pick the result matching our departure date
    // client-side, since a flight number can recur daily.
    const params = new URLSearchParams({ access_key: apiKey, flight_iata: flightIata })

    const res = await fetch(`${AVIATIONSTACK_URL}?${params}`)
    if (!res.ok) {
      return { status: 'UNKNOWN', message: `AviationStack request failed (${res.status})`, checkedAt: new Date() }
    }

    const body = await res.json()
    if (body.error) {
      return { status: 'UNKNOWN', message: `AviationStack error: ${body.error.message ?? body.error.code}`, checkedAt: new Date(), raw: body }
    }

    const targetDate = segment.departureTime.toISOString().slice(0, 10)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const candidates: any[] = body.data ?? []
    const flight = candidates.find((f) => f.flight_date === targetDate) ?? candidates[0]
    if (!flight) {
      return { status: 'UNKNOWN', message: 'No matching flight found for this number', checkedAt: new Date(), raw: body }
    }

    const delayMinutes: number | undefined = flight.departure?.delay ?? flight.arrival?.delay ?? undefined

    return {
      status: mapStatus(flight.flight_status, delayMinutes),
      delayMinutes,
      gate: flight.departure?.gate ?? undefined,
      terminal: flight.departure?.terminal ?? undefined,
      message: flight.flight_status ? `AviationStack: ${flight.flight_status}` : undefined,
      raw: flight,
      checkedAt: new Date(),
    }
  },
}
