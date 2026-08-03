'use client'
import { useState } from 'react'
import { motion, useTransform, MotionValue } from 'framer-motion'
import type { SceneProps } from '../ScrollStage'

const NODES = [
  { id: 'traveller', label: 'Traveller', x: 50, y: 10, color: '#4aa0d8' },
  { id: 'flight', label: 'Flight', x: 50, y: 30, color: '#d4a853' },
  { id: 'driver', label: 'Driver', x: 20, y: 55, color: '#52b788' },
  { id: 'hotel', label: 'Hotel', x: 50, y: 55, color: '#52b788' },
  { id: 'excursion', label: 'Excursion', x: 80, y: 55, color: '#52b788' },
  { id: 'restaurant', label: 'Restaurant', x: 30, y: 80, color: '#52b788' },
  { id: 'ferry', label: 'Ferry', x: 70, y: 80, color: '#52b788' },
]

const EDGES = [
  ['traveller', 'flight'],
  ['flight', 'driver'],
  ['flight', 'hotel'],
  ['flight', 'excursion'],
  ['hotel', 'restaurant'],
  ['excursion', 'ferry'],
]

function GraphNode({ node, index, progress, activeNode, setActiveNode }: {
  node: typeof NODES[0]; index: number; progress: MotionValue<number>
  activeNode: string | null; setActiveNode: (id: string | null) => void
}) {
  const start = 0.2 + index * 0.06
  const opacity = useTransform(progress, [start, start + 0.12], [0, 1])
  const scale = useTransform(progress, [start, start + 0.12], [0, 1])
  const isActive = activeNode === node.id

  return (
    <motion.button
      className="absolute flex flex-col items-center gap-1"
      style={{
        left: `${node.x}%`,
        top: `${node.y}%`,
        transform: 'translate(-50%, -50%)',
        opacity, scale,
      }}
      onMouseEnter={() => setActiveNode(node.id)}
      onMouseLeave={() => setActiveNode(null)}
      onClick={() => setActiveNode(isActive ? null : node.id)}
    >
      <motion.div
        className="rounded-full flex items-center justify-center"
        style={{
          width: isActive ? 44 : 36,
          height: isActive ? 44 : 36,
          background: isActive ? node.color : `${node.color}30`,
          border: `1.5px solid ${node.color}`,
          transition: 'all 0.3s ease',
          boxShadow: isActive ? `0 0 20px ${node.color}50` : 'none',
        }}
      >
        {isActive && (
          <motion.div
            className="w-2 h-2 rounded-full bg-white"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
          />
        )}
      </motion.div>
      <span className="text-label text-white/68" style={{ fontSize: '0.55rem', whiteSpace: 'nowrap' }}>{node.label}</span>
    </motion.button>
  )
}

export default function Scene8Technology({ progress }: SceneProps) {
  const [activeNode, setActiveNode] = useState<string | null>(null)
  const edgePathLength = useTransform(progress, [0.1, 0.4], [0, 1])
  const edgeOpacity = useTransform(progress, [0.1, 0.2], [0, 1])

  const getNode = (id: string) => NODES.find(n => n.id === id)!

  return (
    <div className="absolute inset-0 overflow-hidden">
      <div className="absolute inset-0" style={{ background: '#0d1520' }} />

      <div className="absolute inset-0 z-10 flex flex-col items-center justify-center px-6">
        <motion.p className="text-label text-white/40 mb-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6 }}>
          real-time coordination graph
        </motion.p>
        <motion.h2
          className="text-display text-center text-white mb-12"
          style={{ fontSize: 'clamp(2rem, 4vw, 3.5rem)', maxWidth: '24ch' }}
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1, duration: 0.6 }}
        >
          One intelligent layer.<br />
          <span style={{ color: 'var(--ocean-bright)' }}>Every stakeholder.</span>
        </motion.h2>

        {/* SVG Graph */}
        <div className="relative w-full max-w-md" style={{ height: 340 }}>
          <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
            {EDGES.map(([from, to]) => {
              const fromNode = getNode(from)
              const toNode = getNode(to)
              const isActive = activeNode === from || activeNode === to
              return (
                <motion.line
                  key={`${from}-${to}`}
                  x1={fromNode.x} y1={fromNode.y}
                  x2={toNode.x} y2={toNode.y}
                  stroke={isActive ? '#4aa0d8' : 'rgba(255,255,255,0.08)'}
                  strokeWidth={isActive ? 0.8 : 0.4}
                  style={{ transition: 'all 0.3s ease', pathLength: edgePathLength, opacity: edgeOpacity }}
                />
              )
            })}
          </svg>

          {NODES.map((node, i) => (
            <GraphNode key={node.id} node={node} index={i} progress={progress} activeNode={activeNode} setActiveNode={setActiveNode} />
          ))}
        </div>

        <p className="text-editorial text-white/40 text-center mt-8" style={{ fontSize: '0.9rem' }}>
          {activeNode ? `${getNode(activeNode).label} is connected to all downstream stakeholders` : 'Hover any node to see connections'}
        </p>
      </div>
    </div>
  )
}
