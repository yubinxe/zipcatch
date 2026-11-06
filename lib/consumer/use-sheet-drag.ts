'use client'

import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'

export type SheetState = 'peek' | 'full'

/**
 * 바텀시트 끌기 — 손가락을 그대로 따라오고, 놓는 순간의 속도로 어디에 설지 정한다.
 * 0.4px/ms 넘게 튕겼으면 그 방향으로, 아니면 지금 속도로 0.2초 더 간 자리에서 가까운 쪽.
 * 남은 거리와 속도로 돌아가는 시간을 정해 손을 뗀 속도가 이어지게 한다.
 * 끝을 넘으면 1/3 저항, 6px 안의 움직임은 누르기(펼치기·접기)로 본다.
 * 넓은 화면(시트가 position:fixed 가 아닐 때)에서는 아무것도 하지 않는다.
 *
 * @param peekVisible 접혔을 때 보이는 높이(px)
 */
export function useSheetDrag(peekVisible = 140) {
  const panelRef = useRef<HTMLElement | null>(null)
  const [sheet, setSheet] = useState<SheetState>('peek')
  const drag = useRef<{ y0: number; base: number; peek: number; last: { y: number; t: number }[]; moved: boolean } | null>(null)

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      const el = panelRef.current
      if (!el || getComputedStyle(el).position !== 'fixed') return
      const peek = el.offsetHeight - peekVisible
      drag.current = { y0: e.clientY, base: sheet === 'full' ? 0 : peek, peek, last: [{ y: e.clientY, t: e.timeStamp }], moved: false }
      el.style.transition = 'none'
      e.currentTarget.setPointerCapture?.(e.pointerId)
    },
    [sheet, peekVisible],
  )

  const onPointerMove = useCallback((e: ReactPointerEvent<HTMLElement>) => {
    const d = drag.current
    const el = panelRef.current
    if (!d || !el) return
    const dy = e.clientY - d.y0
    if (Math.abs(dy) > 6) d.moved = true
    let off = d.base + dy
    if (off < 0) off /= 3
    if (off > d.peek) off = d.peek + (off - d.peek) / 3
    el.style.transform = `translateY(${off}px)`
    d.last.push({ y: e.clientY, t: e.timeStamp })
    if (d.last.length > 6) d.last.shift()
  }, [])

  const onPointerUp = useCallback((e: ReactPointerEvent<HTMLElement>) => {
    const d = drag.current
    const el = panelRef.current
    drag.current = null
    if (!d || !el) return
    if (!d.moved) {
      el.style.transition = ''
      el.style.transform = ''
      setSheet(v => (v === 'peek' ? 'full' : 'peek'))
      return
    }
    const a = d.last[0]
    const b = d.last[d.last.length - 1]
    const v = (b.y - a.y) / Math.max(1, b.t - a.t)
    const cur = Math.min(d.peek, Math.max(0, d.base + (e.clientY - d.y0)))
    const to: SheetState =
      Math.abs(v) > 0.4 ? (v < 0 ? 'full' : 'peek') : cur + v * 200 < d.peek / 2 ? 'full' : 'peek'
    const dist = Math.abs((to === 'full' ? 0 : d.peek) - cur)
    const ms = Math.round(Math.min(460, Math.max(200, dist / Math.max(0.6, Math.abs(v)))))
    el.style.transition = `transform ${ms}ms cubic-bezier(0.2, 0.9, 0.25, 1)`
    el.style.transform = ''
    setSheet(to)
    window.setTimeout(() => {
      if (panelRef.current && !drag.current) panelRef.current.style.transition = ''
    }, ms + 30)
  }, [])

  const onPointerCancel = useCallback(() => {
    drag.current = null
    if (panelRef.current) {
      panelRef.current.style.transition = ''
      panelRef.current.style.transform = ''
    }
  }, [])

  return { panelRef, sheet, setSheet, grip: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel } }
}
