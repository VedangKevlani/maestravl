'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Plane,
  Train,
  Bus,
  Ship,
  Anchor,
  Helicopter,
  Footprints,
  Car,
  Bike,
  Hotel,
  Utensils,
  MapPin,
  MoreHorizontal,
  Check,
} from 'lucide-react'
import styles from '../styles/segmentModal.module.css'
import SegmentPreview from './SegmentPreview'
import { getFieldProfile } from './segmentFieldProfiles'
import { toLocalInputValue } from './dateInput'
import { zonedDateTimeToUtc } from '@/lib/dateFormat'
import type { SegmentDTO } from './types'

interface Props {
  tripId: string
  segment?: SegmentDTO | null
  passengerIds: string[]
  onCreated?: () => void
  /** Rendered directly below the live Segment Preview, above the rest of
   *  the form fields — e.g. the "monitor this segment" checkbox and
   *  Linked Passengers picker, which belong with the preview at the top
   *  of the modal rather than buried under all the input fields.
   *  Receives the form's own monitor-enabled state/setter so the checkbox
   *  it renders is actually wired into what gets submitted. */
  afterPreview?: (monitor: { enabled: boolean; setEnabled: (v: boolean) => void }) => React.ReactNode
}

// Splits an ISO datetime into the separate <input type="date"> /
// <input type="time"> values this form uses, in the browser's local time —
// mirrors what toLocalInputValue does for a single datetime-local input.
function splitLocalDateTime(iso: string | null): { date: string; time: string } {
  const local = toLocalInputValue(iso) // 'YYYY-MM-DDTHH:mm' or ''
  if (!local) return { date: '', time: '' }
  const [date, time] = local.split('T')
  return { date: date ?? '', time: time ?? '' }
}

type Subtab = 'transport' | 'datetime' | 'provider'

interface TransportTypeOption {
  value: string
  label: string
  icon: React.ElementType
  category: 'basic' | 'rentals' | 'other'
}

const TYPE_OPTIONS: TransportTypeOption[] = [
  // Basic
  { value: 'FLIGHT', label: 'Flight', icon: Plane, category: 'basic' },
  { value: 'TRAIN', label: 'Train', icon: Train, category: 'basic' },
  { value: 'BUS', label: 'Bus', icon: Bus, category: 'basic' },
  { value: 'CRUISE', label: 'Cruise', icon: Ship, category: 'basic' },
  { value: 'BOAT', label: 'Boat', icon: Anchor, category: 'basic' },
  { value: 'HELICOPTER', label: 'Helicopter', icon: Helicopter, category: 'basic' },
  { value: 'WALKING', label: 'Walking', icon: Footprints, category: 'basic' },
  { value: 'TAXI', label: 'Taxi', icon: Car, category: 'basic' },
  // Rentals
  { value: 'BICYCLE', label: 'Bicycle Rental', icon: Bike, category: 'rentals' },
  { value: 'RENTAL_CAR', label: 'Car Rental', icon: Car, category: 'rentals' },
  // Other
  { value: 'HOTEL', label: 'Hotel', icon: Hotel, category: 'other' },
  { value: 'RESTAURANT', label: 'Restaurant', icon: Utensils, category: 'other' },
  { value: 'EXCURSION', label: 'Activity', icon: MapPin, category: 'other' },
  { value: 'OTHER', label: 'Other', icon: MoreHorizontal, category: 'other' },
]

