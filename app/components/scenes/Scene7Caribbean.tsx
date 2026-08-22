'use client'
import { motion, useTransform, MotionValue } from 'framer-motion'
import type { SceneProps } from '../ScrollStage'

const PEOPLE = [
  { video: 'sce3', name: 'Marcus',  role: 'Ground Transport', location: 'Norman Manley Airport' },
  { video: 'sce6', name: 'Donovan', role: 'Pickup Driver',    location: 'Kingston, JM' },
  { video: 'sce5', name: 'Carlos',  role: 'Charter Captain',  location: 'Kingston Harbour' },
]

function PersonCard({ person, index, progress }: { person: typeof PEOPLE[0]; index: number; progress: MotionValue<number> }) {
  const start = 0.02 + index * 0.06
  const opacity = useTransform(progress, [start, start + 0.12], [0, 1])
  const y       = useTransform(progress, [start, start + 0.12], [20, 0])

  return (
    <motion.div
      style={{
        borderRadius: 18,
        overflow: 'hidden',
        background: 'var(--card, #1b1d22)',
        border: '1.5px solid var(--border, #40454e)',
        opacity, y,
      }}
    >
      <div className="relative" style={{ height: 155, overflow: 'hidden' }}>
        <video
          autoPlay muted loop playsInline
          style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'brightness(0.68) saturate(0.8)' }}
        >
          <source src={`/videos/${person.video}.mp4`} type="video/mp4" />
        </video>
        <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, transparent 40%, rgba(14,16,20,0.95) 100%)' }} />
      </div>
      <div style={{ padding: '14px 18px 16px' }}>
        <p className="text-editorial text-white font-semibold" style={{ fontSize: '1rem' }}>{person.name}</p>
        <p className="text-label text-white/60 mt-0.5" style={{ fontSize: '0.78rem' }}>{person.role}</p>
        <p className="text-label text-white/40 mt-0.5" style={{ fontSize: '0.70rem' }}>{person.location}</p>
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <p className="text-editorial text-white/50" style={{ fontSize: '0.80rem' }}>
            Now receives updates automatically via Maestravl
          </p>
        </div>
      </div>
    </motion.div>
  )
}

export default function Scene7Caribbean({ progress }: SceneProps) {
  return (
    <div className="absolute inset-0 overflow-hidden">
      <div className="absolute inset-0" style={{ background: 'linear-gradient(135deg, #0a0b0e 0%, #12151c 60%, #1b1812 100%)' }} />

      <div className="absolute inset-0 z-10 flex flex-col items-center justify-center px-6 py-6 sm:py-10">
        <motion.p className="text-label text-white/40 mb-2" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6 }}>
          the people behind every journey
        </motion.p>
        <motion.h2
          className="text-display text-center text-white mb-3"
          style={{ fontSize: 'clamp(2rem, 4.5vw, 3.5rem)', maxWidth: '24ch' }}
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1, duration: 0.6 }}
        >
          They deserve better<br />
          <span style={{ color: 'var(--accent, #8fc180)' }}>than unanswered calls.</span>
        </motion.h2>
        <motion.p
          className="text-editorial text-white/50 text-center mb-6 sm:mb-8"
          style={{ fontSize: '0.95rem', maxWidth: '80ch' }}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2, duration: 0.6 }}
        >
          Every stakeholder in Caribbean tourism carries the weight of coordinating alone. Maestravl changes that.
        </motion.p>

        {/* People cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 lg:gap-5 w-full max-w-4xl">
          {PEOPLE.map((person, i) => (
            <PersonCard key={person.name} person={person} index={i} progress={progress} />
          ))}
        </div>
      </div>
    </div>
  )
}
