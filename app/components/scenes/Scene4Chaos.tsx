'use client'
import { motion, useTransform, MotionValue } from 'framer-motion'
import type { SceneProps } from '../ScrollStage'

const CARDS = [
  { label: 'Driver waiting', sub: 'KIN Airport · 14:30', xFactor: -1.8, yFactor: -1.5, rotFactor: -8 },
  { label: 'Check-in missed', sub: 'Blue Lagoon Hotel', xFactor: 2.2, yFactor: -2.2, rotFactor: 5 },
  { label: 'Tour cancelled', sub: 'Blue Mountains', xFactor: -2.5, yFactor: 1.8, rotFactor: -4 },
  { label: 'Table released', sub: "Norma's Restaurant", xFactor: 2.4, yFactor: 2.2, rotFactor: 7 },
  { label: 'Ferry departed', sub: 'Kingston Harbour', xFactor: -1.0, yFactor: 3.2, rotFactor: -3 },
]

function ChaosCard({ card, index, progress }: { card: typeof CARDS[0], index: number, progress: MotionValue<number> }) {
  const chaosProgress = useTransform(progress, [0.15, 0.85], [0, 1])
  const x = useTransform(chaosProgress, [0, 1], [0, card.xFactor * 60])
  const y = useTransform(chaosProgress, [0, 1], [0, card.yFactor * 50])
  const rotate = useTransform(chaosProgress, [0, 1], [0, card.rotFactor * 3])
  const opacity = useTransform(progress, [0.1 + index * 0.04, 0.22 + index * 0.04], [0, 1])

  return (
    <motion.div
      className="absolute glass-card px-4 py-3"
      style={{
        left: '50%',
        top: '50%',
        background: index === 0 ? 'rgba(212,168,83,0.08)' : 'rgba(239,68,68,0.08)',
        border: `1px solid ${index === 0 ? 'rgba(212,168,83,0.15)' : 'rgba(239,68,68,0.15)'}`,
        minWidth: 160,
        x, y, rotate, opacity,
        translateX: '-50%',
        translateY: '-50%',
      }}
    >
      <p className="text-editorial text-white/85 font-medium" style={{ fontSize: '0.85rem' }}>{card.label}</p>
      <p className="text-label text-white/40 mt-1" style={{ fontSize: '0.65rem' }}>{card.sub}</p>
    </motion.div>
  )
}

export default function Scene4Chaos({ progress }: SceneProps) {
  const footerOpacity = useTransform(progress, [0.75, 0.9], [0, 1])

  return (
    <div className="absolute inset-0 overflow-hidden">
      <div className="absolute inset-0">
        <video autoPlay muted loop playsInline className="scene-video" style={{ filter: 'brightness(0.25) saturate(0.4)' }}>
          <source src="/videos/sce5.mp4" type="video/mp4" />
        </video>
        <div className="absolute inset-0" style={{ background: 'linear-gradient(to right, rgba(20,10,10,0.35) 0%, rgba(20,10,10,0.55) 35%, rgba(20,10,10,0.8) 100%)' }} />
      </div>

      <div className="absolute inset-y-0 right-0 z-10 flex flex-col items-end justify-center px-6 sm:px-10 lg:px-16" style={{ width: 'min(100%, 620px)' }}>
        <motion.h2
          className="text-display text-right text-white mb-16"
          style={{ fontSize: 'clamp(1.8rem, 4vw, 3rem)', maxWidth: '18ch' }}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6 }}
        >
          Without coordination,<br />
          <span style={{ color: 'rgba(239,68,68,0.8)' }}>everything falls apart.</span>
        </motion.h2>

        <div className="relative" style={{ width: 280, height: 280 }}>
          {CARDS.map((card, i) => (
            <ChaosCard key={card.label} card={card} index={i} progress={progress} />
          ))}
        </div>

        <motion.p
          className="text-editorial text-white/40 text-right mt-12"
          style={{ fontSize: '1rem', maxWidth: '28ch', opacity: footerOpacity }}
        >
          20 phone calls. 20 apologies. No solution.
        </motion.p>
      </div>
    </div>
  )
}