export default function TransportTypeForm({ tripId, segment, passengerIds, onCreated, afterPreview }: Props) {
  const router = useRouter()
  const isEditing = Boolean(segment)
  const initialDep = splitLocalDateTime(segment?.departureTime ?? null)
  const initialArr = splitLocalDateTime(segment?.arrivalTime ?? null)

  const [activeTab, setActiveTab] = useState<Subtab>('transport')
  const [transportType, setTransportType] = useState(segment?.transportType ?? 'FLIGHT')
  const [autoTimezone, setAutoTimezone] = useState(!segment?.timezone)

  // Form fields matching DB model / DTO
  const [provider, setProvider] = useState(segment?.provider ?? '')
  const [identifier, setIdentifier] = useState(segment?.identifier ?? '')
  const [depLocation, setDepLocation] = useState(segment?.departureLocation ?? '')
  const [depCode, setDepCode] = useState(segment?.departureLocationCode ?? '')
  const [depTerminal, setDepTerminal] = useState(segment?.departureTerminal ?? '')
  const [depGate, setDepGate] = useState(segment?.departureGate ?? '')
  const [depDate, setDepDate] = useState(initialDep.date)
  const [depTime, setDepTime] = useState(initialDep.time)

  const [arrLocation, setArrLocation] = useState(segment?.arrivalLocation ?? '')
  const [arrCode, setArrCode] = useState(segment?.arrivalLocationCode ?? '')
  const [arrDate, setArrDate] = useState(initialArr.date)
  const [arrTime, setArrTime] = useState(initialArr.time)

  const [timezone, setTimezone] = useState(segment?.timezone ?? '')
  const [seat, setSeat] = useState(segment?.seat ?? '')
  const [cabin, setCabin] = useState(segment?.cabin ?? '')
  const [roomType, setRoomType] = useState(segment?.cabin ?? '')
  const [confirmationNumber, setConfirmationNumber] = useState(segment?.confirmationNumber ?? '')
  const [price, setPrice] = useState(segment?.price != null ? String(segment.price) : '')
  const [currency, setCurrency] = useState(segment?.currency ?? 'USD')
  const [notes, setNotes] = useState(segment?.notes ?? '')
  const [monitorEnabled, setMonitorEnabled] = useState(segment ? segment.monitoring?.status !== 'PAUSED' : true)

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)

    // The zone this segment's date/time inputs are actually being entered
    // in — same fallback the submitted `timezone` field below uses. Without
    // this, the picked/typed zone was stored as metadata but never actually
    // affected how the date/time inputs got parsed, silently anchoring
    // every departure/arrival to the browser or server's own zone instead
    // (found via live testing 2026-08-12/13).
    const effectiveTimezone = timezone.trim() || (autoTimezone ? Intl.DateTimeFormat().resolvedOptions().timeZone : null)

    let departureDateTimeISO: string | undefined = undefined
    if (depDate) {
      const timeStr = depTime || '00:00'
      const d = zonedDateTimeToUtc(depDate, timeStr, effectiveTimezone)
      if (!isNaN(d.getTime())) departureDateTimeISO = d.toISOString()
    }

    let arrivalDateTimeISO: string | undefined = undefined
    if (arrDate) {
      const timeStr = arrTime || '00:00'
      const d = zonedDateTimeToUtc(arrDate, timeStr, effectiveTimezone)
      if (!isNaN(d.getTime())) arrivalDateTimeISO = d.toISOString()
    }

    // Editing an existing segment can clear a field the person deletes, so
    // blanks resolve to `null` there; creating a new one just omits empty
    // fields entirely (`undefined`) rather than sending explicit nulls.
    const empty = isEditing ? null : undefined
    const payload: Record<string, unknown> = {
      transportType,
      provider: provider.trim() || empty,
      identifier: identifier.trim() || empty,
      departureLocation: depLocation.trim() || empty,
      departureLocationCode: depCode.trim() ? depCode.trim().toUpperCase() : empty,
      departureTerminal: depTerminal.trim() || empty,
      departureGate: depGate.trim() || empty,
      departureTime: departureDateTimeISO ?? empty,
      arrivalLocation: arrLocation.trim() || empty,
      arrivalLocationCode: arrCode.trim() ? arrCode.trim().toUpperCase() : empty,
      arrivalTime: arrivalDateTimeISO ?? empty,
      timezone: timezone.trim() || (autoTimezone ? Intl.DateTimeFormat().resolvedOptions().timeZone : empty),
      seat: seat.trim() || empty,
      cabin: cabin.trim() || roomType.trim() || empty,
      confirmationNumber: confirmationNumber.trim() || empty,
      currency: currency.trim().toUpperCase() || 'USD',
      price: price ? parseFloat(price) : empty,
      notes: notes.trim() || empty,
      passengerIds,
      monitorEnabled,
    }

    const res = await fetch(
      isEditing ? `/api/segments/${segment!.id}` : `/api/trips/${tripId}/segments`,
      {
        method: isEditing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }
    )
    setSubmitting(false)

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data.error || (isEditing ? 'Could not save changes' : 'Could not add segment'))
      return
    }

    if (onCreated) onCreated()
    router.refresh()
  }

  const prof = getFieldProfile(transportType)

  // Derived booleans from the field profile, used to show/hide sections
  const hasRoute = prof.hasRoute
  const hasArrivalTime = prof.arrivalTimeLabel !== null
  const hasTerminalGate = hasRoute && (prof as any).hasTerminalGate
  const hasSeatCabin = hasRoute && (prof as any).hasSeatCabin
  // Hotel: hasRoute=false, no seat/cabin — but it has a room type field
  const isHotel = transportType === 'HOTEL'
  // Whether to show the "Additional details" block in the Provider tab at all
  const hasExtraDetails = hasTerminalGate || hasSeatCabin || isHotel

  // Location labels driven by the profile
  const originLabel = hasRoute
    ? (prof as any).departureLocationLabel
    : (prof as any).singleLocationLabel
  const destLabel = hasRoute ? (prof as any).arrivalLocationLabel : null
  const depTimeLabel = prof.departureTimeLabel
  const arrTimeLabel = prof.arrivalTimeLabel

  // Code field labels — only present on hasRoute profiles
  const depCodeLabel = hasRoute ? (prof as any).departureCodeLabel : null
  const arrCodeLabel = hasRoute ? (prof as any).arrivalCodeLabel : null

  // Per-tab completion — drives the dotcheck state (filled circle vs empty circle)
  // Transport tab: a type is always selected (defaults to FLIGHT), so always complete
  const transportComplete = true
  // Date & Time tab: origin location + departure date + time are required;
  // destination is also required for route types
  const datetimeComplete =
    depLocation.trim() !== '' &&
    depDate.trim() !== '' &&
    depTime.trim() !== '' &&
    (!hasRoute || arrLocation.trim() !== '')
  // Provider tab: provider name is the only required field
  const providerComplete = provider.trim() !== ''

  // Preview address strings
  const previewOrigin = hasRoute
    ? depCode ? `${depCode}${depLocation ? ` — ${depLocation}` : ''}` : depLocation
    : depLocation
  const previewDest = hasRoute
    ? arrCode ? `${arrCode}${arrLocation ? ` — ${arrLocation}` : ''}` : arrLocation
    : ''

  return (
    <form onSubmit={onSubmit}>
      <div className={styles.fieldLabel} style={{ fontSize: '15px', marginBottom: '8px' }}>
        Segment Preview
      </div>
      
      <SegmentPreview
        type={transportType}
        providerName={provider}
        providerId={identifier}
        depDate={depDate}
        depTime={depTime}
        arrTime={arrTime}
        originAddr={previewOrigin}
        destAddr={previewDest}
        seat={seat}
        cabin={cabin}
        room={roomType}
        tz={timezone || (autoTimezone ? Intl.DateTimeFormat().resolvedOptions().timeZone : '')}
        hasArrival={hasArrivalTime}
        addrCount={hasRoute ? 2 : 1}
        gateSeatCabin={hasTerminalGate || hasSeatCabin}
        roomField={isHotel}
      />

      {afterPreview?.({ enabled: monitorEnabled, setEnabled: setMonitorEnabled })}


      <div className={styles.fieldLabel} style={{ fontSize: '15px', marginBottom: '2px', marginTop: '24px' }}>
        Trip Segment Details
      </div>
      <div className={styles.fieldHint}>* Please fill out the required fields.</div>

      {/* Subtabs matching segment-modal.html */}
      <div className={styles.subtabs}>
        <button
          type="button"
          className={`${styles.subtab} ${activeTab === 'transport' ? styles.active : ''} ${transportComplete ? styles.complete : ''}`}
          onClick={() => setActiveTab('transport')}
        >
          <span className={`${styles.dotcheck} ${transportComplete ? styles.dotchecked : ''}`}>
            {transportComplete ? <Check size={9} /> : null}
          </span>
          Transportation
        </button>
        <button
          type="button"
          className={`${styles.subtab} ${activeTab === 'datetime' ? styles.active : ''} ${datetimeComplete ? styles.complete : ''}`}
          onClick={() => setActiveTab('datetime')}
        >
          <span className={`${styles.dotcheck} ${datetimeComplete ? styles.dotchecked : ''}`}>
            {datetimeComplete ? <Check size={9} /> : null}
          </span>
          Date & Time
        </button>
        <button
          type="button"
          className={`${styles.subtab} ${activeTab === 'provider' ? styles.active : ''} ${providerComplete ? styles.complete : ''}`}
          onClick={() => setActiveTab('provider')}
        >
          <span className={`${styles.dotcheck} ${providerComplete ? styles.dotchecked : ''}`}>
            {providerComplete ? <Check size={9} /> : null}
          </span>
          Provider & Additional Info
        </button>
      </div>

      {/* Subpanel 1: Transportation */}
      {activeTab === 'transport' && (
        <div>
          <span className={styles.fieldLabel}>
            Select this segment's Transportation Type: <span style={{ color: 'var(--amber)' }}>*</span>
          </span>

          <div className={styles.typeGroupLabel}>Basic</div>
          <div className={styles.typeGrid}>
            {TYPE_OPTIONS.filter((o) => o.category === 'basic').map((opt) => {
              const Icon = opt.icon
              const isSelected = transportType === opt.value
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setTransportType(opt.value)}
                  className={`${styles.typeBtn} ${isSelected ? styles.selected : ''}`}
                >
                  <Icon size={14} />
                  {opt.label}
                </button>
              )
            })}
          </div>

          <div className={styles.typeGroupLabel}>Rentals</div>
          <div className={styles.typeGrid}>
            {TYPE_OPTIONS.filter((o) => o.category === 'rentals').map((opt) => {
              const Icon = opt.icon
              const isSelected = transportType === opt.value
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setTransportType(opt.value)}
                  className={`${styles.typeBtn} ${isSelected ? styles.selected : ''}`}
                >
                  <Icon size={14} />
                  {opt.label}
                </button>
              )
            })}
          </div>

          <div className={styles.typeGroupLabel}>Other</div>
          <div className={styles.typeGrid}>
            {TYPE_OPTIONS.filter((o) => o.category === 'other').map((opt) => {
              const Icon = opt.icon
              const isSelected = transportType === opt.value
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setTransportType(opt.value)}
                  className={`${styles.typeBtn} ${isSelected ? styles.selected : ''}`}
                >
                  <Icon size={14} />
                  {opt.label}
                </button>
              )
            })}
          </div>

          <div className={styles.field} style={{ marginTop: '24px' }}>
            <span className={styles.fieldLabel}>Notes</span>
            <textarea
              className={`${styles.textInput} ${styles.textarea}`}
              placeholder="Add any additional notes about this segment…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>
      )}

      {/* Subpanel 2: Date & Time */}
      {activeTab === 'datetime' && (
        <div>
          <span className={styles.fieldLabel} style={{ fontSize: '13px', marginBottom: '16px' }}>
            Select this segment's scheduled Date & Time:
          </span>

          {/* Origin / single location field — always shown */}
          <div className={styles.field}>
            <span className={styles.fieldLabel}>
              {originLabel} <span style={{ color: 'var(--amber)' }}>*</span>
            </span>
            <input
              type="text"
              className={styles.textInput}
              placeholder={hasRoute ? 'e.g. JFK Airport / Florida Station' : 'e.g. Grand Hyatt New York'}
              value={depLocation}
              onChange={(e) => setDepLocation(e.target.value)}
            />
          </div>

          {/* Origin airport/station code — only for route types with a code label */}
          {depCodeLabel && (
            <div className={styles.field}>
              <span className={styles.fieldLabel}>{depCodeLabel}</span>
              <input
                type="text"
                className={styles.textInput}
                placeholder="e.g. KIN"
                value={depCode}
                onChange={(e) => setDepCode(e.target.value.toUpperCase())}
                maxLength={4}
              />
            </div>
          )}

          {/* Destination field — only for route types (hasRoute = true) */}
          {hasRoute && destLabel && (
            <div className={styles.field}>
              <span className={styles.fieldLabel}>
                {destLabel} <span style={{ color: 'var(--amber)' }}>*</span>
              </span>
              <input
                type="text"
                className={styles.textInput}
                placeholder="e.g. LHR Airport / London Hotel"
                value={arrLocation}
                onChange={(e) => setArrLocation(e.target.value)}
              />
            </div>
          )}

          {/* Destination airport/station code — only for route types with a code label */}
          {hasRoute && arrCodeLabel && (
            <div className={styles.field}>
              <span className={styles.fieldLabel}>{arrCodeLabel}</span>
              <input
                type="text"
                className={styles.textInput}
                placeholder="e.g. MIA"
                value={arrCode}
                onChange={(e) => setArrCode(e.target.value.toUpperCase())}
                maxLength={4}
              />
            </div>
          )}

          <div className={styles.grid2}>
            <div className={styles.field}>
              <span className={styles.fieldLabel}>
                {depTimeLabel ? `${depTimeLabel} — Date` : 'Departure Date'} <span style={{ color: 'var(--amber)' }}>*</span>
              </span>
              <input
                type="date"
                className={styles.textInput}
                value={depDate}
                onChange={(e) => setDepDate(e.target.value)}
              />
            </div>
            <div className={styles.field}>
              <span className={styles.fieldLabel}>
                {depTimeLabel ? `${depTimeLabel} — Time` : 'Departure Time'} <span style={{ color: 'var(--amber)' }}>*</span>
              </span>
              <input
                type="time"
                className={styles.textInput}
                value={depTime}
                onChange={(e) => setDepTime(e.target.value)}
              />
            </div>
          </div>

          {/* Arrival row — hidden entirely when arrivalTimeLabel is null (e.g. Restaurant) */}
          {hasArrivalTime && arrTimeLabel && (
            <div className={styles.grid2}>
              <div className={styles.field}>
                <span className={styles.fieldLabel}>{arrTimeLabel} — Date</span>
                <input
                  type="date"
                  className={styles.textInput}
                  value={arrDate}
                  onChange={(e) => setArrDate(e.target.value)}
                />
              </div>
              <div className={styles.field}>
                <span className={styles.fieldLabel}>{arrTimeLabel} — Time</span>
                <input
                  type="time"
                  className={styles.textInput}
                  value={arrTime}
                  onChange={(e) => setArrTime(e.target.value)}
                />
              </div>
            </div>
          )}

          <div className={styles.field}>
            <span className={styles.fieldLabel}>My Timezone</span>
            <input
              type="text"
              className={styles.textInput}
              placeholder="e.g. America/New_York"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              disabled={autoTimezone}
            />
          </div>

          <label className={styles.passengerCheck} style={{ marginBottom: '16px' }}>
            <input
              type="checkbox"
              checked={autoTimezone}
              onChange={(e) => setAutoTimezone(e.target.checked)}
            />
            Automatically detect my timezone
          </label>
        </div>
      )}

      {/* Subpanel 3: Provider & Additional Info */}
      {activeTab === 'provider' && (
        <div>
          <span className={styles.fieldLabel} style={{ fontSize: '13px', marginBottom: '16px' }}>
            Some key information about this segment's Provider:
          </span>

          <div className={styles.grid2}>
            <div className={styles.field}>
              <span className={styles.fieldLabel}>
                Name of Provider / Operator <span style={{ color: 'var(--amber)' }}>*</span>
              </span>
              <input
                type="text"
                className={styles.textInput}
                placeholder="e.g. American Airlines, Marriott, Amtrak"
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
              />
            </div>
            <div className={styles.field}>
              <span className={styles.fieldLabel}>Identifier / Number</span>
              <input
                type="text"
                className={styles.textInput}
                placeholder="e.g. AA123, Reservation #849"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
              />
            </div>
          </div>

          {/* Additional details — only shown when the transport type uses gate/seat/cabin or room */}
          {hasExtraDetails && (
            <>
              <span className={styles.fieldLabel} style={{ fontSize: '13px', marginTop: '12px', marginBottom: '16px' }}>
                Additional details about this segment:
              </span>

              {/* Gate / Seat / Cabin — flights, trains, buses, cruise, etc. */}
              {(hasTerminalGate || hasSeatCabin) && (
                <div className={styles.grid3}>
                  {hasTerminalGate && (
                    <div className={styles.field}>
                      <span className={styles.fieldLabel}>
                        {transportType === 'FLIGHT' ? 'Airport Gate' : 'Gate / Track / Platform'}
                      </span>
                      <input
                        type="text"
                        className={styles.textInput}
                        placeholder="e.g. Gate B12"
                        value={depGate}
                        onChange={(e) => setDepGate(e.target.value)}
                      />
                    </div>
                  )}
                  {hasSeatCabin && (
                    <>
                      <div className={styles.field}>
                        <span className={styles.fieldLabel}>Seat</span>
                        <input
                          type="text"
                          className={styles.textInput}
                          placeholder="e.g. 12A"
                          value={seat}
                          onChange={(e) => setSeat(e.target.value)}
                        />
                      </div>
                      <div className={styles.field}>
                        <span className={styles.fieldLabel}>Cabin / Class</span>
                        <select
                          className={styles.textInput}
                          value={cabin}
                          onChange={(e) => setCabin(e.target.value)}
                        >
                          <option value="">Select an option</option>
                          <option value="Economy">Economy</option>
                          <option value="Premium Economy">Premium Economy</option>
                          <option value="Business">Business</option>
                          <option value="First">First</option>
                        </select>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Terminal — flights only */}
              {hasTerminalGate && transportType === 'FLIGHT' && (
                <div className={styles.field}>
                  <span className={styles.fieldLabel}>Departure Terminal</span>
                  <input
                    type="text"
                    className={styles.textInput}
                    placeholder="e.g. Terminal 4"
                    value={depTerminal}
                    onChange={(e) => setDepTerminal(e.target.value)}
                  />
                </div>
              )}

              {/* Room type — hotels only */}
              {isHotel && (
                <div className={styles.field}>
                  <span className={styles.fieldLabel}>Room Type</span>
                  <input
                    type="text"
                    className={styles.textInput}
                    placeholder="e.g. King Suite, Double Queen"
                    value={roomType}
                    onChange={(e) => setRoomType(e.target.value)}
                  />
                </div>
              )}
            </>
          )}

          <div className={styles.grid2}>
            <div className={styles.field}>
              <span className={styles.fieldLabel}>Confirmation Number</span>
              <input
                type="text"
                className={styles.textInput}
                placeholder="e.g. H73K9L"
                value={confirmationNumber}
                onChange={(e) => setConfirmationNumber(e.target.value)}
              />
            </div>
            <div className={styles.field}>
              <span className={styles.fieldLabel}>Price</span>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  className={styles.textInput}
                  style={{ width: '80px', flex: 'none' }}
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                  placeholder="USD"
                />
                <input
                  type="number"
                  step="0.01"
                  className={styles.textInput}
                  placeholder="e.g. 450.00"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.footer}>
        <button type="submit" disabled={submitting || !datetimeComplete || !providerComplete} className={styles.primaryBtn}>
          {isEditing ? (submitting ? 'Saving…' : 'Save Changes') : (submitting ? 'Adding…' : '+ Add Segment To Trip')}
        </button>
      </div>
    </form>
  )
}
