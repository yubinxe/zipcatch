'use client'

import { useEffect, useRef, useState } from 'react'
import { shortType, type OfficialModel } from '@/lib/consumer/complex-visualization'
import { canUse3D } from '../three/support'
import type { ComplexHandle, ComplexState } from './complex-scene'

/**
 * 주택형 개념 시각화의 칸 — WebGL 이 되면 입체(complex-scene, three 는 이때 받는다),
 * 안 되면 같은 숫자로 그린 평면 그림. 어느 쪽이든 넓이·세대수는 공고 값 그대로다.
 */
export default function ComplexCanvas({
  models,
  state,
  onPick,
  onHover,
  overviewKey,
}: {
  models: OfficialModel[]
  state: ComplexState
  onPick: (name: string) => void
  onHover: (name: string | null) => void
  /** 바뀌면 전체 보기로 돌아간다 */
  overviewKey: number
}) {
  const host = useRef<HTMLDivElement>(null)
  const handle = useRef<ComplexHandle | null>(null)
  const cbs = useRef({ onPick, onHover })
  const stateRef = useRef(state)
  const [mode, setMode] = useState<'loading' | '3d' | '2d'>('loading')

  useEffect(() => {
    cbs.current = { onPick, onHover }
  }, [onPick, onHover])

  useEffect(() => {
    stateRef.current = state
    handle.current?.update(state)
  }, [state])

  useEffect(() => {
    if (overviewKey) handle.current?.overview()
  }, [overviewKey])

  useEffect(() => {
    if (!canUse3D()) {
      // 움직임 줄이기에서는 canUse3D 가 거짓이다 — 그때도 평면 그림으로 같은 숫자를 본다
      const id = requestAnimationFrame(() => setMode('2d'))
      return () => cancelAnimationFrame(id)
    }
    let alive = true
    let h: ComplexHandle | null = null
    import('./complex-scene')
      .then(mod => {
        if (!alive || !host.current) return
        h = mod.mountComplex(
          host.current,
          models,
          {
            onHover: n => cbs.current.onHover(n),
            onPick: n => cbs.current.onPick(n),
            onReady: () => alive && setMode('3d'),
            onLost: () => {
              if (!alive) return
              h?.dispose()
              h = null
              handle.current = null
              setMode('2d')
            },
          },
          window.matchMedia('(prefers-reduced-motion: reduce)').matches,
        )
        handle.current = h
        h.update(stateRef.current)
      })
      .catch(() => alive && setMode('2d'))
    return () => {
      alive = false
      h?.dispose()
      handle.current = null
    }
  }, [models])

  return (
    <div className="cx-canvas" data-mode={mode}>
      <div ref={host} className="cx-canvas__host" aria-hidden="true" />
      {mode === '2d' && <Flat models={models} state={state} onPick={onPick} />}
      {mode === 'loading' && <div className="cx-canvas__loading">입체 장면을 준비하고 있어요</div>}
    </div>
  )
}

/** WebGL 이 없을 때 — 고른 주택형(과 비교 대상)의 넓이를 같은 축척의 정사각형으로 */
function Flat({ models, state, onPick }: { models: OfficialModel[]; state: ComplexState; onPick: (n: string) => void }) {
  const picks = [state.selected, state.compare].map(n => models.find(m => m.name === n)).filter(Boolean) as OfficialModel[]
  const shown = picks.length ? picks : models.slice(0, 2)
  const max = Math.max(...shown.map(m => Math.sqrt(m.supplyArea ?? m.exclusiveArea ?? 1)))
  const S = 180 / max
  return (
    <div className="cx-flat">
      {shown.map((m, i) => {
        const inner = Math.sqrt(m.exclusiveArea ?? 0) * S
        const outer = Math.sqrt(m.supplyArea ?? 0) * S
        return (
          <button key={m.name} type="button" className="cx-flat__item" data-k={i === 1 ? 'cmp' : 'sel'} onClick={() => onPick(m.name)}>
            <svg width={200} height={200} viewBox="0 0 200 200" aria-hidden="true">
              <rect x={100 - outer / 2} y={100 - outer / 2} width={outer} height={outer} className="cx-flat__outer" />
              <rect x={100 - inner / 2} y={100 - inner / 2} width={inner} height={inner} className="cx-flat__inner" />
            </svg>
            <span>{shortType(m.name)} · 전용 {m.exclusiveArea}㎡</span>
          </button>
        )
      })}
      <p className="cx-flat__note">같은 축척의 정사각형 — 안쪽이 전용면적, 바깥이 공급면적. 실제 평면 모양이 아닙니다.</p>
    </div>
  )
}
