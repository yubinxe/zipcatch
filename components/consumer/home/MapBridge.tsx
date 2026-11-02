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
 * DOM 위치만 매 장면 계산하고(transform·opacity), React 는 다시 그리지 않는다.
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
    let cloned = ''

    const heroStage = () => document.querySelector<HTMLElement>('.cs-night .cs-atlas__stage')
    const heroMap = () => document.querySelector<SVGSVGElement>('.cs-night .cs-atlas__map')
    const scene = () => document.querySelector<HTMLElement>('.cs-scene--statement')
    const target = () => document.querySelector<HTMLElement>('.cs-scene--statement .cs-sm-relief')
    const sceneMap = () => document.querySelector<HTMLElement>('.cs-scene--statement .cs-scene__map')

    const rest = () => {
      if (!active) return
      active = false
      ghost.style.opacity = '0'
      ghost.style.visibility = 'hidden'
      const hs = heroStage()
      const sm = sceneMap()
      if (hs) hs.style.opacity = ''
      if (sm) sm.style.opacity = ''
    }

    const tick = () => {
      raf = 0
      const sc = scene()
      const from = heroMap()
      const to = target()
      if (!sc || !from || !to) return rest()
      const vh = window.innerHeight
      const top = sc.getBoundingClientRect().top
      // ONE MAP 이 화면 아래에서 들어와 위에 닿을 때까지(무대가 붙는 순간) 0 → 1
      const t = clamp01((vh - top) / vh)
      if (t <= 0 || t >= 1) return rest()
      // 복제본은 들어설 때마다 새로 — 첫 화면에서 고른 지역·농담 그대로
      const sig = from.innerHTML.length + ':' + (from.querySelector('[data-on]')?.getAttribute('d')?.length ?? 0)
      if (sig !== cloned) {
        cloned = sig
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
      active = true
      // 두 끝을 화면에 고정한다 — 출발은 '이어 붙이기가 시작된 순간'의 첫 화면 지도 자리,
      // 도착은 'ONE MAP 무대가 붙은 순간'의 자리. 그 사이 지면이 아래로 지나가도 지도는 한 획으로 옮겨 간다
      const scrolled = vh - top
      const a0 = from.getBoundingClientRect()
      const b0 = to.getBoundingClientRect()
      const a = { left: a0.left, top: a0.top + scrolled, width: a0.width, height: a0.height }
      const b = { left: b0.left, top: b0.top - top, width: b0.width, height: b0.height }
      const e = ease(t)
      const x = a.left + (b.left - a.left) * e
      const y = a.top + (b.top - a.top) * e
      const w = a.width + (b.width - a.width) * e
      const h = a.height + (b.height - a.height) * e
      ghost.style.visibility = 'visible'
      ghost.style.width = `${w.toFixed(1)}px`
      ghost.style.height = `${h.toFixed(1)}px`
      ghost.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`
      ghost.style.opacity = String(smooth(0, 0.1, t) * (1 - smooth(0.9, 1, t)))
      ghost.style.setProperty('--t', t.toFixed(3))
      const hs = heroStage()
      const sm = sceneMap()
      if (hs) hs.style.opacity = String(1 - smooth(0, 0.12, t))
      if (sm) sm.style.opacity = String(smooth(0.88, 1, t))
    }
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(tick)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    onScroll()
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (raf) cancelAnimationFrame(raf)
      rest()
    }
  }, [])

  return <div ref={ghostRef} className="op-bridge" aria-hidden="true" />
}
