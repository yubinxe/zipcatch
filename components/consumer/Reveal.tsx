'use client'

import { useLayoutEffect, useRef, type ReactNode } from 'react'

/**
 * 스크롤에 들어오면 올라오며 나타난다.
 *
 * 서버가 그린 HTML 은 이미 보이는 상태다. 숨기는 일은 화면에 칠해지기 전
 * (useLayoutEffect) 클라이언트에서만 한다 — 자바스크립트가 죽어도 내용이
 * 사라지지 않고, 켜져 있어도 깜빡이지 않는다.
 *
 * 상태를 두지 않고 DOM 속성을 직접 바꾼다. 렌더를 다시 돌릴 이유가 없는 일이다.
 * 움직임을 원치 않는 사용자에게는 아예 걸지 않는다.
 */
export default function Reveal({
  children,
  /** 같은 줄에서 순서대로 올라오게 하는 지연(ms) */
  delay = 0,
  as: Tag = 'div',
  className,
  style,
  id,
}: {
  children: ReactNode
  delay?: number
  as?: 'div' | 'section' | 'li'
  className?: string
  style?: React.CSSProperties
  id?: string
}) {
  const ref = useRef<HTMLElement>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    el.dataset.reveal = 'out'
    if (delay) el.style.transitionDelay = `${delay}ms`

    const io = new IntersectionObserver(
      entries => {
        for (const e of entries) {
          if (!e.isIntersecting) continue
          el.dataset.reveal = 'in'
          io.disconnect()
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.06 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [delay])

  return (
    <Tag ref={ref as never} id={id} className={className} style={style}>
      {children}
    </Tag>
  )
}
