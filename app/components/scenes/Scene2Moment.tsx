'use client'
import { useState, useEffect } from 'react'
import { motion, useTransform } from 'framer-motion'
import type { SceneProps } from '../ScrollStage'

export default function Scene2Moment({ progress }: SceneProps) {
  const boardY = useTransform(progress, [0.1, 0.5], [40, 0])
  const [status, setStatus] = useState<'ON TIME' | 'DELAYED'>('ON TIME')
  const [triggered, setTriggered] = useState(false)

  useEffect(() => {
    const unsub = progress.on('change', (v) => {
      if (v > 0.35 && !triggered) {
        setTriggered(true)
        setTimeout(() => setStatus('DELAYED'), 400)
      }
    })
    return unsub
  }, [progress, triggered])

  return (
    <div className="absolute inset-0 overflow-hidden">
      <div className="absolute inset-0">
        <video autoPlay muted loop playsInline className="scene-video" style={{ filter: 'brightness(0.35) saturate(0.6)' }}>
          <source src="/videos/sce2.mp4" type="video/mp4" />
        </video>
        <div className="absolute inset-0" style={{ background: 'linear-gradient(to right, rgba(20,20,20,0.15) 0%, rgba(20,20,20,0.35) 40%, rgba(20,20,20,0.7) 100%)' }} />
      </div>

      {/* Departure board */}
      <motion.div
        className="absolute inset-y-0 right-0 z-10 flex flex-col items-end justify-center px-6 sm:px-10 lg:px-16"
        style={{ y: boardY, width: 'min(100%, 560px)' }}
      >
        <p className="text-label text-white/40 mb-8">Norman Manley International · Kingston</p>

        <div className="glass-card p-6 md:p-10 w-full">
          <div className="flex items-center justify-between mb-6 pb-6 border-b border-white/10">
            <span className="text-label text-white/50">FLIGHT</span>
            <span className="text-label text-white/50">DEPARTURE</span>
            <span className="text-label text-white/50">STATUS</span>
          </div>

          {['BW 406', 'AA 782', 'JM 114'].map((flight, i) => (
            <div key={flight} className="flex items-center justify-between py-4 border-b border-white/5">
              <span className="text-editorial text-white/85 font-medium">{flight}</span>
              <span className="text-editorial text-white/58">{['14:30', '15:45', '16:20'][i]}</span>
              <motion.span
                className="text-label px-3 py-1 rounded-full"
                style={{
                  color: i === 0 ? (status === 'DELAYED' ? '#ef4444' : '#52b788') : '#52b788',
                  background: i === 0 ? (status === 'DELAYED' ? 'rgba(239,68,68,0.12)' : 'rgba(82,183,136,0.12)') : 'rgba(82,183,136,0.12)',
                  transition: 'all 0.8s ease',
                }}
              >
                {i === 0 ? status : 'ON TIME'}
              </motion.span>
            </div>
          ))}
        </div>

        {status === 'DELAYED' && (
          <motion.p
            className="text-editorial text-white/50 mt-8 text-right"
            style={{ fontSize: '1.1rem', maxWidth: '28ch' }}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
          >
            One status change.<br />
            <span className="text-white/78">Twenty stakeholders. Zero coordination.</span>
          </motion.p>
        )}
      </motion.div>
    </div>
  )
}
