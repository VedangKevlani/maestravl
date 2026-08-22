'use client'
import { motion, useTransform } from 'framer-motion'
import type { SceneProps } from '../ScrollStage'

export default function Scene1Silence({ progress }: SceneProps) {
  const videoScale = useTransform(progress, [0, 1], [1, 1.06])
  const textY = useTransform(progress, [0, 1], [0, -40])
  const fadeOpacity = useTransform(progress, [0.65, 0.95], [1, 0])

  return (
    <div className="absolute inset-0 overflow-hidden" style={{ background: 'var(--charcoal)' }}>
      <motion.div
        className="absolute inset-0 z-10 flex items-center justify-center px-6 sm:px-10 lg:px-16 gap-12 sm:gap-16 lg:gap-24"
        style={{ opacity: fadeOpacity }}
      >

        {/* Left: rounded video card */}
        <motion.div
          className="flex-1 hidden sm:block"
          style={{ maxWidth: '500px' }}
          initial={{ opacity: 0, x: -30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.4, duration: 1, ease: [0.16, 1, 0.3, 1] }}
        >
          <motion.div
            className="relative overflow-hidden"
            style={{
              borderRadius: 24,
              border: '1px solid rgba(255,255,255,0.08)',
              aspectRatio: '1.05/1',
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
              <source src="/videos/sce1.mp4" type="video/mp4" />
            </video>
            {/* Subtle inner gradient */}
            <div className="absolute inset-0" style={{
              background: 'linear-gradient(to bottom right, rgba(10,10,10,0.1) 0%, rgba(10,10,10,0.35) 100%)'
            }} />
          </motion.div>
        </motion.div>

        {/* Right: text */}
        <motion.div
          className="flex-1 flex flex-col items-start justify-center pl-4 sm:pl-8 lg:pl-12"
          style={{ y: textY, maxWidth: '500px' }}
        >
          <motion.h1
            className="text-display text-white"
            style={{ fontSize: 'clamp(2.4rem, 5.5vw, 4.75rem)', lineHeight: 1.05, maxWidth: '14ch' }}
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 1, ease: [0.16, 1, 0.3, 1] }}
          >
            <span className="text-white/88">Sometimes...</span><br />
            <span style={{ fontWeight: 300, color: 'var(--accent, #8fc180)' }}>one delay</span><br />
            <span className="text-white/88">changes everything.</span>
          </motion.h1>
        </motion.div>
      </motion.div>

      {/* Full-bleed dark bg with subtle frontend-tinted gradient */}
      <div className="absolute inset-0" style={{
        background: 'linear-gradient(135deg, #0a0b0e 0%, #12141a 50%, #162016 100%)'
      }} />

      {/* Scroll indicator */}
      <motion.div
        className="absolute bottom-10 right-8 sm:right-12 lg:right-20 z-20 flex flex-col items-center gap-3"
        style={{ opacity: fadeOpacity }}
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.4, duration: 1 }}
      >
        <span className="text-label text-white/38">scroll</span>
        <div className="w-px h-12 bg-white/20 relative overflow-hidden">
          <motion.div
            className="absolute inset-x-0 top-0 bg-white/55"
            style={{ height: '40%' }}
            animate={{ y: ['0%', '250%'] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
          />
        </div>
      </motion.div>
    </div>
  )
}
