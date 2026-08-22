'use client'
import { useRef } from 'react'
import { motion, useScroll, useTransform } from 'framer-motion'
import Link from 'next/link'

export default function Scene10Closing() {
  const ref = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end end'] })
  const cardScale = useTransform(scrollYProgress, [0, 1], [1.05, 1])

  return (
    <section
      ref={ref}
      id="contact"
      className="relative overflow-hidden"
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        background: 'linear-gradient(135deg, #0a0b0e 0%, #12141a 55%, #162016 100%)',
      }}
    >
      {/* 2-column row — directly flex-centered in the section */}
      <div
        className="flex items-center justify-center w-full px-8 sm:px-12 lg:px-20 gap-3 lg:gap-5 pt-24 pb-16"
        style={{ maxWidth: '1280px', margin: '0 auto' }}
      >
        {/* Left: rounded video card */}
        <motion.div
          className="flex-1 hidden sm:block"
          style={{ maxWidth: '520px' }}
          initial={{ opacity: 0, x: -30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.3, duration: 1, ease: [0.16, 1, 0.3, 1] }}
        >
          <motion.div
            className="relative overflow-hidden"
            style={{
              borderRadius: 24,
              border: '1px solid rgba(255,255,255,0.08)',
              aspectRatio: '1/1',
              scale: cardScale,
            }}
          >
            <video
              autoPlay muted loop playsInline
              style={{
                position: 'absolute', inset: 0, width: '100%', height: '100%',
                objectFit: 'cover',
                filter: 'brightness(0.68) saturate(0.85)',
              }}
            >
              <source src="/videos/sce7.mp4" type="video/mp4" />
            </video>
            <div className="absolute inset-0" style={{
              background: 'linear-gradient(to bottom right, rgba(10,10,10,0.08) 0%, rgba(10,10,10,0.4) 100%)'
            }} />
          </motion.div>
        </motion.div>

        {/* Right: text + CTA */}
        <motion.div
          className="flex-1 flex flex-col items-end justify-center text-right"
          style={{ maxWidth: '520px' }}
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 1, ease: [0.16, 1, 0.3, 1] }}
        >
          <p className="text-label text-white/40 mb-8">
            the future of tourism coordination
          </p>

          <h2
            className="text-display text-white mb-6"
            style={{ fontSize: 'clamp(2.2rem, 5.5vw, 4.75rem)', lineHeight: 1.0, maxWidth: '15ch' }}
          >
            Travel isn't constrained<br />
            <span style={{ color: 'var(--accent, #8fc180)', fontWeight: 300 }}>by demand.</span>
          </h2>

          <p
            className="text-editorial text-white/58 mb-3"
            style={{ fontSize: 'clamp(1rem, 2vw, 1.3rem)', maxWidth: '32ch' }}
          >
            It's constrained by coordination.
          </p>

          <p
            className="text-editorial text-white/40 mb-12"
            style={{ fontSize: '0.95rem', maxWidth: '38ch' }}
          >
            Maestravl is building the coordination layer for Caribbean tourism — and beyond. Join us.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 items-end sm:items-center">
            <Link
              href="/signup"
              className="px-10 py-4 rounded-full text-editorial font-semibold transition-all duration-300 hover:scale-105 hover:shadow-lg"
              style={{
                background: 'var(--accent, #8fc180)',
                color: '#0f1218',
                fontSize: '0.95rem',
                fontWeight: 600,
                letterSpacing: '-0.01em',
              }}
            >
              Join the Future of Tourism
            </Link>
            <a
              href="mailto:operators@maestravl.com"
              className="px-10 py-4 rounded-full text-editorial transition-all duration-300 hover:bg-white/10"
              style={{
                border: '1px solid rgba(255,255,255,0.2)',
                color: 'rgba(255,255,255,0.7)',
                fontSize: '0.95rem',
              }}
            >
              I'm an Operator
            </a>
          </div>
        </motion.div>
      </div>

      {/* Footer */}
      <div className="absolute bottom-4 left-0 right-0 flex justify-center z-20">
        <p className="text-label text-white/32">© {new Date().getFullYear()} Maestravl Technologies · Caribbean</p>
      </div>
    </section>
  )
}
