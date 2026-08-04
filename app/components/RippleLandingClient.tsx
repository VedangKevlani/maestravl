'use client'
import { useLenis } from '../hooks/useLenis'
import SiteHeader from './SiteHeader'
import ScrollStage from './ScrollStage'
import Scene10Closing from './scenes/Scene10Closing'
import BackToTop from './BackToTop'

export default function RippleLandingClient() {
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
