'use client'
import { useEffect, useRef } from 'react'
import { X, Mail, Phone, User } from 'lucide-react'
import styles from '../styles/passengersModal.module.css'
import type { PassengerDTO } from './types'

interface Props {
  tripId: string
  passengers: PassengerDTO[]
  open: boolean
  onClose: () => void
  onAddPassenger: () => void
  onEditPassenger: (id: string) => void
}

export default function ManagePassengersModal({ tripId, passengers, open, onClose, onAddPassenger, onEditPassenger }: Props) {
  const overlayRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  function onOverlayClick(e: React.MouseEvent) {
    if (e.target === overlayRef.current) onClose()
  }

  if (!open) return null

  return (
    <div className={styles.overlay} ref={overlayRef} onClick={onOverlayClick} aria-modal="true" role="dialog">
      <div className={styles.modal}>
        <button type="button" className={styles.closeBtn} aria-label="Close" onClick={onClose}>
          <X size={15} />
        </button>

        <div className={styles.pad}>
          <h2 className={styles.title}>Passengers</h2>
          <hr className={styles.hr} />

          {passengers.map((p) => (
            <div key={p.id} className={styles.passengerListRow}>
              <div className={styles.passengerAvatar}>
                <User size={16} />
              </div>
              <div className={styles.pInfo}>
                <div className={styles.pName}>
                  {p.name}
                  {p.isPrimary && <span className={styles.primaryTag}>PRIMARY</span>}
                </div>
                <div className={styles.pContact}>
                  {p.email && (
                    <span>
                      <Mail size={12} style={{ color: 'var(--accent)' }} /> {p.email}
                    </span>
                  )}
                  {p.phone && (
                    <span>
                      <Phone size={12} style={{ color: 'var(--accent)' }} /> {p.phone}
                    </span>
                  )}
                  {!p.email && !p.phone && <span style={{ color: 'var(--muted)' }}>No contact info</span>}
                </div>
              </div>
              <button 
                type="button" 
                className={styles.editBtn} 
                onClick={() => {
                  onClose()
                  onEditPassenger(p.id)
                }}
              >
                Edit
              </button>
            </div>
          ))}

          <div style={{ display: 'flex', justifyContent: 'center', marginTop: '20px' }}>
            <button 
              type="button" 
              className={styles.addBtn} 
              onClick={() => {
                onClose()
                onAddPassenger()
              }}
              style={{ width: '100%', border: '1.5px dashed var(--border)', background: 'transparent' }}
            >
              + Add Passengers
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
