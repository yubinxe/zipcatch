'use client'

import { useEffect, type RefObject } from 'react'

/**
 * 손끝을 따라 무대가 아주 조금 돈다.
 *
 * 무대(ref)에 `--yaw`(좌우, 도) · `--pitch`(위아래, 도)를 넘긴다. CSS 가 그 값으로
 * 세계를 돌린다 — 바뀌는 것은 transform 하나라 배치도 칠도 다시 하지 않는다.
 *
 * - 재는 자리는 `listen`(무대를 품은 머리)의 높이 띠. 무대 자체는 손이 닿지 않는 장식이다
 * - 손을 바로 따라가면 화면이 손떨림을 그대로 옮긴다. 목표값만 바꾸고, 프레임마다
 *   그쪽으로 조금씩 다가간다(감쇠). 다 닿으면 프레임 요청을 멈춘다
 * - 화면 밖으로 나가면 듣지 않는다. 바닥이 흐르는 애니메이션도 멈춘다(`data-idle`)
 * - 손가락으로 쓰는 화면, 움직임을 줄인 사용자에게는 걸지 않는다 — 무대는 그대로 선다
 */
export function useStageParallax(
  ref: RefObject<HTMLElement | null>,
  { listen, yaw = 3.2, pitch = 1.6 }: { listen?: string; yaw?: number; pitch?: number } = {},
) {
  useEffect(() => {
    const stage = ref.current
    if (!stage) return

    // 화면에 없을 때는 흐르는 바닥까지 세운다 — 보이지 않는 움직임에 전기를 쓰지 않는다
    const io = new IntersectionObserver(
      ([entry]) => {
        stage.dataset.idle = entry.isIntersecting ? 'false' : 'true'
      },
      { rootMargin: '80px 0px' },
    )
    io.observe(stage)

    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches
    if (still || !fine) return () => io.disconnect()

    const host = (listen ? stage.closest<HTMLElement>(listen) : null) ?? stage.parentElement
    if (!host) return () => io.disconnect()

    let tx = 0
    let ty = 0
    let x = 0
    let y = 0
    let frame = 0

    const tick = () => {
      x += (tx - x) * 0.085
      y += (ty - y) * 0.085
      stage.style.setProperty('--yaw', `${(x * yaw).toFixed(3)}deg`)
      stage.style.setProperty('--pitch', `${(y * pitch).toFixed(3)}deg`)
      stage.style.setProperty('--px', x.toFixed(4))
      stage.style.setProperty('--py', y.toFixed(4))
      if (Math.abs(tx - x) > 0.001 || Math.abs(ty - y) > 0.001) frame = requestAnimationFrame(tick)
      else frame = 0
    }
    const kick = () => {
      if (!frame) frame = requestAnimationFrame(tick)
    }

    // 무대는 화면 끝까지 칠해지지만 머리(host)는 글 격자 폭이다. 그래서 창 전체에서 듣고,
    // 가로는 화면 폭으로, 세로는 머리의 높이 안에서만 잰다. 그 띠를 벗어나면 제자리로
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' && e.pointerType !== 'pen') return
      const r = host.getBoundingClientRect()
      if (e.clientY < r.top || e.clientY > r.bottom) {
        if (tx || ty) onLeave()
        return
      }
      // 가운데에서 얼마나 벗어났는지 -1 ~ 1
      tx = Math.max(-1, Math.min(1, (e.clientX / window.innerWidth) * 2 - 1))
      ty = Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height) * 2 - 1))
      kick()
    }
    function onLeave() {
      tx = 0
      ty = 0
      kick()
    }

    window.addEventListener('pointermove', onMove, { passive: true })
    document.documentElement.addEventListener('pointerleave', onLeave)
    return () => {
      io.disconnect()
      window.removeEventListener('pointermove', onMove)
      document.documentElement.removeEventListener('pointerleave', onLeave)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [ref, listen, yaw, pitch])
}
