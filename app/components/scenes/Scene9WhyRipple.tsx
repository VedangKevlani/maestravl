'use client'
import { motion, useTransform, MotionValue } from 'framer-motion'
import type { SceneProps } from '../ScrollStage'

const STATS = [
  { number: '0', unit: 'phone calls', caption: 'Ripple handles coordination autonomously' },
  { number: '100%', unit: 'stakeholders notified', caption: 'Every party updated in real time' },
  { number: '< 30s', unit: 'response time', caption: 'From disruption detected to plans updated' },
  { number: '24/7', unit: 'availability', caption: 'Ripple never sleeps, never misses a change' },
]

const FEATURES = [
  { title: 'Autonomous Coordination', desc: 'Ripple detects disruptions and coordinates every affected party without human intervention.' },
  { title: 'Real-Time Updates', desc: 'Every stakeholder receives accurate information the moment circumstances change.' },
  { title: 'Smart Alternatives', desc: 'When a plan fails, Ripple finds and confirms alternatives before you even notice.' },
  { title: 'One Intelligent Layer', desc: 'Hotels, drivers, restaurants, excursions — all coordinated through a single system.' },
]

function StatTile({ stat, index, beatProgress }: { stat: typeof STATS[0]; index: number; beatProgress: MotionValue<number> }) {
  const start = 0.15 + index * 0.08
  const opacity = useTransform(beatProgress, [start, start + 0.2], [0, 1])
  const y = useTransform(beatProgress, [start, start + 0.2], [20, 0])

  return (
    <motion.div className="glass-card p-6 text-center" style={{ opacity, y }}>
      <p className="text-display text-white" style={{ fontSize: 'clamp(2rem, 5vw, 3.5rem)' }}>{stat.number}</p>
      <p className="text-editorial text-white/58 mt-1" style={{ fontSize: '0.85rem' }}>{stat.unit}</p>
      <p className="text-label text-white/38 mt-3" style={{ fontSize: '0.65rem', lineHeight: 1.5 }}>{stat.caption}</p>
    </motion.div>
  )
}

function FeatureCard({ feature, index, beatProgress }: { feature: typeof FEATURES[0]; index: number; beatProgress: MotionValue<number> }) {
  const start = 0.1 + index * 0.08
  const opacity = useTransform(beatProgress, [start, start + 0.2], [0, 1])
  const y = useTransform(beatProgress, [start, start + 0.2], [20, 0])

  return (
    <motion.div className="glass-card p-8" style={{ opacity, y }}>
      <div className="w-8 h-px mb-6" style={{ background: 'var(--ocean-bright)' }} />
      <h3 className="text-display text-white mb-4" style={{ fontSize: '1.4rem' }}>{feature.title}</h3>
      <p className="text-editorial text-white/58" style={{ fontSize: '0.95rem' }}>{feature.desc}</p>
    </motion.div>
  )
}

export default function Scene9WhyRipple({ progress }: SceneProps) {
  const statsOpacity = useTransform(progress, [0, 0.06, 0.42, 0.5], [0, 1, 1, 0])
  const featuresOpacity = useTransform(progress, [0.5, 0.56, 1], [0, 1, 1])
  const statsBeat = useTransform(progress, [0, 0.5], [0, 1])
  const featuresBeat = useTransform(progress, [0.5, 1], [0, 1])

  return (
    <div className="absolute inset-0 overflow-hidden" style={{ background: 'var(--charcoal)' }}>
      {/* Beat A: stats */}
      <motion.div className="absolute inset-0 flex flex-col items-center justify-center px-6" style={{ opacity: statsOpacity }}>
        <p className="text-label text-white/40 mb-4">why ripple wins</p>
        <h2 className="text-display text-white text-center mb-10" style={{ fontSize: 'clamp(2rem, 6vw, 4.5rem)', lineHeight: 1 }}>
          Coordination<br />
          <span style={{ color: 'var(--sand)' }}>without chaos.</span>
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-4xl w-full">
          {STATS.map((stat, i) => (
            <StatTile key={stat.number} stat={stat} index={i} beatProgress={statsBeat} />
          ))}
        </div>
      </motion.div>

      {/* Beat B: features */}
      <motion.div className="absolute inset-0 flex flex-col items-center justify-center px-6" style={{ opacity: featuresOpacity }}>
        <p className="text-label text-white/40 mb-8">why ripple wins</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-4xl w-full">
          {FEATURES.map((f, i) => (
            <FeatureCard key={f.title} feature={f} index={i} beatProgress={featuresBeat} />
          ))}
        </div>
      </motion.div>
    </div>
  )
}
