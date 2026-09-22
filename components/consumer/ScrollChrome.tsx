'use client'

import { useEffect } from 'react'

/**
 * 스크롤에 따라붙는 것들 — 진행선과 헤더 그림자.
 *
 * 상태를 두지 않고 DOM 속성만 바꾼다. 스크롤마다 리렌더를 돌리면
 * 카드 수십 장이 함께 다시 그려져 오히려 끊긴다.
 * 읽기는 rAF 안에서 한 번만 하고(레이아웃 강제 계산을 스크롤마다 하지 않는다),
 * 움직임을 원치 않는 사용자에게는 아예 걸지 않는다.
 */
export default function ScrollChrome() {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const bar = document.createElement('div')
    bar.className = 'cs-progress'
    bar.setAttribute('aria-hidden', 'true')
    bar.dataset.idle = 'true'
    document.body.appendChild(bar)

    const header = document.querySelector<HTMLElement>('.cs-header')
    let ticking = false

    const measure = () => {
      ticking = false
      const doc = document.documentElement
      const max = doc.scrollHeight - window.innerHeight
      const y = window.scrollY

      // 스크롤할 것이 거의 없는 화면에서는 진행선을 띄우지 않는다.
      // 늘 꽉 차 있는 막대는 아무것도 알려주지 않는다.
      if (max < 240) {
        bar.dataset.idle = 'true'
      } else {
        bar.dataset.idle = y < 8 ? 'true' : 'false'
        bar.style.setProperty('--p', String(Math.min(1, Math.max(0, y / max))))
      }
      if (header) header.dataset.scrolled = y > 4 ? 'true' : 'false'
    }

    const onScroll = () => {
      if (ticking) return
      ticking = true
      requestAnimationFrame(measure)
    }

    measure()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll, { passive: true })

    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      bar.remove()
      if (header) delete header.dataset.scrolled
    }
  }, [])

  return null
}
