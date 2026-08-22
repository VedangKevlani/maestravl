'use client'
import { useState } from 'react'
import { motion, useTransform, MotionValue } from 'framer-motion'
import type { SceneProps } from '../ScrollStage'

// All coordinates in a 0-100 viewBox. Nodes are placed at these exact x,y.
const NODES = [
  { id: 'traveller', label: 'Traveller', x: 50, y: 8,  color: 'var(--status-blue, #6f9ad9)' },
  { id: 'flight',    label: 'Flight',    x: 50, y: 28, color: 'var(--amber, #e0aa4e)' },
  { id: 'driver',    label: 'Driver',    x: 22, y: 52, color: 'var(--accent, #8fc180)' },
  { id: 'hotel',     label: 'Hotel',     x: 50, y: 52, color: 'var(--accent, #8fc180)' },
  { id: 'excursion', label: 'Excursion', x: 78, y: 52, color: 'var(--accent, #8fc180)' },
  { id: 'restaurant',label: 'Restaurant',x: 32, y: 78, color: 'var(--accent, #8fc180)' },
  { id: 'ferry',     label: 'Ferry',     x: 68, y: 78, color: 'var(--accent, #8fc180)' },
]

const EDGES = [
  ['traveller', 'flight'],
  ['flight', 'driver'],
  ['flight', 'hotel'],
  ['flight', 'excursion'],
  ['hotel', 'restaurant'],
  ['excursion', 'ferry'],
]

// SVG dimensions (px) — used to convert % coords to pixel coords
const SVG_W = 340
const SVG_H = 340

function toSvgPx(pct: number, size: number) { return (pct / 100) * size }

function GraphNode({ node, index, progress, activeNode, setActiveNode }: {
  node: typeof NODES[0]; index: number; progress: MotionValue<number>
  activeNode: string | null; setActiveNode: (id: string | null) => void
}) {
  const start = 0.02 + index * 0.04
  const opacity = useTransform(progress, [start, start + 0.10], [0, 1])
  const scale  = useTransform(progress, [start, start + 0.10], [0, 1])
  const isActive = activeNode === node.id

  const cx = toSvgPx(node.x, SVG_W)
  const cy = toSvgPx(node.y, SVG_H)
  const r  = isActive ? 22 : 17

  return (
    <motion.g
      style={{ opacity, scale, transformOrigin: `${cx}px ${cy}px`, cursor: 'pointer' }}
      onMouseEnter={() => setActiveNode(node.id)}
      onMouseLeave={() => setActiveNode(null)}
      onClick={() => setActiveNode(isActive ? null : node.id)}
      role="button"
      aria-label={node.label}
    >
      {/* Glow ring when active */}
      {isActive && (
        <circle
          cx={cx} cy={cy} r={r + 8}
          fill="none"
          stroke={node.color}
          strokeWidth={1}
          opacity={0.3}
        />
      )}
      <circle
        cx={cx} cy={cy} r={r}
        fill={isActive ? node.color : `${node.color}28`}
        stroke={node.color}
        strokeWidth={1.5}
        style={{ transition: 'all 0.3s ease' }}
      />
      {isActive && (
        <circle cx={cx} cy={cy} r={4} fill="white" />
      )}
      <text
        x={cx} y={cy + r + 14}
        textAnchor="middle"
        fill="rgba(255,255,255,0.85)"
        fontSize={9.5}
        fontFamily="Manrope, sans-serif"
        fontWeight={600}
        letterSpacing={0.8}
        style={{ textTransform: 'uppercase', pointerEvents: 'none' }}
      >
        {node.label}
      </text>
    </motion.g>
  )
}

export default function Scene8Technology({ progress }: SceneProps) {
  const [activeNode, setActiveNode] = useState<string | null>(null)
  const edgeOpacity = useTransform(progress, [0.02, 0.12], [0, 1])

  const getNode = (id: string) => NODES.find(n => n.id === id)!

  return (
    <div className="absolute inset-0 overflow-hidden">
      <div className="absolute inset-0" style={{ background: 'linear-gradient(135deg, #0a0b0e 0%, #12151c 60%, #1b1812 100%)' }} />

      <div className="absolute inset-0 z-10 flex flex-col items-center justify-center px-6">
        <motion.p className="text-label text-white/40 mb-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6 }}>
          real-time coordination graph
        </motion.p>
        <motion.h2
          className="text-display text-center text-white mb-10"
          style={{ fontSize: 'clamp(2rem, 4vw, 3.5rem)', maxWidth: '24ch' }}
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1, duration: 0.6 }}
        >
          One intelligent layer.<br />
          <span style={{ color: 'var(--accent, #8fc180)' }}>Every stakeholder.</span>
        </motion.h2>

        {/* Unified SVG graph — nodes and edges share the same coordinate space */}
        <motion.svg
          width={SVG_W}
          height={SVG_H}
          viewBox={`0 0 ${SVG_W} ${SVG_H}`}
          style={{ overflow: 'visible', opacity: edgeOpacity }}
        >
          {/* Edges */}
          {EDGES.map(([from, to]) => {
            const f = getNode(from)
            const t = getNode(to)
            const isActive = activeNode === from || activeNode === to
            return (
              <line
                key={`${from}-${to}`}
                x1={toSvgPx(f.x, SVG_W)} y1={toSvgPx(f.y, SVG_H)}
                x2={toSvgPx(t.x, SVG_W)} y2={toSvgPx(t.y, SVG_H)}
                stroke={isActive ? '#4aa0d8' : 'rgba(255,255,255,0.1)'}
                strokeWidth={isActive ? 1.2 : 0.6}
                style={{ transition: 'all 0.3s ease' }}
              />
            )
          })}

          {/* Nodes — rendered after edges so they sit on top */}
          {NODES.map((node, i) => (
            <GraphNode
              key={node.id}
              node={node}
              index={i}
              progress={progress}
              activeNode={activeNode}
              setActiveNode={setActiveNode}
            />
          ))}
        </motion.svg>

        <p className="text-editorial text-white/40 text-center mt-6" style={{ fontSize: '0.88rem' }}>
          {activeNode
            ? `${getNode(activeNode).label} is connected to all downstream stakeholders`
            : 'Hover any node to see connections'}
        </p>
      </div>
    </div>
  )
}
