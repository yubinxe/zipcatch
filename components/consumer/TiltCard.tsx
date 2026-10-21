'use client'

import { useEffect, useRef, type ReactNode } from 'react'

/**
 * 손끝을 따라 기우는 한 장.
 *
 * 마우스가 지나간 자리를 카드에 `--mx` · `--my` 로 넘겨 반사광이 따라붙게
 * 하고, 가운데에서 벗어난 만큼만 기울인다. 기울기를 크게 주면 카드가
 * 장난감처럼 보이므로 6도에서 멈춘다.
 *
 * 손가락으로 쓰는 화면과 움직임을 원치 않는 사용자에게는 아예 걸지 않는다 —
 * 터치에서는 기울일 손이 없고, 멀미를 겪는 사람에게는 장식이 해가 된다.
 */
export default function TiltCard({
  children,
  className,
  max = 6,
}: {
  children: ReactNode
  /** 감싸는 요소에 붙일 클래스 */
  className?: string
  /** 최대 기울기(도) */
  max?: number
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return

    let frame = 0

    const onMove = (e: PointerEvent) => {
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        const r = el.getBoundingClientRect()
        const px = (e.clientX - r.left) / r.width
        const py = (e.clientY - r.top) / r.height
        el.dataset.tilting = '1'
        el.style.transform = `rotateX(${(0.5 - py) * max * 2}deg) rotateY(${(px - 0.5) * max * 2}deg)`
        el.style.setProperty('--mx', `${px * 100}%`)
        el.style.setProperty('--my', `${py * 100}%`)
      })
    }

    const onLeave = () => {
      if (frame) cancelAnimationFrame(frame)
      frame = 0
      delete el.dataset.tilting
      el.style.transform = ''
    }

    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerleave', onLeave)
    return () => {
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerleave', onLeave)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [max])

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  )
}
