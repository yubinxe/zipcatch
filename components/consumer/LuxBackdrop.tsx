'use client'

import { useEffect, useRef } from 'react'

/**
 * 지면 뒤에 깔리는 한 겹 — 도면과 빛.
 *
 * 흐린 색 덩어리는 쓰지 않는다. 따뜻한 종이 위에 번진 색은 빛이 아니라
 * 얼룩으로 읽힌다. 그래서 이 겹에는 blur 가 한 군데도 없다 —
 * 전부 날이 선 선과 면이다.
 *
 *   · 흰 물 한 겹으로 종이를 띄우고
 *   · 도면 모눈을 깔고
 *   · 창으로 든 빛줄기를 아주 느리게 지나가게 하고
 *   · 금박 호(弧) 두 개를 돌린다
 *
 * 움직이는 값은 CSS 변수 둘뿐이다(손끝 좌표·읽은 깊이). 나머지는
 * 스타일시트가 그린다 — 합성만 다시 하면 되는 일이다.
 */
export default function LuxBackdrop() {
  const hostRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const root = host.parentElement ?? document.body

    let pFrame = 0
    let px = 50
    let py = 24
    const paintPointer = () => {
      pFrame = 0
      root.style.setProperty('--lux-x', `${px}%`)
      root.style.setProperty('--lux-y', `${py}%`)
    }
    const onMove = (e: PointerEvent) => {
      px = (e.clientX / window.innerWidth) * 100
      py = (e.clientY / window.innerHeight) * 100
      if (!pFrame) pFrame = requestAnimationFrame(paintPointer)
    }

    let sFrame = 0
    const paintScroll = () => {
      sFrame = 0
      const max = document.documentElement.scrollHeight - window.innerHeight
      root.style.setProperty('--lux-depth', String(max > 0 ? Math.min(1, window.scrollY / max) : 0))
    }
    const onScroll = () => {
      if (!sFrame) sFrame = requestAnimationFrame(paintScroll)
    }

    paintScroll()
    /* 손가락으로 쓰는 화면에는 따라올 손끝이 없다 */
    if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
      window.addEventListener('pointermove', onMove, { passive: true })
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (pFrame) cancelAnimationFrame(pFrame)
      if (sFrame) cancelAnimationFrame(sFrame)
    }
  }, [])

  return (
    <div ref={hostRef} className="cs-backdrop" aria-hidden="true">
      <div className="cs-backdrop__wash" />
      <div className="cs-backdrop__plan" />
      <div className="cs-backdrop__shafts" />
      <div className="cs-backdrop__arcs">
        <i />
        <i />
      </div>
      <div className="cs-backdrop__spot" />
      <div className="cs-backdrop__frame" />
    </div>
  )
}
