'use client'
import { motion, useTransform, MotionValue } from 'framer-motion'
import type { SceneProps } from '../ScrollStage'

const PEOPLE = [
  { video: 'sce3', name: 'Marcus', role: 'Ground Transport', location: 'Norman Manley Airport' },
  { video: 'sce6', name: 'Donovan', role: 'Pickup Driver', location: 'Kingston, JM' },
  { video: 'sce5', name: 'Carlos', role: 'Charter Captain', location: 'Kingston Harbour' },
]

function PersonCard({ person, index, progress }: { person: typeof PEOPLE[0]; index: number; progress: MotionValue<number> }) {
  const start = 0.3 + index * 0.15
  const opacity = useTransform(progress, [start, start + 0.2], [0, 1])
  const y = useTransform(progress, [start, start + 0.2], [30, 0])

  return (
    <motion.div
      className="glass-card overflow-hidden"
      style={{ borderRadius: 20, opacity, y }}
    >
      <div className="relative" style={{ height: 200, overflow: 'hidden' }}>
        <video
          autoPlay muted loop playsInline
          style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'brightness(0.7) saturate(0.8)' }}
        >
          <source src={`/videos/${person.video}.mp4`} type="video/mp4" />
        </video>
        <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, transparent 50%, rgba(20,20,20,0.9) 100%)' }} />
      </div>
      <div className="px-5 py-4">
        <p className="text-editorial text-white font-semibold">{person.name}</p>
        <p className="text-label text-white/50 mt-1">{person.role}</p>
        <p className="text-label text-white/38 mt-1" style={{ fontSize: '0.6rem' }}>{person.location}</p>
        <div className="mt-3 pt-3 border-t border-white/5">
          <p className="text-editorial text-white/50" style={{ fontSize: '0.78rem' }}>
            Now receives updates automatically via Ripple
          </p>
        </div>
      </div>
    </motion.div>
  )
}

export default function Scene7Caribbean({ progress }: SceneProps) {
  return (
    <div className="absolute inset-0 overflow-hidden">
      <div className="absolute inset-0" style={{ background: 'linear-gradient(160deg, #0f1a14 0%, #141414 60%, #1a1408 100%)' }} />

      <div className="absolute inset-0 z-10 flex flex-col items-center justify-center px-6 py-16">
        <motion.p className="text-label text-white/40 mb-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6 }}>
          the people behind every journey
        </motion.p>
        <motion.h2
          className="text-display text-center text-white mb-6"
          style={{ fontSize: 'clamp(2rem, 5vw, 4rem)', maxWidth: '22ch' }}
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1, duration: 0.6 }}
        >
          They deserve better<br />
          <span style={{ color: 'var(--emerald-light)' }}>than unanswered calls.</span>
        </motion.h2>
        <motion.p
          className="text-editorial text-white/50 text-center mb-16"
          style={{ fontSize: '1.05rem', maxWidth: '36ch' }}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2, duration: 0.6 }}
        >
          Every stakeholder in Caribbean tourism carries the weight of coordinating alone. Ripple changes that.
        </motion.p>

        {/* People cards with video clips */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 w-full max-w-4xl">
          {PEOPLE.map((person, i) => (
            <PersonCard key={person.name} person={person} index={i} progress={progress} />
          ))}
        </div>
      </div>
    </div>
  )
}
