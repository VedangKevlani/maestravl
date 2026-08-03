'use client'
import { motion, useTransform } from 'framer-motion'
import type { SceneProps } from '../ScrollStage'

export default function Scene1Silence({ progress }: SceneProps) {
  const videoScale = useTransform(progress, [0, 1], [1, 1.08])
  const textY = useTransform(progress, [0, 1], [0, -60])

  return (
    <div className="absolute inset-0 overflow-hidden">
      <motion.div className="absolute inset-0" style={{ scale: videoScale }}>
        <video
          autoPlay muted loop playsInline
          className="scene-video"
          style={{ filter: 'brightness(0.5) saturate(0.75)' }}
        >
          <source src="/videos/sce1.mp4" type="video/mp4" />
        </video>
        <div className="absolute inset-0" style={{
          background: 'linear-gradient(to right, transparent 0%, transparent 38%, rgba(15,15,15,0.55) 62%, rgba(12,12,12,0.85) 100%)'
        }} />
      </motion.div>

      <motion.div
        className="absolute inset-y-0 right-0 z-10 flex flex-col items-end justify-center text-right px-6 sm:px-10 lg:px-16"
        style={{ y: textY, width: 'min(100%, 640px)' }}
      >
        <motion.p className="text-label text-white/40 mb-12" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3, duration: 0.8 }}>
          A story about disruption
        </motion.p>
        <motion.h1
          className="text-display text-white"
          style={{ fontSize: 'clamp(2.2rem, 5.5vw, 4.75rem)', maxWidth: '14ch' }}
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 1, ease: [0.16, 1, 0.3, 1] }}
        >
          Sometimes...<br />
          <span style={{ fontWeight: 300 }}>one delay</span><br />
          changes everything.
        </motion.h1>
      </motion.div>

      <motion.div
        className="absolute bottom-10 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-3"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.2, duration: 1 }}
      >
        <span className="text-label text-white/38">scroll</span>
        <div className="w-px h-12 bg-white/20 relative overflow-hidden">
          <motion.div
            className="absolute inset-x-0 top-0 bg-white/60"
            style={{ height: '40%' }}
            animate={{ y: ['0%', '250%'] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
          />
        </div>
      </motion.div>
    </div>
  )
}
