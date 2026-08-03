'use client'
import { useLenis } from './hooks/useLenis'
import SiteHeader from './components/SiteHeader'
import ScrollStage from './components/ScrollStage'
import Scene10Closing from './components/scenes/Scene10Closing'
import BackToTop from './components/BackToTop'

export default function RipplePage() {
  useLenis()

  return (
    <main>
      <SiteHeader />
      <ScrollStage />
      <Scene10Closing />
      <BackToTop />
    </main>
  )
}
