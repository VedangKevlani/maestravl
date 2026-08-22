'use client'
import { useState, useEffect } from 'react'
import { motion, useTransform } from 'framer-motion'
import type { SceneProps } from '../ScrollStage'

export default function Scene2Moment({ progress }: SceneProps) {
  const boardY = useTransform(progress, [0.1, 0.5], [40, 0])
  const videoScale = useTransform(progress, [0, 1], [1, 1.06])
  const [status, setStatus] = useState<'ON TIME' | 'DELAYED'>('ON TIME')
  const [triggered, setTriggered] = useState(false)

  useEffect(() => {
    const unsub = progress.on('change', (v) => {
      if (v > 0.35 && !triggered) {
        setTriggered(true)
        setTimeout(() => setStatus('DELAYED'), 300)
      } else if (v < 0.25 && triggered) {
        setTriggered(false)
        setStatus('ON TIME')
      }
    })
    return unsub
  }, [progress, triggered])

  return (
    <div className="absolute inset-0 overflow-hidden" style={{ background: 'var(--page, #0a0b0e)' }}>
      <div className="absolute inset-0" style={{
        background: 'linear-gradient(135deg, #0a0b0e 0%, #12151c 60%, #1b1812 100%)'
      }} />

      <div className="absolute inset-0 z-10 flex items-center justify-between px-8 sm:px-12 lg:px-20 gap-8 lg:gap-14">
        {/* Left: departure board */}
        <motion.div
          className="flex flex-col"
          style={{ y: boardY, flex: '0 0 auto', width: 'min(100%, 440px)' }}
        >
          <p className="text-label text-white/40 mb-6">Norman Manley International · Kingston</p>

          <div className="glass-card p-6 md:p-8 w-full">
            <div className="flex items-center justify-between mb-5 pb-5 border-b border-white/10">
              <span className="text-label text-white/50">FLIGHT</span>
              <span className="text-label text-white/50">DEPARTURE</span>
              <span className="text-label text-white/50">STATUS</span>
            </div>

            {(['BW 406', 'AA 782', 'JM 114'] as const).map((flight, i) => (
              <div key={flight} className="flex items-center justify-between py-4 border-b border-white/5">
                <span className="text-editorial text-white/85 font-medium">{flight}</span>
                <span className="text-editorial text-white/55">{['14:30', '15:45', '16:20'][i]}</span>
                <motion.span
                  className="text-label px-3 py-1 rounded-full"
                  style={{
                    color: i === 0 ? (status === 'DELAYED' ? 'var(--amber, #e0aa4e)' : 'var(--accent, #8fc180)') : 'var(--accent, #8fc180)',
                    background: i === 0
                      ? (status === 'DELAYED' ? 'var(--amber-bg, #2c2312)' : 'var(--accent-tint-bg, #182016)')
                      : 'var(--accent-tint-bg, #182016)',
                    border: `1px solid ${i === 0 ? (status === 'DELAYED' ? 'rgba(224,170,78,0.5)' : 'rgba(143,193,128,0.3)') : 'rgba(143,193,128,0.3)'}`,
                    transition: 'all 0.6s ease',
                  }}
                >
                  {i === 0 ? status : 'ON TIME'}
                </motion.span>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Right: stakeholders text - appears only when status changes */}
        <motion.div
          className="hidden sm:flex flex-col flex-1 justify-center"
          style={{ maxWidth: '580px' }}
          initial={{ opacity: 0, y: 25 }}
          animate={{
            opacity: status === 'DELAYED' ? 1 : 0,
            y: status === 'DELAYED' ? 0 : 25,
          }}
          transition={{
            duration: 0.9,
            delay: status === 'DELAYED' ? 1.1 : 0,
            ease: [0.16, 1, 0.3, 1],
          }}
        >
          <h1 className="text-display text-white" style={{ fontSize: 'clamp(2.4rem, 5.5vw, 4.75rem)', lineHeight: 1.05, maxWidth: '14ch' }}>
            <span style={{ color: 'var(--accent, #8fc180)' }}>One status change.</span><br />
            <span className="text-white/78 font-light">Many stakeholders. Zero coordination.</span>
          </h1>
        </motion.div>
      </div>
    </div>
  )
}
