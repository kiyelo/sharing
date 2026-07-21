import { useCallback, useEffect, useRef, useState } from 'react'

const clamp = (value, min, max) => Math.max(min, Math.min(max, value))
const nearest = (positions, value) => {
  let best = 0
  for (let i = 1; i < positions.length; i += 1) {
    if (Math.abs(positions[i] - value) < Math.abs(positions[best] - value)) best = i
  }
  return best
}

export default function useFloatingQueue(count, initialIndex = count, options = {}) {
  const rowHeight = options.rowHeight || 80
  const positions = options.positions?.length === count + 1 ? options.positions : Array.from({ length: count + 1 }, (_, i) => i * rowHeight)
  const positionsRef = useRef(positions)
  positionsRef.current = positions
  const [index, setIndexState] = useState(() => clamp(initialIndex, 0, count))
  const [dragY, setDragY] = useState(0)
  const [dragging, setDragging] = useState(false)
  const indexRef = useRef(index)
  const activeRef = useRef(false)
  const pointerRef = useRef(null)
  const startYRef = useRef(0)
  const lastYRef = useRef(0)
  const lastTimeRef = useRef(0)
  const velocityRef = useRef(0)
  const dragRef = useRef(0)
  const wheelTimerRef = useRef(null)

  useEffect(() => { indexRef.current = index }, [index])
  useEffect(() => () => window.clearTimeout(wheelTimerRef.current), [])
  const notify = useCallback(() => {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') navigator.vibrate(8)
  }, [])
  const setIndex = useCallback((next) => {
    const value = clamp(typeof next === 'function' ? next(indexRef.current) : next, 0, count)
    if (value !== indexRef.current) {
      indexRef.current = value
      setIndexState(value)
      notify()
    }
  }, [count, notify])
  useEffect(() => { if (indexRef.current > count) setIndex(count) }, [count, setIndex])

  const onPointerDown = useCallback((event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    if (event.target.closest('button, input, textarea, a, label, [role="button"]')) return
    activeRef.current = true
    pointerRef.current = event.pointerId
    startYRef.current = event.clientY
    lastYRef.current = event.clientY
    lastTimeRef.current = performance.now()
    velocityRef.current = 0
    dragRef.current = 0
    setDragY(0)
    setDragging(true)
    try { event.currentTarget.setPointerCapture(event.pointerId) } catch {}
  }, [])
  const onPointerMove = useCallback((event) => {
    if (!activeRef.current || pointerRef.current !== event.pointerId) return
    const now = performance.now()
    const elapsed = Math.max(1, now - lastTimeRef.current)
    const delta = event.clientY - lastYRef.current
    velocityRef.current = delta / elapsed
    lastYRef.current = event.clientY
    lastTimeRef.current = now
    dragRef.current = event.clientY - startYRef.current
    setDragY(dragRef.current)
  }, [])
  const finishPointer = useCallback((event) => {
    if (!activeRef.current) return
    activeRef.current = false
    pointerRef.current = null
    const current = positionsRef.current[indexRef.current] || 0
    const projectedOffset = current - dragRef.current - velocityRef.current * 165
    setIndex(nearest(positionsRef.current, projectedOffset))
    dragRef.current = 0
    setDragY(0)
    setDragging(false)
    try { event?.currentTarget?.releasePointerCapture(event.pointerId) } catch {}
  }, [setIndex])
  const onWheel = useCallback((event) => {
    if (Math.abs(event.deltaY) < 2) return
    const limit = Math.max(rowHeight * 1.4, 100)
    dragRef.current = clamp(dragRef.current - event.deltaY, -limit, limit)
    setDragY(dragRef.current)
    setDragging(true)
    window.clearTimeout(wheelTimerRef.current)
    wheelTimerRef.current = window.setTimeout(() => {
      const current = positionsRef.current[indexRef.current] || 0
      setIndex(nearest(positionsRef.current, current - dragRef.current))
      dragRef.current = 0
      setDragY(0)
      setDragging(false)
    }, 95)
  }, [rowHeight, setIndex])
  const onKeyDown = useCallback((event) => {
    if (event.key === 'ArrowUp') { event.preventDefault(); setIndex(indexRef.current - 1) }
    if (event.key === 'ArrowDown') { event.preventDefault(); setIndex(indexRef.current + 1) }
    if (event.key === 'Home') { event.preventDefault(); setIndex(0) }
    if (event.key === 'End') { event.preventDefault(); setIndex(count) }
  }, [count, setIndex])

  return { index, dragY, dragging, setIndex, rowHeight, gestureProps: { onPointerDown, onPointerMove, onPointerUp: finishPointer, onPointerCancel: finishPointer, onWheel, onKeyDown, tabIndex: 0, 'aria-label': `삽입 위치 ${index + 1}` } }
}
