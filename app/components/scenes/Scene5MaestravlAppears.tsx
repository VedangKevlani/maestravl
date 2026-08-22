'use client'
import { motion, useTransform, MotionValue, easeInOut } from 'framer-motion'
import { Plane, Car, Building2, Compass, Ship } from 'lucide-react'
import type { SceneProps } from '../ScrollStage'
import MaestravlMark from '../MaestravlMark'

const NOTIFICATIONS = [
  { Icon: Plane, text: 'Flight rescheduled · 18:45', time: 'now', color: 'var(--status-blue, #6f9ad9)' },
  { Icon: Car, text: 'Driver updated · New pickup 17:30', time: '2s', color: 'var(--accent, #8fc180)' },
  { Icon: Building2, text: 'Check-in extended · No charge', time: '4s', color: 'var(--accent, #8fc180)' },
  { Icon: Compass, text: 'Tour rebooked · Tomorrow 9am', time: '6s', color: 'var(--accent, #8fc180)' },
]

const CHECKLINES = [
  'Your driver is rescheduled for 17:30.',
  'Hotel extended your check-in.',
  "Tomorrow's excursion is confirmed.",
  'Dinner moved to 20:30.',
]

function NotificationRow({ n, index, progress }: { n: typeof NOTIFICATIONS[0]; index: number; progress: MotionValue<number> }) {
  const start = 0.10 + index * 0.07
  const opacity = useTransform(progress, [start, start + 0.10], [0, 1], { ease: easeInOut })
  const x = useTransform(progress, [start, start + 0.10], [30, 0], { ease: easeInOut })

  return (
    <motion.div
      className="glass-card flex items-center gap-4 px-4 py-3"
      style={{ opacity, x }}
    >
      <div
        className="flex items-center justify-center flex-shrink-0"
        style={{
          width: 34, height: 34, borderRadius: 9,
          background: 'var(--hover, #25282e)',
          border: '1.5px solid var(--border-soft, #2f333b)',
        }}
      >
        <n.Icon size={14} strokeWidth={1.8} color={n.color} />
      </div>
      <p className="text-editorial text-white/90 flex-1" style={{ fontSize: '0.85rem' }}>{n.text}</p>
      <span className="text-label text-white/40 flex-shrink-0" style={{ fontSize: '0.6rem' }}>{n.time} ago</span>
    </motion.div>
  )
}

