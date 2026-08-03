'use client'
import { useRef, useState, useEffect, type ComponentType } from 'react'
import { motion, AnimatePresence, useScroll, useTransform, MotionValue } from 'framer-motion'
import Scene1Silence from './scenes/Scene1Silence'
import Scene2Moment from './scenes/Scene2Moment'
import Scene3RippleEffect from './scenes/Scene3RippleEffect'
import Scene4Chaos from './scenes/Scene4Chaos'
import Scene5RippleAppears from './scenes/Scene5RippleAppears'
import Scene6OneMessage from './scenes/Scene6OneMessage'
import Scene7Caribbean from './scenes/Scene7Caribbean'
import Scene8Technology from './scenes/Scene8Technology'
import Scene9WhyRipple from './scenes/Scene9WhyRipple'

export type SceneProps = { progress: MotionValue<number> }

const SCENES: { Component: ComponentType<SceneProps>; weight: number }[] = [
  { Component: Scene1Silence, weight: 130 },
  { Component: Scene2Moment, weight: 150 },
  { Component: Scene3RippleEffect, weight: 160 },
  { Component: Scene4Chaos, weight: 150 },
  { Component: Scene5RippleAppears, weight: 160 },
  { Component: Scene6OneMessage, weight: 140 },
  { Component: Scene7Caribbean, weight: 150 },
  { Component: Scene8Technology, weight: 150 },
  { Component: Scene9WhyRipple, weight: 280 },
]

const TOTAL_WEIGHT = SCENES.reduce((sum, s) => sum + s.weight, 0)

const BOUNDARIES = (() => {
  const bounds: number[] = [0]
  let acc = 0
  for (const s of SCENES) {
    acc += s.weight
    bounds.push(acc / TOTAL_WEIGHT)
  }
  return bounds
})()

export default function ScrollStage() {
  const ref = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] })
  const [activeIndex, setActiveIndex] = useState(0)

  const localProgresses = SCENES.map((_, i) =>
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useTransform(scrollYProgress, [BOUNDARIES[i], BOUNDARIES[i + 1]], [0, 1])
  )

  useEffect(() => {
    const unsub = scrollYProgress.on('change', (v) => {
      let idx = SCENES.length - 1
      for (let i = 0; i < BOUNDARIES.length - 1; i++) {
        if (v >= BOUNDARIES[i] && v < BOUNDARIES[i + 1]) {
          idx = i
          break
        }
      }
      setActiveIndex((prev) => (prev !== idx ? idx : prev))
    })
    return unsub
  }, [scrollYProgress])

  const ActiveComponent = SCENES[activeIndex].Component
  const activeProgress = localProgresses[activeIndex]

  return (
    <div ref={ref} className="relative" style={{ height: `${TOTAL_WEIGHT}vh` }}>
      <div className="sticky top-0 h-screen w-full overflow-hidden">
        <AnimatePresence mode="sync">
          <motion.div
            key={activeIndex}
            className="absolute inset-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
          >
            <ActiveComponent progress={activeProgress} />
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}
