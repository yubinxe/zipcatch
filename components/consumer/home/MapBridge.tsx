'use client'

import { useEffect, useRef } from 'react'

/**
 * HERO → ONE MAP 이어 붙이기(매치 컷).
 *
 * 두 지도는 다른 무대·다른 좌표계다(첫 화면 = 카드 속 지구본 구도, ONE MAP = 내려다본 평면에서 눕는 지도).
 * 하나의 카메라가 날아가는 척하지 않는다. 대신 두 지도가 같은 틀(KOREA_VISUAL_VIEWBOX)을 쓰는 점을 이용해,
 * 첫 화면 평면 지도의 복제본을 화면 위 한 겹으로 들고 — 스크롤만큼 — ONE MAP 첫 장면(바로 위에서 본 평면)의
 * 자리·크기로 옮긴다. 양 끝에서 짧게 겹쳐 사라지고(0~10%, 90~100%), 그 사이 원래 두 지도는 비켜 둔다.
 *
 * 스크롤이 곧 진행이다 — 거꾸로 올리면 거꾸로 돌아간다. 움직임 줄이기에서는 하지 않는다.
 * DOM 위치만 매 장면 계산하고(transform·opacity), React 는 다시 그리지 않는다. 자리는 들어설 때만 잰다.
 */
const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a))
  return t * t * (3 - 2 * t)
}
const ease = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2)

