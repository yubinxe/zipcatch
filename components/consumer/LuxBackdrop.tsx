'use client'

import { useEffect, useRef } from 'react'

/**
 * 지면 뒤에 깔리는 한 겹.
 *
 * 내용은 손대지 않는다. 뒤에서만 움직인다 — 느린 빛, 떠다니는 금박 가루,
 * 손끝을 따라오는 한 점의 조명. 글을 읽는 동안 눈이 쉴 곳을 만들고,
 * 읽지 않는 동안에도 화면이 살아 있게 한다.
 *
 * 빛과 격자는 CSS 가 그린다(합성만 하면 되는 일이다). 가루만 캔버스를 쓴다 —
 * 수십 개를 각자 다른 속도로 띄우는 일은 DOM 으로 하면 레이어가 수십 장이
 * 된다.
 *
 * 움직임을 원치 않는 사용자에게는 캔버스를 아예 띄우지 않고, CSS 쪽도
 * 스타일시트에서 멈춘다. 탭이 숨으면 루프를 세운다 — 보이지도 않는 그림에
 * 배터리를 쓰지 않는다.
 */
export default function LuxBackdrop() {
  const hostRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  /* 손끝을 따라오는 조명 + 읽은 깊이에 따른 색 온도 */
  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const root = host.parentElement ?? document.body

    let frame = 0
    let px = 50
    let py = 30

    const paint = () => {
      frame = 0
      root.style.setProperty('--lux-x', `${px}%`)
      root.style.setProperty('--lux-y', `${py}%`)
    }
    const onMove = (e: PointerEvent) => {
      px = (e.clientX / window.innerWidth) * 100
      py = (e.clientY / window.innerHeight) * 100
      if (!frame) frame = requestAnimationFrame(paint)
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
    const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches
    if (fine) window.addEventListener('pointermove', onMove, { passive: true })
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (frame) cancelAnimationFrame(frame)
      if (sFrame) cancelAnimationFrame(sFrame)
    }
  }, [])

  /* 금박 가루 */
  useEffect(() => {
    const cv = canvasRef.current
    if (!cv) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const ctx = cv.getContext('2d', { alpha: true })
    if (!ctx) return

    /* 고해상도 화면에서 2배를 넘겨 그리면 칠할 점이 네 배가 된다.
       가루는 흐릿한 점이라 그 차이가 보이지 않는다 — 2 에서 끊는다. */
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    let w = 0
    let h = 0
    let motes: {
      x: number
      y: number
      r: number
      vy: number
      drift: number
      phase: number
      a: number
      gold: boolean
    }[] = []

    const seed = () => {
      w = window.innerWidth
      h = window.innerHeight
      cv.width = Math.round(w * dpr)
      cv.height = Math.round(h * dpr)
      cv.style.width = `${w}px`
      cv.style.height = `${h}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      /* 넓은 화면일수록 몇 알 더. 좁은 화면에 같은 수를 뿌리면 빽빽해진다 */
      const n = Math.round(Math.min(54, Math.max(18, (w * h) / 26000)))
      motes = Array.from({ length: n }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        r: 0.7 + Math.random() * 1.9,
        vy: 0.05 + Math.random() * 0.22,
        drift: 6 + Math.random() * 22,
        phase: Math.random() * Math.PI * 2,
        a: 0.18 + Math.random() * 0.42,
        /* 열에 하나쯤만 주묵. 전부 금박이면 금가루가 아니라 눈이 된다 */
        gold: Math.random() > 0.12,
      }))
    }

    /* 가루 한 알을 미리 한 번만 그려 두고 매 프레임 그 그림을 찍는다.
       프레임마다 그라디언트를 새로 만들면 알 수만큼 곱해져, 손에 쥔
       구형 기기에서 그 비용이 먼저 드러난다. */
    const sprite = (rgb: string) => {
      const S = 64
      const c = document.createElement('canvas')
      c.width = S
      c.height = S
      const cc = c.getContext('2d')!
      const g = cc.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2)
      g.addColorStop(0, `rgba(${rgb},1)`)
      g.addColorStop(1, `rgba(${rgb},0)`)
      cc.fillStyle = g
      cc.fillRect(0, 0, S, S)
      return c
    }
    const sprites = { gold: sprite('186,150,86'), ink: sprite('168,58,32') }

    let raf = 0
    let t = 0
    let last = 0
    /* 아주 느린 그림이라 30fps 로 충분하다. 60 으로 돌리면 일만 두 배다 */
    const STEP = 1000 / 30

    const draw = (now: number) => {
      raf = requestAnimationFrame(draw)
      if (now - last < STEP) return
      last = now

      t += 0.018
      ctx.clearRect(0, 0, w, h)
      for (const m of motes) {
        m.y -= m.vy
        if (m.y < -8) {
          m.y = h + 8
          m.x = Math.random() * w
        }
        const x = m.x + Math.sin(t * 1.6 + m.phase) * m.drift
        /* 숨 쉬듯 밝기가 오르내려야 '떠 있다'고 읽힌다 */
        ctx.globalAlpha = m.a * (0.55 + 0.45 * Math.sin(t * 2.3 + m.phase))
        const d = m.r * 8
        ctx.drawImage(m.gold ? sprites.gold : sprites.ink, x - d / 2, m.y - d / 2, d, d)
      }
      ctx.globalAlpha = 1
    }

    const start = () => {
      if (!raf) raf = requestAnimationFrame(draw)
    }
    const stop = () => {
      if (raf) cancelAnimationFrame(raf)
      raf = 0
    }
    const onVis = () => (document.hidden ? stop() : start())

    seed()
    start()
    window.addEventListener('resize', seed)
    document.addEventListener('visibilitychange', onVis)
    return () => {
      stop()
      window.removeEventListener('resize', seed)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [])

  return (
    <div ref={hostRef} className="cs-backdrop" aria-hidden="true">
      <div className="cs-backdrop__aura" />
      <div className="cs-backdrop__lattice" />
      <div className="cs-backdrop__sweep" />
      <canvas ref={canvasRef} className="cs-backdrop__motes" />
      <div className="cs-backdrop__spot" />
      <div className="cs-backdrop__frame" />
    </div>
  )
}
