'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

/**
 * 옆으로 넘기는 띠.
 *
 * 넘김은 브라우저의 스크롤 스냅에 맡긴다 — 손가락·트랙패드·키보드가 그대로
 * 통한다. 여기서 더하는 것은 셋뿐이다: 앞뒤 단추, 마우스로 끌기, 진행 막대.
 */
export default function Carousel({ children, label }: { children: ReactNode; label: string }) {
  const track = useRef<HTMLDivElement>(null)
  const [edge, setEdge] = useState({ start: true, end: false, p: 0 })

  const sync = useCallback(() => {
    const el = track.current
    if (!el) return
    const max = el.scrollWidth - el.clientWidth
    setEdge({ start: el.scrollLeft < 4, end: el.scrollLeft > max - 4, p: max > 0 ? el.scrollLeft / max : 1 })
  }, [])

  useEffect(() => {
    const el = track.current
    if (!el) return
    sync()
    el.addEventListener('scroll', sync, { passive: true })
    const ro = new ResizeObserver(sync)
    ro.observe(el)
    return () => {
      el.removeEventListener('scroll', sync)
      ro.disconnect()
    }
  }, [sync, children])

  const step = (dir: 1 | -1) => {
    const el = track.current
    if (!el) return
    const card = el.firstElementChild as HTMLElement | null
    const w = card ? card.getBoundingClientRect().width + 20 : el.clientWidth * 0.8
    el.scrollBy({ left: dir * w, behavior: 'smooth' })
  }

  // 마우스로 끌기. 끌다 놓은 자리에서 카드 링크가 눌리지 않도록 클릭을 한 번 삼킨다
  useEffect(() => {
    const el = track.current
    if (!el) return
    let x0 = 0
    let s0 = 0
    let moved = false
    let down = false
    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' || e.button !== 0) return
      down = true
      moved = false
      x0 = e.clientX
      s0 = el.scrollLeft
    }
    const onMove = (e: PointerEvent) => {
      if (!down) return
      const dx = e.clientX - x0
      if (!moved && Math.abs(dx) > 6) {
        moved = true
        el.dataset.drag = 'true'
        el.setPointerCapture(e.pointerId)
      }
      if (moved) el.scrollLeft = s0 - dx
    }
    const onUp = () => {
      down = false
      if (!moved) return
      delete el.dataset.drag
      const swallow = (ev: MouseEvent) => {
        ev.preventDefault()
        ev.stopPropagation()
      }
      el.addEventListener('click', swallow, { capture: true, once: true })
      setTimeout(() => el.removeEventListener('click', swallow, { capture: true }), 0)
    }
    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onUp)
    el.addEventListener('pointercancel', onUp)
    return () => {
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp)
      el.removeEventListener('pointercancel', onUp)
    }
  }, [])

  return (
    <div className="cs-carousel">
      <div ref={track} className="cs-carousel__track" role="region" aria-label={label} tabIndex={0}>
        {children}
      </div>
      <div className="cs-carousel__bar">
        <div className="cs-carousel__progress" aria-hidden="true">
          <i style={{ transform: `scaleX(${Math.max(0.08, edge.p)})` }} />
        </div>
        <div className="cs-carousel__nav">
          <button type="button" className="cs-carousel__btn" onClick={() => step(-1)} disabled={edge.start} aria-label="이전 공고">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M15 6l-6 6 6 6" />
            </svg>
          </button>
          <button type="button" className="cs-carousel__btn" onClick={() => step(1)} disabled={edge.end} aria-label="다음 공고">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 6l6 6-6 6" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}
