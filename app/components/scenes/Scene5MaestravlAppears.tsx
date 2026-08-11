'use client'
import { motion, useTransform, MotionValue } from 'framer-motion'
import type { SceneProps } from '../ScrollStage'

const NOTIFICATIONS = [
  { icon: '✈', text: 'Flight rescheduled · 18:45', time: 'now', color: '#4aa0d8' },
  { icon: '🚗', text: 'Driver updated · New pickup 17:30', time: '2s', color: '#52b788' },
  { icon: '🏨', text: 'Check-in extended · No charge', time: '4s', color: '#52b788' },
  { icon: '🌊', text: 'Tour rebooked · Tomorrow 9am', time: '6s', color: '#52b788' },
]

function NotificationRow({ n, index, progress }: { n: typeof NOTIFICATIONS[0]; index: number; progress: MotionValue<number> }) {
  const start = 0.42 + index * 0.09
  const opacity = useTransform(progress, [start, start + 0.14], [0, 1])
  const x = useTransform(progress, [start, start + 0.14], [40, 0])

  return (
    <motion.div
      className="glass-card flex items-center gap-4 px-4 py-3"
      style={{ opacity, x }}
    >
      <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
        style={{ background: `${n.color}20`, fontSize: '1rem' }}>
        {n.icon}
      </div>
      <p className="text-editorial text-white/85 flex-1" style={{ fontSize: '0.85rem' }}>{n.text}</p>
      <span className="text-label text-white/38 flex-shrink-0" style={{ fontSize: '0.6rem' }}>{n.time} ago</span>
    </motion.div>
  )
}

export default function Scene5MaestravlAppears({ progress }: SceneProps) {
  const logoScale = useTransform(progress, [0.05, 0.25], [0.6, 1])
  const logoOpacity = useTransform(progress, [0.05, 0.2], [0, 1])

  return (
    <div className="absolute inset-0 overflow-hidden">
      {/* Clean dark bg with subtle ocean tint */}
      <div className="absolute inset-0" style={{ background: 'linear-gradient(160deg, #0a1520 0%, #141414 40%, #0f1a12 100%)' }} />

      <div className="absolute inset-0 z-10 flex flex-col items-center justify-center px-6 gap-10">
        {/* Logo appear */}
        <motion.div style={{ scale: logoScale, opacity: logoOpacity }} className="flex flex-col items-center gap-3 text-center">
          <img src="/maestravl-logo.png" alt="Maestravl" style={{ height: 96, width: 'auto', display: 'block' }} />
          <p className="text-label text-white/40">Autonomous coordination</p>
        </motion.div>

        {/* Notification stack */}
        <div className="w-full max-w-sm flex flex-col gap-3">
          {NOTIFICATIONS.map((n, i) => (
            <NotificationRow key={n.text} n={n} index={i} progress={progress} />
          ))}
        </div>
      </div>
    </div>
  )
}
