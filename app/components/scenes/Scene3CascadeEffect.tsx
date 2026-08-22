'use client'
import { motion, useTransform, MotionValue } from 'framer-motion'
import { Plane, Car, Building2, Compass, Utensils, Ship } from 'lucide-react'
import type { SceneProps } from '../ScrollStage'

const STAKEHOLDERS = [
  { label: 'Flight BW 406', Icon: Plane },
  { label: 'Airport Driver', Icon: Car },
  { label: 'Hotel Concierge', Icon: Building2 },
  { label: 'Island Excursion', Icon: Compass },
  { label: 'Restaurant', Icon: Utensils },
]

const CHAOS_CARDS = [
  { label: 'Driver waiting', sub: 'KIN Airport · 14:30', xFactor: -1.8, yFactor: -1.5, rotFactor: -8 },
  { label: 'Check-in missed', sub: 'Blue Lagoon Hotel', xFactor: 2.2, yFactor: -2.2, rotFactor: 5 },
  { label: 'Tour cancelled', sub: 'Blue Mountains', xFactor: -2.5, yFactor: 1.8, rotFactor: -4 },
  { label: 'Table released', sub: "Norma's Restaurant", xFactor: 2.4, yFactor: 2.2, rotFactor: 7 },
  { label: 'Ferry departed', sub: 'Kingston Harbour', xFactor: -1.0, yFactor: 3.2, rotFactor: -3 },
]

function StakeholderPill({ progress, index, Icon, label }: {
  progress: MotionValue<number>; index: number; Icon: React.ComponentType<{ size?: number; strokeWidth?: number }>; label: string
}) {
  const start = 0.08 + (index / STAKEHOLDERS.length) * 0.24
  const end = start + 0.08
  const opacity = useTransform(progress, [start, end], [0, 1])
  const y = useTransform(progress, [start, end], [18, 0])

  return (
    <motion.div style={{ opacity, y }}>
      <div
        className="flex items-center gap-3 px-5 py-3"
        style={{
          background: 'var(--card, #1b1d22)',
          border: '1.5px solid var(--border, #40454e)',
          borderRadius: 14,
          minWidth: 220,
          boxShadow: 'var(--shadow-card)',
        }}
      >
        <div
          className="flex items-center justify-center flex-shrink-0"
          style={{
            width: 32, height: 32, borderRadius: 8,
            background: 'var(--hover, #25282e)',
            color: 'var(--accent, #8fc180)',
          }}
        >
          <Icon size={15} strokeWidth={1.8} />
        </div>
        <span className="text-editorial text-white/90" style={{ fontSize: '0.9rem', fontWeight: 500 }}>{label}</span>
      </div>
    </motion.div>
  )
}

function ChaosCard({ card, index, progress }: { card: typeof CHAOS_CARDS[0]; index: number; progress: MotionValue<number> }) {
  const chaosProgress = useTransform(progress, [0.60, 0.88], [0, 1])
  const x = useTransform(chaosProgress, [0, 1], [0, card.xFactor * 55])
  const y = useTransform(chaosProgress, [0, 1], [0, card.yFactor * 45])
  const rotate = useTransform(chaosProgress, [0, 1], [0, card.rotFactor * 3])
  const opacity = useTransform(progress, [0.54 + index * 0.02, 0.60 + index * 0.02], [0, 1])

  return (
    <motion.div
      className="absolute px-4 py-3"
      style={{
        left: '50%', top: '50%',
        translateX: '-50%', translateY: '-50%',
        background: index === 0 ? 'var(--amber-bg, #2c2312)' : 'var(--danger-bg, #2b1613)',
        border: `1.5px solid ${index === 0 ? 'rgba(224,170,78,0.5)' : 'var(--danger-border, #5c2c26)'}`,
        borderRadius: 12,
        minWidth: 160,
        x, y, rotate, opacity,
      }}
    >
      <p className="text-editorial font-medium" style={{ fontSize: '0.85rem', color: index === 0 ? 'var(--amber, #e0aa4e)' : 'var(--danger, #e88a7d)' }}>{card.label}</p>
      <p className="text-label text-white/40 mt-1" style={{ fontSize: '0.62rem' }}>{card.sub}</p>
    </motion.div>
  )
}

