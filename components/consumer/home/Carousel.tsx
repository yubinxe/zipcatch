'use client'

import { Children, useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

/**
 * 공고 캐러셀 — 화면 폭 안에서 완결되고, 천천히 저절로 넘어간다.
 *
 * 넘김의 바탕은 브라우저 스크롤 스냅이다(손가락·트랙패드·키보드가 그대로 통한다).
 * 그 위에 얹는 것:
 *  - 자동 넘김 — 6초 머문 뒤 한 장씩 850ms 동안. 끝에 닿으면 잠깐 어두워졌다가
 *    처음으로 돌아온다(열두 장을 거꾸로 감아 돌리는 모습은 보이지 않는다)
 *  - 멈춤 — 손이 닿아 있거나(올림·초점·끌기·터치), 화면 밖이거나, 탭이 숨었거나,
 *    움직임 줄이기를 켰거나, 멈춤 단추를 눌렀을 때. 손을 뗀 뒤 10초가 지나야 다시 간다
 *  - 위치 — "03 / 12" 와, 다음 장까지 남은 시간을 채우는 막대
 *
 * 예전에는 트랙을 화면 오른쪽 끝까지 흘려보냈다(음수 여백). 잘린 카드가 삐져나와
 * 보여 정돈되지 않았다 — 이제 트랙은 부모 폭을 넘지 않는다.
 *
 * 자동으로 넘어갈 때마다 화면 읽기 프로그램이 카드를 다시 읽지 않도록,
 * 위치 안내(aria-live)는 사람이 직접 넘겼을 때만 말한다.
 */

const DWELL_MS = 6000
const SLIDE_MS = 850
const RESUME_MS = 10000

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

export default function Carousel({ children, label }: { children: ReactNode; label: string }) {
  const count = Children.count(children)
  const root = useRef<HTMLDivElement>(null)
  const track = useRef<HTMLDivElement>(null)
  const [index, setIndex] = useState(0)
  const [perView, setPerView] = useState(1)
  const [paused, setPaused] = useState(false) // 사람이 멈춤 단추로 멈춘 것
  const [hold, setHold] = useState(false) // 손이 닿아 있어 잠시 멈춘 것
  const [still, setStill] = useState(false) // 움직임 줄이기
  const [seen, setSeen] = useState(false) // 화면 안에 있고 탭이 보이는지
  const [announce, setAnnounce] = useState(false)
  const [cycle, setCycle] = useState(0) // 진행 막대를 처음부터 다시 채우는 열쇠
  const anim = useRef(0)
  const touchedAt = useRef(0)

  const last = Math.max(0, count - perView)
  const running = !paused && !hold && !still && seen && count > perView

  /** 지금 몇 번째 카드가 맨 앞인지 — 스크롤 위치에서 읽는다 */
  const read = useCallback(() => {
    const el = track.current
    if (!el || !el.children.length) return
    const first = el.children[0] as HTMLElement
    const step = first.getBoundingClientRect().width + parseFloat(getComputedStyle(el).columnGap || '0')
    const i = step > 0 ? Math.round(el.scrollLeft / step) : 0
    setIndex(Math.max(0, Math.min(count - 1, i)))
    const pv = step > 0 ? Math.max(1, Math.round((el.clientWidth + 1) / step)) : 1
    setPerView(pv)
  }, [count])

  /** i 번째 카드로 부드럽게 옮긴다. 스냅은 옮기는 동안만 끈다 */
  const go = useCallback((i: number, how: 'auto' | 'user') => {
    const el = track.current
    if (!el || !el.children.length) return
    cancelAnimationFrame(anim.current)
    const target = el.children[Math.max(0, Math.min(el.children.length - 1, i))] as HTMLElement
    const dest = Math.max(0, Math.min(el.scrollWidth - el.clientWidth, target.offsetLeft - (el.children[0] as HTMLElement).offsetLeft))
    const from = el.scrollLeft
    if (Math.abs(dest - from) < 1) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      el.scrollLeft = dest
      return
    }
    el.dataset.moving = 'true'
    const t0 = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - t0) / SLIDE_MS)
      el.scrollLeft = from + (dest - from) * easeInOut(t)
      if (t < 1) anim.current = requestAnimationFrame(tick)
      else delete el.dataset.moving
    }
    anim.current = requestAnimationFrame(tick)
    if (how === 'user') setAnnounce(true)
  }, [])

  /** 손이 닿았다 — 자동 넘김을 쉬고, 손을 뗀 뒤 한참 있다가 다시 간다 */
  const touched = useCallback(() => {
    touchedAt.current = performance.now()
    setAnnounce(true)
  }, [])

  // 크기·스크롤 변화를 읽는다
  useEffect(() => {
    const el = track.current
    if (!el) return
    read()
    el.addEventListener('scroll', read, { passive: true })
    const ro = new ResizeObserver(read)
    ro.observe(el)
    return () => {
      el.removeEventListener('scroll', read)
      ro.disconnect()
    }
  }, [read, children])

  // 움직임 줄이기
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const on = () => setStill(mq.matches)
    on()
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])

  // 화면 안에 있고 탭이 보일 때만 넘긴다
  useEffect(() => {
    const el = root.current
    if (!el) return
    let inView = false
    const update = () => setSeen(inView && !document.hidden)
    const io = new IntersectionObserver(([e]) => {
      inView = e.isIntersecting
      update()
    }, { threshold: 0.35 })
    io.observe(el)
    document.addEventListener('visibilitychange', update)
    return () => {
      io.disconnect()
      document.removeEventListener('visibilitychange', update)
    }
  }, [])

  // 손이 닿아 있는 동안(올림·초점·누름) — 멈춘다
  useEffect(() => {
    const el = root.current
    if (!el) return
    let over = false
    let focus = false
    let down = false
    const set = () => setHold(over || focus || down)
    const enter = () => { over = true; set() }
    const leave = () => { over = false; set() }
    const fin = () => { focus = el.contains(document.activeElement) && el.matches(':focus-within'); set() }
    const pd = () => { down = true; touched(); set() }
    const pu = () => { if (!down) return; down = false; touchedAt.current = performance.now(); set() }
    el.addEventListener('pointerenter', enter)
    el.addEventListener('pointerleave', leave)
    el.addEventListener('focusin', fin)
    el.addEventListener('focusout', () => setTimeout(fin, 0))
    el.addEventListener('pointerdown', pd)
    window.addEventListener('pointerup', pu)
    window.addEventListener('pointercancel', pu)
    // 트랙패드 가로 밀기·키보드 화살표도 사람의 손이다
    const tr = track.current
    const wheel = (e: WheelEvent) => { if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) touched() }
    const key = (e: KeyboardEvent) => { if (e.key.startsWith('Arrow') || e.key === 'Home' || e.key === 'End') touched() }
    tr?.addEventListener('wheel', wheel, { passive: true })
    tr?.addEventListener('keydown', key)
    return () => {
      el.removeEventListener('pointerenter', enter)
      el.removeEventListener('pointerleave', leave)
      el.removeEventListener('focusin', fin)
      el.removeEventListener('pointerdown', pd)
      window.removeEventListener('pointerup', pu)
      window.removeEventListener('pointercancel', pu)
      tr?.removeEventListener('wheel', wheel)
      tr?.removeEventListener('keydown', key)
    }
  }, [touched])

  // 자동 넘김 — 한 장에 6초. 손을 댄 직후 10초는 쉰다. 끝에 닿으면 어두워졌다 처음으로
  useEffect(() => {
    if (!running) return
    const since = performance.now() - touchedAt.current
    const wait = Math.max(DWELL_MS, RESUME_MS - since)
    const t = setTimeout(() => {
      const el = track.current
      if (!el) return
      setAnnounce(false)
      if (index >= last) {
        el.dataset.rewind = 'true'
        setTimeout(() => {
          el.scrollLeft = 0
          requestAnimationFrame(() => delete el.dataset.rewind)
        }, 320)
      } else {
        go(index + 1, 'auto')
      }
      setCycle(c => c + 1)
    }, wait)
    return () => clearTimeout(t)
  }, [running, index, last, go, cycle])

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
      cancelAnimationFrame(anim.current)
      down = true
      moved = false
      x0 = e.clientX
      s0 = el.scrollLeft
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
    const onMove = (e: PointerEvent) => {
      if (!down) return
      if ((e.buttons & 1) === 0) return onUp()
      const dx = e.clientX - x0
      if (!moved && Math.abs(dx) > 6) {
        moved = true
        el.dataset.drag = 'true'
      }
      if (moved) el.scrollLeft = s0 - dx
    }
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

  useEffect(() => () => cancelAnimationFrame(anim.current), [])

  const pages = Math.max(1, last + 1)
  const page = Math.min(index, last)
  const pad = (n: number) => String(n).padStart(2, '0')

  return (
    <div
      ref={root}
      className="cs-carousel"
      role="region"
      aria-roledescription="캐러셀"
      aria-label={label}
      data-running={running || undefined}
    >
      <div ref={track} className="cs-carousel__track" tabIndex={0} aria-label={`${label} 목록 — 좌우 화살표로 넘깁니다`}>
        {children}
      </div>

      <div className="cs-carousel__bar">
        <span className="cs-carousel__count cs-num" aria-hidden="true">
          <b>{pad(page + 1)}</b> / {pad(pages)}
        </span>
        <div className="cs-carousel__progress" aria-hidden="true">
          <i style={{ transform: `scaleX(${pages > 1 ? (page + 1) / pages : 1})` }} />
          {running && <em key={`${cycle}-${index}`} className="cs-carousel__timer" style={{ animationDuration: `${DWELL_MS}ms` }} />}
        </div>
        <div className="cs-carousel__nav">
          <button
            type="button"
            className="cs-carousel__btn cs-carousel__btn--play"
            onClick={() => {
              setPaused(p => !p)
              touched()
            }}
            aria-pressed={paused || still}
            aria-label={paused || still ? '자동 넘김 다시 시작' : '자동 넘김 멈춤'}
            disabled={still}
            title={still ? '움직임 줄이기 설정으로 자동 넘김이 꺼져 있어요' : undefined}
          >
            {paused || still ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 5.5v13a1 1 0 0 0 1.5.86l11-6.5a1 1 0 0 0 0-1.72l-11-6.5A1 1 0 0 0 7 5.5Z" /></svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1.2" /><rect x="14" y="5" width="4" height="14" rx="1.2" /></svg>
            )}
          </button>
          <button
            type="button"
            className="cs-carousel__btn"
            onClick={() => {
              touched()
              go(page <= 0 ? last : page - 1, 'user')
            }}
            aria-label="이전 공고"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
          </button>
          <button
            type="button"
            className="cs-carousel__btn"
            onClick={() => {
              touched()
              go(page >= last ? 0 : page + 1, 'user')
            }}
            aria-label="다음 공고"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
          </button>
        </div>
      </div>

      <p className="cs-sr" aria-live={announce ? 'polite' : 'off'} aria-atomic="true">
        {count}건 중 {page + 1}번째부터 보는 중
      </p>
    </div>
  )
}
