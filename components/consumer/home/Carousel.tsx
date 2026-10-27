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
      // 트랙 밖에서 단추를 놓았다면 pointerup 이 오지 않는다. 눌린 단추가 없으면 끝낸다
      if ((e.buttons & 1) === 0) return onUp()
      const dx = e.clientX - x0
      if (!moved && Math.abs(dx) > 6) {
        moved = true
        el.dataset.drag = 'true'
        el.setPointerCapture(e.pointerId)
      }
      if (moved) el.scrollLeft = s0 - dx
    }
    const onUp = () => {
      if (!down) return
      down = false
      if (!moved) return
      moved = false
      delete el.dataset.drag
      const swallow = (ev: MouseEvent) => {
        ev.preventDefault()
        ev.stopPropagation()
      }
      el.addEventListener('click', swallow, { capture: true, once: true })
      setTimeout(() => el.removeEventListener('click', swallow, { capture: true }), 0)
    }
    // 카드는 통째로 링크라, 끌면 브라우저가 링크 끌기를 시작하고 포인터를 거둬 간다
    const noNativeDrag = (e: DragEvent) => e.preventDefault()
    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointermove', onMove)
    el.addEventListener('dragstart', noNativeDrag, { capture: true })
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('dragstart', noNativeDrag, { capture: true })
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
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
          <button type="button" className="cs-carousel__btn" onClick={() => !edge.start && step(-1)} aria-disabled={edge.start} aria-label="이전 공고">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M15 6l-6 6 6 6" />
            </svg>
          </button>
          <button type="button" className="cs-carousel__btn" onClick={() => !edge.end && step(1)} aria-disabled={edge.end} aria-label="다음 공고">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 6l6 6-6 6" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}
