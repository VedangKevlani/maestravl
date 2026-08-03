'use client'
import { motion, useTransform } from 'framer-motion'
import type { SceneProps } from '../ScrollStage'
import RippleMark from '../RippleMark'

export default function Scene6OneMessage({ progress }: SceneProps) {
  const phoneY = useTransform(progress, [0.1, 0.5], [60, 0])
  const messageOpacity = useTransform(progress, [0.25, 0.5], [0, 1])
  const messageScale = useTransform(progress, [0.25, 0.5], [0.95, 1])
  const captionOpacity = useTransform(progress, [0.6, 0.75], [0, 1])
  const captionY = useTransform(progress, [0.6, 0.75], [20, 0])

  return (
    <div className="absolute inset-0 overflow-hidden">
      <div className="absolute inset-0">
        <video autoPlay muted loop playsInline className="scene-video" style={{ filter: 'brightness(0.3) saturate(0.5)' }}>
          <source src="/videos/sce4.mp4" type="video/mp4" />
        </video>
        <div className="absolute inset-0" style={{ background: 'linear-gradient(to right, rgba(10,20,30,0.3) 0%, rgba(10,20,30,0.55) 35%, rgba(10,20,30,0.85) 100%)' }} />
      </div>

      <div className="absolute inset-y-0 right-0 z-10 flex flex-col items-end justify-center px-6 sm:px-10 lg:px-16" style={{ width: 'min(100%, 560px)' }}>
        <motion.p className="text-label text-white/40 mb-8" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6 }}>
          instead of twenty phone calls
        </motion.p>

        {/* Phone mockup */}
        <motion.div style={{ y: phoneY }} className="relative">
          <div className="glass-card" style={{
            width: 280,
            borderRadius: 28,
            border: '1px solid rgba(255,255,255,0.12)',
            background: 'rgba(255,255,255,0.05)',
            padding: '16px',
          }}>
            {/* Phone header */}
            <div className="flex items-center gap-3 mb-5 pb-4 border-b border-white/10">
              <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
                <RippleMark size={16} rings={false} />
              </div>
              <div>
                <p className="text-editorial text-white font-medium" style={{ fontSize: '0.85rem' }}>Ripple</p>
                <p className="text-label text-white/40" style={{ fontSize: '0.6rem' }}>Travel Coordinator</p>
              </div>
              <div className="ml-auto">
                <div className="w-2 h-2 rounded-full bg-emerald-400" style={{ background: 'var(--emerald-light)' }} />
              </div>
            </div>

            {/* The message */}
            <motion.div
              style={{ opacity: messageOpacity, scale: messageScale }}
              className="glass-card px-5 py-4"
            >
              <p className="text-editorial text-white" style={{ fontSize: '1.1rem', lineHeight: 1.7, fontWeight: 400 }}>
                Everything has been handled.
              </p>
              <p className="text-editorial text-white/58 mt-3" style={{ fontSize: '0.8rem', lineHeight: 1.6 }}>
                Your driver is rescheduled for 17:30. Hotel extended your check-in. Tomorrow's excursion is confirmed. Dinner moved to 20:30.
              </p>
              <p className="text-editorial text-white/40 mt-3" style={{ fontSize: '0.75rem' }}>
                — Ripple, 14:42
              </p>
            </motion.div>
          </div>
        </motion.div>

        <motion.p
          className="text-editorial text-white/50 text-right mt-12"
          style={{ fontSize: 'clamp(1rem, 2.5vw, 1.4rem)', maxWidth: '28ch', lineHeight: 1.6, opacity: captionOpacity, y: captionY }}
        >
          One message.<br />
          <span className="text-white/85">The feeling of relief.</span>
        </motion.p>
      </div>
    </div>
  )
}