export default function Scene5MaestravlAppears({ progress }: SceneProps) {
  // Beat 1 (0.00 - 0.38): Logo & notifications appear dead-centered on screen (+25vw offset in Column 1 = 50vw dead center)
  const logoScale = useTransform(progress, [0.02, 0.16], [0.6, 1], { ease: easeInOut })
  const logoOpacity = useTransform(progress, [0.02, 0.14], [0, 1], { ease: easeInOut })

  // Beat 2 Shift (0.34 - 0.48): Autonomous stack shifts from screen center (+25vw) to left column (0vw)
  const leftStackX = useTransform(progress, [0.34, 0.48], ['25vw', '0vw'], { ease: easeInOut })

  // Beat 2 Load-in (0.38 - 0.54): Maestro Card & tiny text fade in on right 50%
  const cardOpacity = useTransform(progress, [0.38, 0.50], [0, 1], { ease: easeInOut })
  const cardY = useTransform(progress, [0.38, 0.50], [25, 0], { ease: easeInOut })
  const cardMessageOpacity = useTransform(progress, [0.44, 0.54], [0, 1], { ease: easeInOut })

  // Beat 3 (0.46 - 0.60): Left stack fades out (0.46-0.54), Maestro card glides left (0.46-0.54), "One message" text loads (0.54-0.60)
  const leftStackOpacity = useTransform(progress, [0.0, 0.46, 0.54], [1, 1, 0], { ease: easeInOut })
  const cardShiftX = useTransform(progress, [0.46, 0.54], ['0vw', '-34vw'], { ease: easeInOut })
  const captionOpacity = useTransform(progress, [0.54, 0.60], [0, 1], { ease: easeInOut })
  const captionY = useTransform(progress, [0.54, 0.60], [25, 0], { ease: easeInOut })

  // Beat 3 EXTENDED FINAL HOLD WINDOW (0.60 - 1.00): Full layout holds steady on screen for 40% of scroll progress (~260vh of scroll distance!)

  return (
    <div className="absolute inset-0 overflow-hidden" style={{ background: 'var(--page, #0a0b0e)' }}>
      {/* Background gradient matching Scene 2 */}
      <div className="absolute inset-0" style={{
        background: 'linear-gradient(135deg, #0a0b0e 0%, #12151c 60%, #1b1812 100%)'
      }} />

      <div className="absolute inset-0 z-10 grid grid-cols-1 md:grid-cols-2 items-center px-8 sm:px-12 lg:px-20 gap-8 lg:gap-14">
        {/* Column 1 (Left): Autonomous coordination stack (Starts centered at +17vw, shifts left to 0vw in Beat 2, fades out in Beat 3) */}
        <div className="flex items-center justify-center w-full">
          <motion.div
            className="flex flex-col items-center justify-center gap-8 w-full max-w-sm"
            style={{ opacity: leftStackOpacity, x: leftStackX }}
          >
            {/* Logo appear */}
            <motion.div style={{ scale: logoScale, opacity: logoOpacity }} className="flex flex-col items-center gap-3 text-center">
              <MaestravlMark size={72} />
              <p className="text-label text-white/40" style={{ letterSpacing: '0.12em' }}>Autonomous coordination</p>
            </motion.div>

            {/* Notification stack */}
            <div className="w-full flex flex-col gap-3">
              {NOTIFICATIONS.map((n, i) => (
                <NotificationRow key={n.text} n={n} index={i} progress={progress} />
              ))}
            </div>
          </motion.div>
        </div>

        {/* Column 2 (Right): Holds Maestro Card in Beat 2 (shifts to Left Column in Beat 3) AND "One message" text in Beat 3 */}
        <div className="relative flex items-center justify-center w-full">
          {/* Maestro Card + Tiny text */}
          <motion.div
            className="flex flex-col gap-3 justify-center w-full max-w-sm"
            style={{ opacity: cardOpacity, y: cardY, x: cardShiftX }}
          >
            <p className="text-editorial text-white/70" style={{ fontSize: '0.88rem' }}>
              Maestravl's very own{' '}
              <span style={{ color: 'var(--accent, #8fc180)', fontWeight: 600 }}>
                AI Travel Coordinator
              </span>
            </p>

            <div
              className="glass-card"
              style={{
                borderRadius: 20,
                padding: '20px',
                border: '1.5px solid var(--border, #40454e)',
                background: 'var(--card, #1b1d22)',
              }}
            >
              {/* Card header */}
              <div className="flex items-center gap-3 mb-4 pb-3 border-b border-white/10">
                <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'var(--hover, #25282e)' }}>
                  <MaestravlMark size={18} />
                </div>
                <div>
                  <p className="text-editorial text-white font-medium" style={{ fontSize: '0.88rem' }}>Maestro</p>
                  <p className="text-label text-white/40" style={{ fontSize: '0.58rem', letterSpacing: '0.1em' }}>YOUR TRAVEL COORDINATOR</p>
                </div>
                <div className="ml-auto w-2 h-2 rounded-full flex-shrink-0" style={{ background: 'var(--accent, #8fc180)' }} />
              </div>

              {/* Message bubble */}
              <motion.div
                style={{ opacity: cardMessageOpacity }}
                className="glass-card px-4 py-3.5"
                aria-label="Maestro message"
              >
                <p className="text-editorial text-white" style={{ fontSize: '0.9rem', fontWeight: 500, marginBottom: 8 }}>
                  Everything has been handled.
                </p>
                <div className="flex flex-col gap-1.5">
                  {CHECKLINES.map((line) => (
                    <p key={line} className="text-editorial text-white/70" style={{ fontSize: '0.76rem', lineHeight: 1.5 }}>
                      <span style={{ color: 'var(--accent, #8fc180)', marginRight: 6, fontWeight: 700 }}>✓</span>
                      {line}
                    </p>
                  ))}
                </div>
                <p className="text-editorial text-white/35 mt-3" style={{ fontSize: '0.68rem', textAlign: 'right' }}>
                  — Maestro, 14:42
                </p>
              </motion.div>
            </div>
          </motion.div>

          {/* "One message" text (Fades in in Beat 3 in the Right Column) */}
          <motion.div
            className="absolute flex flex-col justify-center w-full max-w-sm pointer-events-none"
            style={{ opacity: captionOpacity, y: captionY }}
          >
            <p
              className="text-display text-white"
              style={{ fontSize: 'clamp(1.8rem, 3.4vw, 2.8rem)', lineHeight: 1.15 }}
            >
              One message.<br />
              <span className="text-white/58" style={{ fontWeight: 300 }}>The feeling of relief.</span>
            </p>
          </motion.div>
        </div>
      </div>
    </div>
  )
}
