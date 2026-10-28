'use client'

import { useMemo, useRef, type CSSProperties } from 'react'
import { KOREA_MAP_VIEWBOX, KOREA_PROVINCES } from '@/lib/korea-map-data'
import { KOREA_REGIONS } from '@/lib/korea-regions'
import { useStageParallax } from './useStageParallax'

/**
 * 고른 지역이 솟는 지도 — 조건 찾기 1단계의 옆자리.
 *
 * 홈의 "One Map" 장면을 손에 쥐어 준 것이다. 비스듬히 눕힌 전국 지도에서
 * 지역 칸을 누르면 그 시·도가 두께를 얻어 떠오르고, 그 위에 빛기둥이 선다.
 * 먼저 고른 곳일수록 기둥이 높다 — 화면이 "먼저 고른 곳을 더 중요하게 본다"는
 * 말을 그대로 그린다. 높이는 고른 차례일 뿐, 어떤 수치도 아니다.
 *
 * 지금 모집 중인 공고가 있는 시·도(`counts`, /api/notices 의 실제 집계)는
 * 바닥에서 은은하게 데워 둔다. 집계를 못 받았으면 아무 곳도 데우지 않는다.
 *
 * 그림은 장식이다(aria-hidden). 고른 지역·차례는 옆의 칸과 요약이 글로 말한다.
 */

/** 지도 좌표(viewBox 524×631)에서 이름표가 설 자리 — 상자 한가운데가 바다나 이웃 시·도에 떨어지는 곳만 옮긴다 */
const ANCHOR: Record<string, { x: number; y: number }> = {
  // 경기의 상자 한가운데는 서울이다. 용인·이천 쪽으로 비켜 세운다
  경기: { x: 184, y: 164 },
  서울: { x: 151, y: 124 },
  // 인천의 상자는 섬까지 품어 바다에 떨어진다. 송도 쪽 뭍으로
  인천: { x: 118, y: 135 },
  전남: { x: 128, y: 438 },
  경남: { x: 268, y: 392 },
}

/** 차례별 빛기둥 높이(px) — 1번이 가장 높다 */
const POLE = [118, 84, 56]
/** 떠오른 판의 겹 수 — 겹 사이가 두께로 보인다 */
const LAYERS = [3, 6, 9, 12]
const LIFT = 15

const [, , VBW, VBH] = KOREA_MAP_VIEWBOX.split(/\s+/).map(Number)

interface Province {
  name: string
  path: string
  x: number
  y: number
}

const PROVINCES: Province[] = KOREA_PROVINCES.map(p => {
  const geo = KOREA_REGIONS.find(r => r.code === p.code)
  const name = geo?.name ?? p.name
  const a = ANCHOR[name] ?? { x: geo?.x ?? VBW / 2, y: geo?.y ?? VBH / 2 }
  return { name, path: p.path, x: a.x, y: a.y }
})
const BY_NAME = new Map(PROVINCES.map(p => [p.name, p]))

export default function LitMap({
  picked,
  counts,
}: {
  /** 고른 차례대로의 시·도 이름 */
  picked: string[]
  /** 시·도별 모집 중 공고 수. 모르면 null */
  counts: Record<string, number> | null
}) {
  const ref = useRef<HTMLDivElement>(null)
  useStageParallax(ref, { listen: '.cs-wz', yaw: 5, pitch: 3 })

  const warm = useMemo(() => {
    if (!counts) return []
    const max = Math.max(1, ...Object.values(counts))
    return PROVINCES.filter(p => (counts[p.name] ?? 0) > 0).map(p => ({
      ...p,
      // 많은 곳일수록 조금 더 데운다. 0 건인 곳은 끝까지 어둡게 둔다
      heat: Math.round((0.35 + 0.65 * ((counts[p.name] ?? 0) / max)) * 100) / 100,
    }))
  }, [counts])

  const lit = picked.map(name => BY_NAME.get(name)).filter((p): p is Province => Boolean(p))

  return (
    <div ref={ref} className="cs-litmap" aria-hidden="true" data-count={lit.length}>
      <div className="cs-litmap__glow" />
      <div className="cs-litmap__plane" style={{ aspectRatio: `${VBW} / ${VBH}` }}>
        <svg className="cs-litmap__base" viewBox={KOREA_MAP_VIEWBOX}>
          {PROVINCES.map(p => (
            <path key={p.name} d={p.path} />
          ))}
        </svg>
        {warm.length > 0 && (
          <svg className="cs-litmap__warm" viewBox={KOREA_MAP_VIEWBOX}>
            {warm.map(p => (
              <path key={p.name} d={p.path} style={{ '--heat': p.heat } as CSSProperties} />
            ))}
          </svg>
        )}

        {lit.map((p, rank) => (
          <div
            key={p.name}
            className="cs-litmap__lift"
            data-rank={rank + 1}
            style={
              {
                '--x': `${Math.round((p.x / VBW) * 10000) / 100}%`,
                '--y': `${Math.round((p.y / VBH) * 10000) / 100}%`,
                '--pole': `${POLE[rank] ?? POLE[POLE.length - 1]}px`,
                // 기둥은 가장 높은 길이로 그려 두고 비율로 줄인다 — 차례가 바뀌면 transform 만 움직인다
                '--pk': Math.round(((POLE[rank] ?? POLE[POLE.length - 1]) / POLE[0]) * 1000) / 1000,
                '--lift': `${LIFT}px`,
              } as CSSProperties
            }
          >
            {LAYERS.map(z => (
              <svg key={z} className="cs-litmap__layer" viewBox={KOREA_MAP_VIEWBOX} style={{ '--z': `${z}px` } as CSSProperties}>
                <path d={p.path} />
              </svg>
            ))}
            <svg className="cs-litmap__top" viewBox={KOREA_MAP_VIEWBOX}>
              <path d={p.path} />
            </svg>
            <i className="cs-litmap__pole" />
            {/* 기둥 끝에는 차례만 — 이름까지 달면 붙어 있는 서울·경기·인천이 서로 가린다.
                이름은 옆의 칸과 아래 표가 말한다 */}
            <span className="cs-litmap__pin cs-num">{rank + 1}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
