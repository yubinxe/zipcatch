'use client'

import { follow } from '@/lib/consumer/scroll-follow'
import { useLayoutEffect, useRef, type ReactNode } from 'react'

/**
 * 스크롤에 들어오면 올라오며 나타난다.
 *
 * 서버가 그린 HTML 은 이미 보이는 상태다. 숨기는 일은 화면에 칠해지기 전
 * (useLayoutEffect) 클라이언트에서만 한다 — 자바스크립트가 죽어도 내용이
 * 사라지지 않고, 켜져 있어도 깜빡이지 않는다.
 *
 * - 붙는 순간 이미 화면 안(또는 위)에 있는 것은 숨기지 않는다. 늦게 깨어난
 *   자바스크립트가 보이던 글을 지웠다가 다시 올리는 깜빡임을 막는다.
 * - 화면 위쪽을 아주 넓게 잡아 둔다. 빠르게 지나쳐 한 번도 화면에 걸리지 않은
 *   덩어리도 '지나갔다'로 세어 드러난다 — 끝까지 내렸는데 빈 자리가 남지 않게.
 * - 키보드로 안쪽에 들어오면 바로 드러난다.
 *
 * `scrub` 을 주면 화면을 지나는 정도를 CSS 변수로 적는다.
 *   --sp : 위 끝이 화면 바닥에 닿을 때 0 → 화면 위 30% 선에 닿을 때 1 (들어오는 정도)
 *   --sv : 화면에 들어올 때 0 → 완전히 나갈 때 1 (지나가는 정도)
 * 숫자는 화면 안에 있는 동안에만, 바뀔 때만 적는다. 렌더를 다시 돌리지 않는다.
 *
 * 상태를 두지 않고 DOM 속성을 직접 바꾼다. 렌더를 다시 돌릴 이유가 없는 일이다.
 * 움직임을 원치 않는 사용자에게는 아예 걸지 않는다(변수가 없으면 CSS 는 끝 상태).
 */

/* ── 공유 스크럽 — 화면 안에 들어온 것만 한 프레임에 한 번 잰다 ── */
const live = new Set<HTMLElement>()
const lastWritten = new WeakMap<HTMLElement, string>()
let frame = 0
let listening = false
/** 화면에 적힌 값 — 목표(스크롤 위치)를 공용 규칙으로 쫓는다(lib/consumer/scroll-follow) */
const shown = new WeakMap<HTMLElement, [number, number]>()
let prevT = 0

/** t 가 있으면 쫓고(프레임), 없으면 바로 붙인다(처음·화면 밖) */
function measure(t?: number) {
  frame = 0
  const vh = window.innerHeight || 1
  const dt = t !== undefined && prevT ? t - prevT : 0
  prevT = t ?? 0
  const reads: [HTMLElement, number, number][] = []
  let moving = false
  // 읽기를 먼저 모두 하고, 쓰기는 그 다음에 — 레이아웃을 번갈아 깨우지 않는다
  for (const el of live) {
    const r = el.getBoundingClientRect()
    const tsp = Math.min(1, Math.max(0, (vh - r.top) / (vh * 0.7)))
    const tsv = Math.min(1, Math.max(0, (vh - r.top) / (vh + r.height)))
    const was = shown.get(el)
    const sp = was && dt ? follow(was[0], tsp, dt) : tsp
    const sv = was && dt ? follow(was[1], tsv, dt) : tsv
    if (sp !== tsp || sv !== tsv) moving = true
    shown.set(el, [sp, sv])
    reads.push([el, sp, sv])
  }
  for (const [el, sp, sv] of reads) {
    const key = `${sp.toFixed(3)}|${sv.toFixed(3)}`
    if (lastWritten.get(el) === key) continue
    lastWritten.set(el, key)
    el.style.setProperty('--sp', sp.toFixed(3))
    el.style.setProperty('--sv', sv.toFixed(3))
  }
  // 아직 쫓는 중이면 다음 프레임에도 — 스크롤이 멈춰도 끝까지 닿는다
  if (moving) schedule()
  else prevT = 0
}

function schedule() {
  if (!frame) frame = requestAnimationFrame(measure)
}

function track(el: HTMLElement, on: boolean) {
  if (on) live.add(el)
  else live.delete(el)
  if (live.size && !listening) {
    listening = true
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule, { passive: true })
  } else if (!live.size && listening) {
    listening = false
    window.removeEventListener('scroll', schedule)
    window.removeEventListener('resize', schedule)
  }
  schedule()
}

export default function Reveal({
  children,
  /** 같은 줄에서 순서대로 올라오게 하는 지연(ms) */
  delay = 0,
  as: Tag = 'div',
  className,
  style,
  id,
  scrub = false,
}: {
  children: ReactNode
  delay?: number
  as?: 'div' | 'section' | 'li'
  className?: string
  style?: React.CSSProperties
  id?: string
  /** 화면을 지나는 정도를 --sp · --sv 로 적는다 */
  scrub?: boolean
}) {
  const ref = useRef<HTMLElement>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const cleanups: (() => void)[] = []

    // ── 등장 ──
    const vh = window.innerHeight
    const top = el.getBoundingClientRect().top
    if (top < vh * 0.9) {
      // 이미 보이는 자리(또는 지나친 자리) — 숨기지 않고 끝 상태로 둔다
      el.dataset.reveal = 'in'
    } else {
      el.dataset.reveal = 'out'
      if (delay) el.style.transitionDelay = `${delay}ms`
      const show = () => {
        el.dataset.reveal = 'in'
        io.disconnect()
        el.removeEventListener('focusin', show)
      }
      // 위쪽 여백을 크게 — 화면 위로 지나친 것도 '들어온 것'으로 센다
      const io = new IntersectionObserver(
        entries => {
          for (const e of entries) if (e.isIntersecting) show()
        },
        { rootMargin: '100000px 0px -10% 0px', threshold: 0 },
      )
      io.observe(el)
      el.addEventListener('focusin', show)
      cleanups.push(() => {
        io.disconnect()
        el.removeEventListener('focusin', show)
      })
    }

    // ── 스크럽 ── 화면 근처에 있을 때만 재는 목록에 올린다
    if (scrub) {
      const near = new IntersectionObserver(
        entries => {
          for (const e of entries) track(el, e.isIntersecting)
        },
        { rootMargin: '20% 0px 20% 0px' },
      )
      near.observe(el)
      // 처음 한 번은 위치와 무관하게 적어 둔다(지나친 자리면 1)
      live.add(el)
      measure()
      live.delete(el)
      cleanups.push(() => {
        near.disconnect()
        track(el, false)
      })
    }

    return () => {
      for (const c of cleanups) c()
    }
  }, [delay, scrub])

  return (
    <Tag ref={ref as never} id={id} className={className} style={style}>
      {children}
    </Tag>
  )
}
