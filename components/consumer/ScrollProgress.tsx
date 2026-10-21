'use client'

import { useEffect, useRef } from 'react'

/**
 * 읽은 만큼 차오르는 실선.
 *
 * 지면이 얼마나 남았는지 알려주는 가장 조용한 방법이다. 스크롤마다 상태를
 * 바꾸면 페이지 전체가 다시 그려지므로, 변하는 값은 CSS 변수 하나로만
 * 넘긴다 — 합성만 다시 하면 되는 일이다.
 */
export default function ScrollProgress() {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    let frame = 0
    const update = () => {
      frame = 0
      const max = document.documentElement.scrollHeight - window.innerHeight
      el.style.setProperty('--p', String(max > 0 ? Math.min(1, window.scrollY / max) : 0))
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }

    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [])

  return <div ref={ref} className="cs-lux-progress" aria-hidden="true" />
}
