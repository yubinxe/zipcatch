'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { shortType, type OfficialModel, type SiteData } from '@/lib/consumer/complex-visualization'
import { canUse3D } from '../three/support'
import type { ComplexHandle, ComplexState } from './complex-scene'

/**
 * 장면 칸 — WebGL 이 되면 입체(complex-scene, three 는 이때 받는다), 안 되면 같은 자료로 그린 평면.
 * 현장 모드의 평면은 위에서 내려다본 배치(지도 기여자의 동 윤곽), 데이터 모드는 같은 축척의 정사각형.
 */
export default function ComplexCanvas({
  models,
  site,
  state,
  onPick,
  onPickDong,
  onHover,
  onArrived,
  overviewKey,
}: {
  models: OfficialModel[]
  site: SiteData | null
  state: ComplexState
  onPick: (name: string) => void
  onPickDong: (id: number) => void
  onHover: (name: string | null) => void
  onArrived: () => void
  /** 바뀌면 자동 카메라가 지금 모드의 전체 자리로 돌아간다 */
  overviewKey: number
}) {
  const host = useRef<HTMLDivElement>(null)
  const handle = useRef<ComplexHandle | null>(null)
  const cbs = useRef({ onPick, onPickDong, onHover, onArrived })
  const stateRef = useRef(state)
  const [mode, setMode] = useState<'loading' | '3d' | '2d'>('loading')

  useEffect(() => {
    cbs.current = { onPick, onPickDong, onHover, onArrived }
  }, [onPick, onPickDong, onHover, onArrived])

  useEffect(() => {
    stateRef.current = state
    handle.current?.update(state)
  }, [state])

  useEffect(() => {
    if (overviewKey) handle.current?.overview()
  }, [overviewKey])

  useEffect(() => {
    if (!canUse3D()) {
      // 움직임 줄이기에서는 canUse3D 가 거짓이다 — 그때도 평면으로 같은 자료를 본다
      const id = requestAnimationFrame(() => {
        setMode('2d')
        cbs.current.onArrived()
      })
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
          site,
          {
            onHover: n => cbs.current.onHover(n),
            onPick: n => cbs.current.onPick(n),
            onPickDong: n => cbs.current.onPickDong(n),
            onReady: () => alive && setMode('3d'),
            onArrived: () => alive && cbs.current.onArrived(),
            onLost: () => {
              if (!alive) return
              h?.dispose()
              h = null
              handle.current = null
              setMode('2d')
              cbs.current.onArrived()
            },
          },
          window.matchMedia('(prefers-reduced-motion: reduce)').matches,
        )
        handle.current = h
        h.update(stateRef.current)
      })
      .catch(() => {
        if (!alive) return
        setMode('2d')
        cbs.current.onArrived()
      })
    return () => {
      alive = false
      h?.dispose()
      handle.current = null
    }
  }, [models, site])

  return (
    <div className="cx-canvas" data-mode={mode}>
      <div ref={host} className="cx-canvas__host" aria-hidden="true" />
      {mode === '2d' &&
        (site && state.mode !== 'data' ? (
          <SitePlan site={site} state={state} onPickDong={onPickDong} />
        ) : (
          <Flat models={models} state={state} onPick={onPick} />
        ))}
      {mode === 'loading' && <div className="cx-canvas__loading">장면을 준비하고 있어요</div>}
    </div>
  )
}

/** WebGL 이 없을 때(현장) — 위에서 내려다본 배치. 동은 누를 수 있다 */
function SitePlan({ site, state, onPickDong }: { site: SiteData; state: ComplexState; onPickDong: (id: number) => void }) {
  // 단지 경계에 맞춘 틀 — 둘레 120m 를 남긴다
  const xs = site.boundary.map(p => p[0])
  const zs = site.boundary.map(p => p[1])
  const pad = 120
  const vb = [Math.min(...xs) - pad, Math.min(...zs) - pad, Math.max(...xs) - Math.min(...xs) + pad * 2, Math.max(...zs) - Math.min(...zs) + pad * 2]
  const d = (pts: [number, number][], close = true) =>
    `M${pts.map(([x, z]) => `${x.toFixed(1)},${z.toFixed(1)}`).join(' L')}${close ? ' Z' : ''}`
  const ctx = useMemo(
    () => ({
      water: site.context.water.map(p => d(p)).join(' '),
      parks: site.context.parks.map(p => d(p)).join(' '),
      major: site.context.roads.filter(r => r.k).map(r => d(r.p, false)).join(' '),
      minor: site.context.roads.filter(r => !r.k).map(r => d(r.p, false)).join(' '),
      bld: site.context.buildings.map(b => d(b.f)).join(' '),
    }),
    [site],
  )
  const sel = state.mode === 'unit' ? state.selected : null
  const cmp = state.mode === 'unit' ? state.compare : null
  return (
    <div className="cx-plan">
      <svg viewBox={vb.join(' ')} role="group" aria-label="단지 배치 평면 — 동을 누르면 층·호를 봅니다">
        <path d={ctx.water} className="cx-plan__water" />
        <path d={ctx.parks} className="cx-plan__park" />
        <path d={ctx.minor} className="cx-plan__road" />
        <path d={ctx.major} className="cx-plan__road" data-k="major" />
        <path d={ctx.bld} className="cx-plan__bld" />
        <path d={d(site.boundary)} className="cx-plan__bnd" />
        {site.dongs.map(g => {
          const a = sel ? g.types[sel] ?? 0 : 0
          const b = cmp ? g.types[cmp] ?? 0 : 0
          const k = a && b ? 'both' : a ? 'sel' : b ? 'cmp' : sel || cmp ? 'none' : ''
          const cx = g.footprint.reduce((s, p) => s + p[0], 0) / g.footprint.length
          const cz = g.footprint.reduce((s, p) => s + p[1], 0) / g.footprint.length
          return (
            <g
              key={g.id}
              className="cx-plan__dong"
              data-k={k || undefined}
              data-on={state.dong === g.id || undefined}
              role="button"
              tabIndex={0}
              aria-label={`${g.id}동 ${g.floors}층 ${g.units}세대${a ? `, 고른 주택형 ${a}세대` : ''}`}
              onClick={() => onPickDong(g.id)}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onPickDong(g.id)
                }
              }}
            >
              <path d={d(g.footprint)} />
              <text x={cx} y={cz} dy="0.35em">
                {g.id}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

/** WebGL 이 없을 때(데이터) — 고른 주택형(과 비교 대상)의 넓이를 같은 축척의 정사각형으로 */
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
            <span>
              {shortType(m.name)} · 전용 {m.exclusiveArea}㎡
            </span>
          </button>
        )
      })}
      <p className="cx-flat__note">같은 축척의 정사각형 — 안쪽이 전용면적, 바깥이 공급면적. 실제 평면 모양이 아닙니다.</p>
    </div>
  )
}
