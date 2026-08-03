'use client'
import { useEffect } from 'react'

export function useLenis() {
  useEffect(() => {
    let lenis: any = null
    let rafId: number | null = null
    let cancelled = false

    async function initLenis() {
      try {
        const Lenis = (await import('@studio-freight/lenis')).default
        if (cancelled) return
        lenis = new Lenis({
          duration: 1.2,
          easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
          smoothWheel: true,
          wheelMultiplier: 0.8,
        })

        function raf(time: number) {
          lenis.raf(time)
          rafId = requestAnimationFrame(raf)
        }
        rafId = requestAnimationFrame(raf)
      } catch (e) {
        // Lenis not available, use native scroll
      }
    }

    initLenis()

    return () => {
      cancelled = true
      if (rafId !== null) cancelAnimationFrame(rafId)
      if (lenis) lenis.destroy()
    }
  }, [])
}