export default function MapBridge() {
  const ghostRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // 움직임 줄이기, 그리고 좁은 화면(ONE MAP 지도가 글 뒤 배경으로 물러나는 구도)에서는 잇지 않는다
    if (window.matchMedia('(prefers-reduced-motion: reduce), (max-width: 760px)').matches) return
    const ghost = ghostRef.current
    if (!ghost) return
    let raf = 0
    let active = false
    // 쉬는 동안 장면 위 끝(문서 좌표) — 화면에서 멀면 위치도 재지 않는다
    let sceneTopHint = Number.NaN

    const heroStage = () => document.querySelector<HTMLElement>('.cs-night .cs-atlas__stage')
    const heroMap = () => document.querySelector<SVGSVGElement>('.cs-night .cs-atlas__map')
    const scene = () => document.querySelector<HTMLElement>('.cs-scene--statement')
    const target = () => document.querySelector<HTMLElement>('.cs-scene--statement .cs-sm-relief')
    const sceneMap = () => document.querySelector<HTMLElement>('.cs-scene--statement .cs-scene__map')

    /*
     * 매 장면 하는 일을 줄였다(측정: 1440 폭·4배 감속에서 이 구간 스크롤).
     *  - 복제 여부는 첫 화면 지도의 변화를 MutationObserver 로 받아 둔다. 예전에는 장면마다 innerHTML 을
     *    문자열로 풀어 길이를 쟀다 — 지도 경로 전체를 직렬화하는 일이었다.
     *  - 두 끝의 자리는 들어설 때·크기가 바뀔 때만 잰다. 장면마다는 scrollY 만 읽는다(레이아웃 강제 없음).
     *  - 크기는 width/height 대신 scale 로 — 레이아웃 없이 합성만.
     */
    let dirty = true
    let geo: { sceneTop: number; a: { left: number; top: number; width: number; height: number }; b: { left: number; top: number; width: number; height: number } } | null = null
    const mo = new MutationObserver(() => {
      dirty = true
    })
    let watched: Element | null = null
    const watch = (el: Element) => {
      if (watched === el) return
      mo.disconnect()
      mo.observe(el, { subtree: true, childList: true, attributes: true, attributeFilter: ['d', 'data-on', 'class', 'style', 'fill'] })
      watched = el
      dirty = true
    }

    const measure = (from: SVGSVGElement, to: HTMLElement, sc: HTMLElement) => {
      const vh = window.innerHeight
      const sy = window.scrollY
      const s0 = sc.getBoundingClientRect()
      const a0 = from.getBoundingClientRect()
      const b0 = to.getBoundingClientRect()
      const sceneTop = s0.top + sy
      // 두 끝을 화면에 고정한다 — 출발은 '이어 붙이기가 시작된 순간'(장면 위 끝 = 화면 아래)의 첫 화면 지도 자리,
      // 도착은 'ONE MAP 무대가 붙은 순간'(장면 위 끝 = 화면 위)의 자리. 그 사이 지면이 지나가도 지도는 한 획으로 옮겨 간다
      geo = {
        sceneTop,
        a: { left: a0.left, top: a0.top + sy - (sceneTop - vh), width: a0.width, height: a0.height },
        b: { left: b0.left, top: b0.top + sy - sceneTop, width: b0.width, height: b0.height },
      }
      // 큰 쪽 크기로 한 번 깔고 줄여 쓴다 — 줄이는 쪽 래스터라 흐려지지 않는다
      ghost.style.width = `${Math.max(geo.a.width, geo.b.width).toFixed(1)}px`
      ghost.style.height = `${Math.max(geo.a.height, geo.b.height).toFixed(1)}px`
    }

    const rest = () => {
      if (!active) return
      active = false
      geo = null
      ghost.style.opacity = '0'
      ghost.style.visibility = 'hidden'
      const hs = heroStage()
      const sm = sceneMap()
      if (hs) hs.style.opacity = ''
      if (sm) sm.style.opacity = ''
    }

    const tick = () => {
      raf = 0
      const vh = window.innerHeight
      const sy = window.scrollY
      // 쉬는 동안에는 장면 위치만 — 들어설 때 한 번 잰다
      let sc: HTMLElement | null = null
      if (!geo) {
        sc = scene()
        if (!sc) return rest()
        const top = sc.getBoundingClientRect().top
        const t0 = (vh - top) / vh
        if (t0 <= 0 || t0 >= 1) {
          sceneTopHint = top + sy
          return rest()
        }
      }
      if (geo == null) {
        const from = heroMap()
        const to = target()
        if (!sc || !from || !to) return rest()
        watch(from)
        measure(from, to, sc)
        if (dirty) {
          dirty = false
          const svg = from.cloneNode(true) as SVGSVGElement
          // 첫 화면의 칠을 그대로 — 색은 첫 화면 칸의 변수에서 오므로 계산된 값을 옮겨 적는다
          const src = from.querySelectorAll<SVGElement>('path, circle')
          svg.querySelectorAll<SVGElement>('path, circle').forEach((el, i) => {
            const cs = getComputedStyle(src[i])
            el.setAttribute('style', `fill:${cs.fill};fill-opacity:${cs.fillOpacity};stroke:${cs.stroke};stroke-width:${cs.strokeWidth}`)
            el.removeAttribute('class')
          })
          svg.removeAttribute('class')
          svg.setAttribute('aria-hidden', 'true')
          ghost.replaceChildren(svg)
        }
      }
      const g = geo!
      // ONE MAP 이 화면 아래에서 들어와 위에 닿을 때까지(무대가 붙는 순간) 0 → 1 — 잰 자리와 scrollY 로만
      const t = clamp01((vh - (g.sceneTop - sy)) / vh)
      if (t <= 0 || t >= 1) return rest()
      active = true
      const e = ease(t)
      const x = g.a.left + (g.b.left - g.a.left) * e
      const y = g.a.top + (g.b.top - g.a.top) * e
      const w = g.a.width + (g.b.width - g.a.width) * e
      const h = g.a.height + (g.b.height - g.a.height) * e
      const W = Math.max(g.a.width, g.b.width)
      const H = Math.max(g.a.height, g.b.height)
      ghost.style.visibility = 'visible'
      ghost.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) scale(${(w / W).toFixed(4)}, ${(h / H).toFixed(4)})`
      ghost.style.opacity = String(smooth(0, 0.1, t) * (1 - smooth(0.9, 1, t)))
      ghost.style.setProperty('--t', t.toFixed(3))
      const hs = heroStage()
      const sm = sceneMap()
      if (hs) hs.style.opacity = String(1 - smooth(0, 0.12, t))
      if (sm) sm.style.opacity = String(smooth(0.88, 1, t))
    }
    const onScroll = () => {
      // 이어 붙이기 구간에서 화면 한 장 이상 떨어져 있고 진행 중도 아니면 아무것도 하지 않는다
      if (!active && Number.isFinite(sceneTopHint)) {
        const d = sceneTopHint - window.scrollY
        if (d > window.innerHeight * 2.2 || d < -window.innerHeight) return
      }
      if (!raf) raf = requestAnimationFrame(tick)
    }
    const onResize = () => {
      geo = null
      sceneTopHint = Number.NaN
      onScroll()
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onResize)
    onScroll()
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onResize)
      mo.disconnect()
      if (raf) cancelAnimationFrame(raf)
      rest()
    }
  }, [])

  return <div ref={ghostRef} className="op-bridge" aria-hidden="true" />
}
