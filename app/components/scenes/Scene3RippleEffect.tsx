'use client'
import { motion, useTransform, MotionValue } from 'framer-motion'
import type { SceneProps } from '../ScrollStage'

const STAKEHOLDERS = [
  { label: 'Flight BW 406', icon: '✈' },
  { label: 'Airport Driver', icon: '🚗' },
  { label: 'Hotel Concierge', icon: '🏨' },
  { label: 'Island Excursion', icon: '🌊' },
  { label: 'Restaurant', icon: '🍽' },
  { label: 'Ferry Captain', icon: '⛵' },
]

function StakeholderRow({ progress, index, icon, label }: { progress: MotionValue<number>; index: number; icon: string; label: string }) {
  const start = 0.3 + (index / STAKEHOLDERS.length) * 0.6
  const end = start + 0.15
  const opacity = useTransform(progress, [start, end], [0, 1])
  const x = useTransform(progress, [start, end], [index % 2 === 0 ? -30 : 30, 0])

  return (
    <motion.div className="flex items-center gap-4 py-2" style={{ opacity, x }}>
      {index % 2 === 0 && (
        <div className="glass-card flex items-center gap-3 px-5 py-3" style={{ minWidth: '200px' }}>
          <span style={{ fontSize: '1.1rem' }}>{icon}</span>
          <span className="text-editorial text-white/85" style={{ fontSize: '0.9rem' }}>{label}</span>
        </div>
      )}
      <div className="w-px" style={{ height: '24px', background: 'rgba(255,255,255,0.15)' }} />
      {index % 2 !== 0 && (
        <div className="glass-card flex items-center gap-3 px-5 py-3" style={{ minWidth: '200px' }}>
          <span style={{ fontSize: '1.1rem' }}>{icon}</span>
          <span className="text-editorial text-white/85" style={{ fontSize: '0.9rem' }}>{label}</span>
        </div>
      )}
    </motion.div>
  )
}

export default function Scene3RippleEffect({ progress }: SceneProps) {
  const rippleScale = useTransform(progress, [0.05, 0.4], [0, 1])
  const rippleOpacity = useTransform(progress, [0.05, 0.2, 0.45], [0, 1, 0])

  return (
    <div className="absolute inset-0 overflow-hidden">
      <div className="absolute inset-0" style={{ background: 'linear-gradient(135deg, #0f1a24 0%, #141414 50%, #1a140a 100%)' }} />

      <div className="absolute inset-0 z-10 flex flex-col items-center justify-center px-6">
        <motion.p className="text-label text-white/40 mb-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2, duration: 0.6 }}>
          the ripple effect
        </motion.p>
        <motion.h2
          className="text-display text-center text-white mb-16"
          style={{ fontSize: 'clamp(2rem, 5vw, 4rem)', maxWidth: '20ch' }}
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3, duration: 0.7 }}
        >
          One change.<br />
          <span style={{ color: 'var(--sand)' }}>Every connection.</span>
        </motion.h2>

        {/* Ripple SVG visualization */}
        <div className="relative w-full max-w-2xl" style={{ height: '420px' }}>
          {/* Center ripple rings */}
          <div className="absolute" style={{ left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }}>
            {[1, 2, 3].map((i) => (
              <motion.div
                key={i}
                className="absolute rounded-full border border-white/10"
                style={{
                  width: i * 110,
                  height: i * 110,
                  top: -(i * 55),
                  left: -(i * 55),
                  scale: rippleScale,
                  opacity: rippleOpacity,
                }}
              />
            ))}
            {/* Center node */}
            <div className="w-4 h-4 rounded-full bg-white" style={{ top: -8, left: -8, position: 'relative' }} />
          </div>

          {/* Stakeholder nodes arranged in cascade */}
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-0">
            {STAKEHOLDERS.map((s, i) => (
              <StakeholderRow key={s.label} progress={progress} index={i} icon={s.icon} label={s.label} />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
