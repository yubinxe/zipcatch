'use client'

import { follow } from '@/lib/consumer/scroll-follow'
import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react'

/**
 * 스크롤로 넘기는 장면 하나.
 *
 * 바깥 상자는 화면보다 몇 배 길고, 안의 무대는 화면에 붙어(sticky) 있는다.
 * 바깥을 지나가는 만큼을 0→1 로 재서 무대에 `--p` 로 적는다. 무엇이 얼마나
 * 움직이는지는 전부 CSS 가 `--p` 로 계산한다 — 렌더를 다시 돌리지 않는다.
 *
 * 움직임을 원치 않으면 무대를 붙이지 않고 끝 장면(`--p: 1`)만 보여준다.
 */
export default function ScrollStage({
  children,
  /** 바깥 길이 — 화면 높이의 몇 배 동안 이 장면에 머무는지 */
  length = 3,
  className,
  stageClassName,
  label,
}: {
  children: ReactNode
  length?: number
  className?: string
  stageClassName?: string
  label?: string
}) {
  const outer = useRef<HTMLElement>(null)
  const stage = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = outer.current
    const st = stage.current
    if (!el || !st) return
    const still = window.matchMedia('(prefers-reduced-motion: reduce)')
    if (still.matches) {
      el.dataset.still = 'true'
      st.style.setProperty('--p', '1')
      return
    }

    /*
     * target 은 스크롤 위치로 잰 진행률, shown 은 화면에 적힌 값. shown 이 target 을 공용 규칙
     * (lib/consumer/scroll-follow)으로 쫓는다 — 휙 굴려도 장면이 한 프레임에 건너뛰지 않는다.
     */
    let raf = 0
    let target = 0
    let shown = -1
    let last = -1
    let prevT = 0
    const write = () => {
      // 소수 셋째 자리에서 끊어 같은 값이면 쓰지 않는다 — 스타일 재계산을 아낀다
      const q = Math.round(shown * 1000) / 1000
      if (q === last) return
      last = q
      st.style.setProperty('--p', String(q))
    }
    const read = () => {
      const r = el.getBoundingClientRect()
      const run = r.height - window.innerHeight
      target = run > 0 ? Math.min(1, Math.max(0, -r.top / run)) : 1
    }
    const step = (t: number) => {
      raf = 0
      read()
      const dt = prevT ? t - prevT : 16
      prevT = t
      shown = shown < 0 ? target : follow(shown, target, dt)
      write()
      if (shown !== target) raf = requestAnimationFrame(step)
      else prevT = 0
    }
    /** 화면 밖이거나 처음 — 쫓지 않고 바로 붙인다 */
    const measure = () => {
      read()
      shown = target
      prevT = 0
      write()
    }
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(step)
    }

    // 화면 근처에 있을 때만 스크롤을 듣는다
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          window.addEventListener('scroll', onScroll, { passive: true })
          window.addEventListener('resize', onScroll)
          onScroll()
        } else {
          window.removeEventListener('scroll', onScroll)
          window.removeEventListener('resize', onScroll)
          measure()
        }
      },
      { rootMargin: '20% 0px' },
    )
    io.observe(el)
    measure()
    return () => {
      io.disconnect()
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [])

  return (
    <section
      ref={outer}
      className={['cs-stage', className].filter(Boolean).join(' ')}
      style={{ '--len': length } as CSSProperties}
      aria-label={label}
    >
      <div ref={stage} className={['cs-stage__pin', stageClassName].filter(Boolean).join(' ')} style={{ '--p': 0 } as CSSProperties}>
        {children}
      </div>
    </section>
  )
}
