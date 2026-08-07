'use client'
import { motion } from 'framer-motion'
import Link from 'next/link'
import MaestravlMark from './MaestravlMark'

export default function SiteHeader() {
  return (
    <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-6 sm:px-8 sm:py-7 pointer-events-none">
      <div
        className="absolute inset-x-0 top-0 pointer-events-none"
        style={{ height: '140px', background: 'linear-gradient(to bottom, rgba(10,10,10,0.55) 0%, rgba(10,10,10,0.25) 55%, transparent 100%)' }}
      />
      <motion.div
        className="pointer-events-auto flex items-center gap-2.5"
        initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.8, duration: 0.6 }}
      >
        <MaestravlMark size={22} />
        <span className="text-label text-white/78" style={{ fontSize: '0.8rem', letterSpacing: '0.16em' }}>MAESTRAVL</span>
      </motion.div>
      <motion.div
        className="pointer-events-auto"
        initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.2, duration: 0.6 }}
      >
        <Link
          href="/signup"
          className="text-label inline-flex items-center rounded-full transition-all duration-300 hover:bg-white/10"
          style={{
            fontSize: '0.68rem',
            padding: '0.55rem 1.1rem',
            border: '1px solid rgba(255,255,255,0.25)',
            color: 'rgba(255,255,255,0.8)',
          }}
        >
          Join Early Access
        </Link>
      </motion.div>
    </div>
  )
}