export default function Scene3CascadeEffect({ progress }: SceneProps) {
  const videoScale = useTransform(progress, [0, 1], [1, 1.06])
  const pillsOpacity = useTransform(progress, [0, 0.05, 0.48, 0.54], [1, 1, 1, 0])
  const chaosOpacity = useTransform(progress, [0.54, 0.60, 1], [0, 1, 1])
  const firstBeatOpacity = useTransform(progress, [0, 0.05, 0.48, 0.54], [0, 1, 1, 0])
  const secondBeatOpacity = useTransform(progress, [0.54, 0.60, 1], [0, 1, 1])
  const footerTextOpacity = useTransform(progress, [0.88, 0.98], [0, 1])
  const footerTextY = useTransform(progress, [0.88, 0.98], [14, 0])

  return (
    <div className="absolute inset-0 overflow-hidden">
      <div className="absolute inset-0" style={{ background: 'linear-gradient(135deg, #0a0b0e 0%, #121620 50%, #18140c 100%)' }} />

      <div className="absolute inset-0 z-10 flex items-center justify-between px-8 sm:px-12 lg:px-20 gap-8 lg:gap-14">
        {/* Left: stakeholder pill chain, then chaos cards overlay */}
        <div className="flex-1 relative flex flex-col items-center justify-center w-full" style={{ minHeight: 440 }}>
          {/* Pill chain */}
          <motion.div
            className="absolute inset-0 flex flex-col items-center justify-center"
            style={{ opacity: pillsOpacity }}
          >
            {STAKEHOLDERS.map((s, i) => (
              <div key={s.label} className="flex flex-col items-center">
                <StakeholderPill progress={progress} index={i} Icon={s.Icon} label={s.label} />
                {i < STAKEHOLDERS.length - 1 && (
                  <div style={{ width: 1, height: 14, background: 'rgba(255,255,255,0.12)', margin: '1px 0' }} />
                )}
              </div>
            ))}
          </motion.div>

          {/* Chaos cards */}
          <motion.div
            className="absolute inset-0 flex items-center justify-center"
            style={{ opacity: chaosOpacity }}
          >
            <div className="relative" style={{ width: 260, height: 260 }}>
              {CHAOS_CARDS.map((card, i) => (
                <ChaosCard key={card.label} card={card} index={i} progress={progress} />
              ))}
            </div>
          </motion.div>

          {/* Footer text below cards */}
          <motion.p
            className="text-editorial text-white/65 font-medium text-center absolute left-1/2 -translate-x-1/2 whitespace-nowrap"
            style={{
              top: 'calc(50% + 220px)',
              fontSize: '0.95rem',
              opacity: footerTextOpacity,
              y: footerTextY,
            }}
          >
            20 phone calls. 20 apologies. No solution.
          </motion.p>
        </div>

        {/* Right: video card with text above (Beat 1) -> harmony copy (Beat 2) */}
        <div className="flex-1 hidden sm:flex flex-col justify-center relative" style={{ maxWidth: '580px', minHeight: 420 }}>
          {/* Beat 1: Video card + text */}
          <motion.div
            className="flex flex-col justify-center"
            style={{ opacity: firstBeatOpacity }}
          >
            <motion.div className="mb-6">
              <p className="text-display text-white" style={{ fontSize: 'clamp(1.4rem, 2.4vw, 2.15rem)', lineHeight: 1.2 }}>
                <span style={{ color: 'var(--accent, #8fc180)' }}>One status change.</span><br />
                <span className="text-white/78 font-light">Many stakeholders. Zero coordination.</span>
              </p>
            </motion.div>

            <motion.div
              className="relative overflow-hidden"
              style={{
                borderRadius: 24,
                border: '1px solid rgba(255,255,255,0.08)',
                aspectRatio: '4/3',
                scale: videoScale,
              }}
            >
              <video
                autoPlay muted loop playsInline
                style={{
                  position: 'absolute', inset: 0, width: '100%', height: '100%',
                  objectFit: 'cover',
                  filter: 'brightness(0.72) saturate(0.8)',
                }}
              >
                <source src="/videos/sce3.mp4" type="video/mp4" />
              </video>
              <div className="absolute inset-0" style={{
                background: 'linear-gradient(to bottom right, rgba(10,10,10,0.1) 0%, rgba(10,10,10,0.35) 100%)'
              }} />
            </motion.div>
          </motion.div>

          {/* Beat 2: Harmony copy */}
          <motion.div
            className="absolute inset-0 flex flex-col justify-center"
            style={{ opacity: secondBeatOpacity }}
          >
            <p className="text-label text-white/40 mb-6">the cascade effect</p>
            <h2 className="text-display text-white" style={{ fontSize: 'clamp(1.8rem, 3.8vw, 3.4rem)', lineHeight: 1.1 }}>
              <span className="text-white/78 font-light">Without someone to keep that</span>{' '}
              <span style={{ color: 'var(--accent, #8fc180)' }}>harmony</span>,<br />
              <span style={{ color: 'var(--amber, #e0aa4e)' }}>everything falls apart.</span>
            </h2>
          </motion.div>
        </div>
      </div>
    </div>
  )
}
