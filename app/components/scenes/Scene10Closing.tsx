'use client'
import { useRef } from 'react'
import { motion, useScroll, useTransform } from 'framer-motion'

export default function Scene10Closing() {
  const ref = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end end'] })
  const bgScale = useTransform(scrollYProgress, [0, 1], [1.1, 1])

  return (
    <section ref={ref} id="contact" className="relative overflow-hidden" style={{ minHeight: '140vh' }}>
      {/* Sunrise-warm video backdrop */}
      <motion.div className="absolute inset-0" style={{ scale: bgScale }}>
        <video
          autoPlay muted loop playsInline
          className="scene-video"
          style={{ filter: 'brightness(0.3) saturate(0.9) hue-rotate(10deg)' }}
        >
          <source src="/videos/sce7.mp4" type="video/mp4" />
        </video>
        <div className="absolute inset-0" style={{
          background: 'linear-gradient(115deg, rgba(20,20,20,0.25) 0%, rgba(20,20,20,0.5) 40%, rgba(20,20,20,0.88) 78%, rgba(20,20,20,0.92) 100%)'
        }} />
      </motion.div>

      <div className="relative z-10 flex flex-col items-end justify-center text-right px-6 sm:px-10 lg:px-16 py-24 ml-auto" style={{ minHeight: '140vh', width: 'min(100%, 680px)' }}>
        <motion.h2
          className="text-display text-white mb-8"
          style={{ fontSize: 'clamp(2.2rem, 6vw, 5.5rem)', lineHeight: 1, maxWidth: '15ch' }}
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 1, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
        >
          Travel isn't constrained
          <br />
          <span style={{ color: 'var(--sand)', fontWeight: 300 }}>by demand.</span>
        </motion.h2>

        <motion.p
          className="text-editorial text-white/58 mb-4"
          style={{ fontSize: 'clamp(1rem, 2.5vw, 1.4rem)', maxWidth: '32ch' }}
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, delay: 0.5 }}
        >
          It's constrained by coordination.
        </motion.p>

        <motion.p
          className="text-editorial text-white/40 mb-16"
          style={{ fontSize: '1rem', maxWidth: '40ch' }}
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, delay: 0.7 }}
        >
          Ripple is building the coordination layer for Caribbean tourism — and beyond. Join us.
        </motion.p>

        <motion.div
          className="flex flex-col sm:flex-row gap-4 items-end sm:items-center"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, delay: 0.9 }}
        >
          <a
            href="mailto:hello@ripple.travel"
            className="px-10 py-4 rounded-full text-editorial font-medium transition-all duration-300 hover:scale-105 hover:shadow-lg"
            style={{
              background: 'var(--warm-white)',
              color: 'var(--charcoal)',
              fontSize: '0.95rem',
              letterSpacing: '-0.01em',
            }}
          >
            Join the Future of Tourism
          </a>
          <a
            href="mailto:operators@ripple.travel"
            className="px-10 py-4 rounded-full text-editorial transition-all duration-300 hover:bg-white/10"
            style={{
              border: '1px solid rgba(255,255,255,0.2)',
              color: 'rgba(255,255,255,0.7)',
              fontSize: '0.95rem',
            }}
          >
            I'm an Operator
          </a>
        </motion.div>

        {/* Footer */}
        <div className="absolute bottom-8 left-0 right-0 flex justify-center">
          <p className="text-label text-white/32">© {new Date().getFullYear()} Ripple Technologies · Caribbean</p>
        </div>
      </div>
    </section>
  )
}
