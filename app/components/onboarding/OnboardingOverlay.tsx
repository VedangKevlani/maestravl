'use client'
// The tour's actual visuals: a dimmed scrim with a spotlight cutout around
// the real element being explained, an arrow pointing at it, and a callout
// with the step's note. Renders nothing until the current step's real
// target is actually found in the DOM — which is also how it survives
// navigation: after a `completion.onNavigateAway` step's real click lands
// on a new page, this just keeps polling until the next step's target
// mounts, rather than needing to know exactly when that happens.
import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import { useOnboarding } from './OnboardingProvider'
import { TOUR_STEPS } from './steps'

const POLL_MS = 350
const PAD = 8 // breathing room between the highlighted element and its ring/cutout
const GAP = 14 // distance between the ring and the callout box

function findTarget(target: string): Element | null {
  return document.querySelector(`[data-tour="${target}"]`)
}

export default function OnboardingOverlay() {
  const { active, stepIndex, totalSteps, advance, dismiss } = useOnboarding()
  const pathname = usePathname()
  const step = TOUR_STEPS[stepIndex] ?? null

  const [rect, setRect] = useState<DOMRect | null>(null)
  const baselineCountRef = useRef(0)
  const hasMatchedPathRef = useRef(false)
  const hasScrolledRef = useRef(false)

  // Reset per-step bookkeeping whenever the step changes — the baseline
  // count a "did they actually do it" check compares against has to be
  // captured fresh each time, not carried over from the previous step.
  useEffect(() => {
    hasMatchedPathRef.current = false
    hasScrolledRef.current = false
    setRect(null)
    if (step?.completion?.selectorCountIncreases) {
      baselineCountRef.current = document.querySelectorAll(step.completion.selectorCountIncreases).length
    } else {
      baselineCountRef.current = 0
    }
  }, [stepIndex, step])

  useEffect(() => {
    if (!active || !step) return

    const tick = () => {
      const matches = step.path.test(pathname)
      if (!matches) {
        setRect(null)
        // Only a real "they navigated away FROM this step," never a
        // coincidental mismatch before the step's own page ever loaded.
        if (hasMatchedPathRef.current && step.completion?.onNavigateAway) advance()
        return
      }

      hasMatchedPathRef.current = true
      const el = findTarget(step.target)

      // The first time this step's target is found, bring it into view —
      // on a long page (e.g. the trip detail page once a segment exists)
      // it can otherwise sit below the fold, which would compute a
      // callout position off-screen entirely (a `position: fixed` box has
      // no way to be scrolled into view once that happens).
      if (el && !hasScrolledRef.current) {
        hasScrolledRef.current = true
        el.scrollIntoView({ block: 'center', behavior: 'smooth' })
      }

      setRect(el ? el.getBoundingClientRect() : null)

      if (step.completion?.selectorCountIncreases) {
        const count = document.querySelectorAll(step.completion.selectorCountIncreases).length
        if (count > baselineCountRef.current) advance()
      }
    }

    tick()
    const id = setInterval(tick, POLL_MS)
    return () => clearInterval(id)
  }, [active, step, pathname, advance])

  if (!active || !step || !rect) return null

  const isLast = stepIndex === totalSteps - 1
  const isInteractive = Boolean(step.completion)
  const vw = window.innerWidth
  const vh = window.innerHeight

  const holeTop = Math.max(rect.top - PAD, 0)
  const holeLeft = Math.max(rect.left - PAD, 0)
  const holeRight = Math.min(rect.right + PAD, vw)
  const holeBottom = Math.min(rect.bottom + PAD, vh)

  const scrimStyle: React.CSSProperties = { position: 'fixed', background: 'rgba(10,10,10,0.68)', pointerEvents: 'auto', zIndex: 200 }

  // HALF/FULL_BOX_BUDGET are conservative estimates of this box's rendered
  // size (a fixed ~20rem/320px wide box, but height varies with each
  // step's note length) — used both to pick which side of the target
  // actually has room, and as a last-resort clamp.
  const HALF_BOX_BUDGET = 160
  const FULL_BOX_BUDGET = 240
  const clamp = (n: number, min: number, max: number) => Math.min(Math.max(n, min), max)

  // A step's `placement` is a preference, not a guarantee — a step whose
  // target grows (e.g. the passenger form expanding downward when clicked)
  // or that simply doesn't have full_box_budget of clear space on its
  // preferred side flips to the opposite side instead. Without this, a
  // target near the top of the page with a `placement: 'top'` step would
  // have its callout's clamp (stopping it clipping above the viewport)
  // push it *down* past the target's own top edge — directly over
  // whatever's at the top of the target, which is exactly the bug this
  // fixes: the passenger step's callout was landing on top of its own
  // Add button.
  const NEEDED = FULL_BOX_BUDGET + GAP
  const placement: 'top' | 'bottom' | 'left' | 'right' = (() => {
    if (step.placement === 'top' || step.placement === 'bottom') {
      const spaceAbove = holeTop
      const spaceBelow = vh - holeBottom
      if (step.placement === 'top' && spaceAbove < NEEDED && spaceBelow > spaceAbove) return 'bottom'
      if (step.placement === 'bottom' && spaceBelow < NEEDED && spaceAbove > spaceBelow) return 'top'
      return step.placement
    }
    const spaceLeft = holeLeft
    const spaceRight = vw - holeRight
    if (step.placement === 'left' && spaceLeft < NEEDED && spaceRight > spaceLeft) return 'right'
    if (step.placement === 'right' && spaceRight < NEEDED && spaceLeft > spaceRight) return 'left'
    return step.placement
  })()

  const calloutAnchor: React.CSSProperties = (() => {
    const centerX = clamp(rect.left + rect.width / 2, 170, vw - 170)
    const centerY = clamp(rect.top + rect.height / 2, HALF_BOX_BUDGET, vh - HALF_BOX_BUDGET)
    switch (placement) {
      case 'top':
        return { bottom: clamp(vh - holeTop + GAP, 8, vh - FULL_BOX_BUDGET), left: centerX, transform: 'translateX(-50%)' }
      case 'left':
        return { right: clamp(vw - holeLeft + GAP, 8, vw - 8), top: centerY, transform: 'translateY(-50%)' }
      case 'right':
        return { left: clamp(holeRight + GAP, 8, vw - 8), top: centerY, transform: 'translateY(-50%)' }
      case 'bottom':
      default:
        return { top: clamp(holeBottom + GAP, 8, vh - FULL_BOX_BUDGET), left: centerX, transform: 'translateX(-50%)' }
    }
  })()

  const arrowBase: React.CSSProperties = { position: 'absolute', width: 0, height: 0, borderStyle: 'solid' }
  const CALLOUT_BG = 'rgba(24,24,24,0.98)'
  const arrowStyle: React.CSSProperties = (() => {
    switch (placement) {
      case 'top':
        return { ...arrowBase, bottom: -7, left: '50%', transform: 'translateX(-50%)', borderWidth: '7px 7px 0 7px', borderColor: `${CALLOUT_BG} transparent transparent transparent` }
      case 'left':
        return { ...arrowBase, right: -7, top: '50%', transform: 'translateY(-50%)', borderWidth: '7px 0 7px 7px', borderColor: `transparent transparent transparent ${CALLOUT_BG}` }
      case 'right':
        return { ...arrowBase, left: -7, top: '50%', transform: 'translateY(-50%)', borderWidth: '7px 7px 7px 0', borderColor: `transparent ${CALLOUT_BG} transparent transparent` }
      case 'bottom':
      default:
        return { ...arrowBase, top: -7, left: '50%', transform: 'translateX(-50%)', borderWidth: '0 7px 7px 7px', borderColor: `transparent transparent ${CALLOUT_BG} transparent` }
    }
  })()

  return (
    <div aria-live="polite">
      {isInteractive ? (
        <>
          <div style={{ ...scrimStyle, top: 0, left: 0, width: '100%', height: holeTop }} />
          <div style={{ ...scrimStyle, top: holeBottom, left: 0, width: '100%', height: Math.max(vh - holeBottom, 0) }} />
          <div style={{ ...scrimStyle, top: holeTop, left: 0, width: holeLeft, height: holeBottom - holeTop }} />
          <div style={{ ...scrimStyle, top: holeTop, left: holeRight, width: Math.max(vw - holeRight, 0), height: holeBottom - holeTop }} />
        </>
      ) : (
        <div style={{ ...scrimStyle, top: 0, left: 0, width: '100%', height: '100%' }} onClick={(e) => e.stopPropagation()} />
      )}

      <motion.div
        key={`ring-${step.id}`}
        initial={false}
        animate={{ top: holeTop, left: holeLeft, width: holeRight - holeLeft, height: holeBottom - holeTop }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        style={{
          position: 'fixed',
          zIndex: 201,
          borderRadius: 12,
          boxShadow: '0 0 0 2px rgba(245,243,239,0.85), 0 0 24px rgba(245,243,239,0.25)',
          pointerEvents: 'none',
        }}
      />

      {/*
        Positioning (fixed + top/left/right/bottom + the translate(-50%)
        centering in calloutAnchor) lives on this plain div, deliberately
        separate from the motion.div below it. Framer Motion manages the
        `transform` CSS property itself for its own scale/opacity
        animation and will silently override a static `transform` string
        passed alongside it — so a translate-based centering offset can
        never live on the same element as a Framer Motion animation.
      */}
      <div style={{ position: 'fixed', zIndex: 202, width: '20rem', maxWidth: 'calc(100vw - 2rem)', ...calloutAnchor }}>
        <AnimatePresence mode="wait">
          <motion.div
            key={step.id}
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.2 }}
            className="glass-card"
            style={{ position: 'relative', background: CALLOUT_BG, padding: '1.1rem 1.25rem' }}
          >
            <div style={arrowStyle} />
            <p className="text-label text-white/30 mb-1.5" style={{ fontSize: '0.6rem' }}>
              {stepIndex + 1} of {totalSteps}
            </p>
            <h3 className="text-editorial text-white font-medium mb-1.5" style={{ fontSize: '0.95rem' }}>{step.title}</h3>
            <p className="text-editorial text-white/65 mb-4" style={{ fontSize: '0.82rem', lineHeight: 1.55 }}>{step.note}</p>
            <div className="flex items-center justify-between gap-3">
              {isInteractive ? (
                <button onClick={advance} className="text-label text-white/35 hover:text-white/70" style={{ fontSize: '0.62rem' }}>
                  Skip this step
                </button>
              ) : (
                <button
                  onClick={advance}
                  className="px-4 py-1.5 rounded-full text-label"
                  style={{ background: 'var(--warm-white)', color: 'var(--charcoal)', fontSize: '0.65rem' }}
                >
                  {isLast ? 'Finish' : 'Next'}
                </button>
              )}
              <button onClick={dismiss} className="text-label text-white/25 hover:text-white/60" style={{ fontSize: '0.62rem' }}>
                Skip tour
              </button>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}
