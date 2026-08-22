'use client'
// Pointer-based dragging for the chat popup's header handle. Starts
// undragged (CSS default bottom/right positioning applies); once the user
// drags, position switches to an explicit top/left pair clamped to the
// viewport so the popup can't be dragged off-screen.
import { useRef, useState } from 'react'

export interface DragPosition {
  top: number
  left: number
}

export function useDraggable(popupRef: React.RefObject<HTMLElement | null>) {
  const [position, setPosition] = useState<DragPosition | null>(null)
  const dragOffset = useRef({ x: 0, y: 0 })
  const draggingRef = useRef(false)

  function clamp(top: number, left: number): DragPosition {
    const el = popupRef.current
    const width = el?.offsetWidth ?? 340
    const height = el?.offsetHeight ?? 400
    const maxLeft = window.innerWidth - width - 8
    const maxTop = window.innerHeight - height - 8
    return {
      left: Math.min(Math.max(left, 8), Math.max(maxLeft, 8)),
      top: Math.min(Math.max(top, 8), Math.max(maxTop, 8)),
    }
  }

  function onPointerDown(e: React.PointerEvent) {
    const el = popupRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    dragOffset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top }
    draggingRef.current = true
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!draggingRef.current) return
    setPosition(clamp(e.clientY - dragOffset.current.y, e.clientX - dragOffset.current.x))
  }

  function onPointerUp(e: React.PointerEvent) {
    draggingRef.current = false
    ;(e.target as HTMLElement).releasePointerCapture(e.pointerId)
  }

  return { position, dragHandleProps: { onPointerDown, onPointerMove, onPointerUp } }
}
