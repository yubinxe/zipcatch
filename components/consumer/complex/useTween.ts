'use client'

import { useEffect, useRef, useState } from 'react'
import { PRESENTATION } from '@/lib/consumer/complex-visualization'

/** 숫자가 바뀔 때 지난 값에서 새 값으로 짧게 흘러간다(움직임 줄이기면 바로). 화면 읽기에는 최종값을 따로 준다 */
export function useTween(value: number | null, ms: number = PRESENTATION.numberMs): number | null {
  const [shown, setShown] = useState(value)
  const from = useRef(value)
  useEffect(() => {
    if (value === null) {
      from.current = null
      const id = requestAnimationFrame(() => setShown(null))
      return () => cancelAnimationFrame(id)
    }
    const start = from.current
    if (start === null || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      from.current = value
      const id = requestAnimationFrame(() => setShown(value))
      return () => cancelAnimationFrame(id)
    }
    let raf = 0
    const t0 = performance.now()
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / ms)
      const e = 1 - Math.pow(1 - p, 3)
      const v = start + (value - start) * e
      from.current = v
      setShown(v)
      if (p < 1) raf = requestAnimationFrame(tick)
      else from.current = value
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value, ms])
  return shown
}
