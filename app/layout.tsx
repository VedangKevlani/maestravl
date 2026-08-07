import type { Metadata } from 'next'
import './globals.css'
import MotionProvider from './components/MotionProvider'

export const metadata: Metadata = {
  title: 'Maestravl — The Intelligence Behind Every Journey',
  description: 'Maestravl is the autonomous coordination layer for tourism. When disruptions happen, every stakeholder is updated before you even notice.',
  openGraph: {
    title: 'Maestravl — The Intelligence Behind Every Journey',
    description: 'When travel changes, Maestravl coordinates everything.',
    type: 'website',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="grain">
        <MotionProvider>{children}</MotionProvider>
      </body>
    </html>
  )
}
