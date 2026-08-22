'use client'
import { ArrowRight, ChevronDown } from 'lucide-react'
import { TransportTypeIcon } from './transportIcons'
import styles from '../styles/trip.module.css'

interface PreviewProps {
  type: string
  providerName: string
  providerId: string
  depDate: string
  depTime: string
  arrTime: string
  originAddr: string
  destAddr: string
  seat: string
  cabin: string
  room: string
  tz: string
  hasArrival: boolean
  addrCount: number
  gateSeatCabin: boolean
  roomField: boolean
}

function formatTime12(time: string) {
  if (!time) return '--:--'
  const [hh, mm] = time.split(':')
  if (!hh || !mm) return '--:--'
  let h = parseInt(hh, 10)
  const ampm = h >= 12 ? 'PM' : 'AM'
  if (h === 0) h = 12
  if (h > 12) h -= 12
  return `${h}:${mm} ${ampm}`
}

function formatDateLong(dateStr: string) {
  if (!dateStr) return 'DATE TBD'
  return new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).format(new Date(dateStr))
}

export default function SegmentPreview(props: PreviewProps) {
  const hasExtra = (props.gateSeatCabin && (props.seat || props.cabin)) || (props.roomField && props.room)

  const label = props.type.split('_').map((w: string) => w[0].toUpperCase() + w.slice(1)).join(' ')
  
  return (
    <div className={styles.ticketCard} style={{ marginBottom: '16px' }}>
      <div className={styles.ticketSide}>
        <div className={styles.ticketIcon}>
          <TransportTypeIcon type={props.type} size={20} />
        </div>
        <div className={styles.segTypeLabel}>
          {label}
        </div>
      </div>

      <div className={styles.ticketMain}>
        <div className={styles.ticketHead}>
          <div style={{ flex: '1' }}></div>
          {hasExtra ? (
            <div 
              className={styles.ticketExpand} 
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', width: '22px', height: '22px',
                borderRadius: '50%', background: 'rgba(255, 255, 255, 0.05)', color: 'rgba(255, 255, 255, 0.6)',
              }}
            >
              <ChevronDown size={13} />
            </div>
          ) : null}
        </div>

        <div className={styles.ticketFlightline}>
          <span className={styles.carrier}>
            {props.providerName || 'Provider TBD'} {props.providerId ? `· ${props.providerId}` : ''}
          </span>
          <span className={styles.ticketDate}>
            {props.depDate ? formatDateLong(props.depDate).toUpperCase() : 'DATE TBD'}
          </span>
        </div>

        <div className={styles.ticketRoute}>
          <div className={styles.ticketEndpoint}>
            <div className={styles.code}>{props.originAddr || '—'}</div>
            <div className={styles.place}>&nbsp;</div>
            <div className={styles.time}>{formatTime12(props.depTime)}</div>
            <div className={styles.tz}>{props.tz}</div>
          </div>

          {props.addrCount >= 2 && (
            <>
              <div className={styles.ticketArrow}>
                <ArrowRight size={20} />
              </div>

              <div className={`${styles.ticketEndpoint} ${styles.ticketEndpointRight}`}>
                <div className={styles.code}>{props.destAddr || '—'}</div>
                <div className={styles.place}>&nbsp;</div>
                <div className={styles.time}>{formatTime12(props.arrTime)}</div>
                <div className={styles.tz}>{props.tz}</div>
              </div>
            </>
          )}
        </div>

        {hasExtra && (
          <div className={styles.collapseBody} style={{ display: 'block', borderTop: '1.5px solid var(--border)', paddingTop: '16px', marginTop: '14px' }}>
            <div className={styles.ticketExtra}>
              {props.gateSeatCabin && (
                <>
                  <div>
                    <div className={styles.label}>SEAT</div>
                    <div className={styles.val}>{props.seat || '—'}</div>
                  </div>
                  <div>
                    <div className={styles.label}>CABIN / CLASS</div>
                    <div className={styles.val}>{props.cabin || '—'}</div>
                  </div>
                </>
              )}
              {props.roomField && (
                <div>
                  <div className={styles.label}>ROOM TYPE</div>
                  <div className={styles.val}>{props.room || '—'}</div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
