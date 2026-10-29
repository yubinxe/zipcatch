'use client'

import Link from 'next/link'

import { Fragment, useEffect, useState, type CSSProperties } from 'react'
import { KOREA_PROVINCES, KOREA_VISUAL_VIEWBOX } from '@/lib/korea-map-data'
import { KOREA_REGIONS } from '@/lib/korea-regions'
import ScrollStage from './ScrollStage'

/**
 * 장면 1 — 흩어진 공고가 한 장의 지도로 모인다.
 *
 * 내릴수록 문장이 한 단어씩 켜지고, 뒤의 지도에서는 공고가 많은 지역부터
 * 차례로 불이 들어온다. 불이 들어오는 지역과 숫자는 `/api/notices/map` 의
 * 실제 집계다 — 공고가 없는 지역은 끝까지 어둡게 남는다.
 */

const LINES: { text: string; glow?: boolean }[][] = [
  [{ text: '흩어진' }, { text: '공고를' }],
  [{ text: '한' }, { text: '장의' }, { text: '지도로,', glow: true }],
  [{ text: '내' }, { text: '조건에' }, { text: '맞게.', glow: true }],
]
const WORDS = LINES.flat().length

interface Province {
  name: string
  count: number
}

export default function StatementScene() {
  const [provinces, setProvinces] = useState<Province[] | null>(null)
  const [total, setTotal] = useState<number | null>(null)

  useEffect(() => {
    const ctl = new AbortController()
    fetch('/api/notices/map', { signal: ctl.signal })
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then((d: { total: number; provinces: Province[] }) => {
        setProvinces(d.provinces ?? [])
        setTotal(d.total ?? 0)
      })
      .catch(() => setProvinces([]))
    return () => ctl.abort()
  }, [])

  // 공고가 많은 지역부터 순서를 매긴다. 순서가 곧 불이 들어오는 차례다
  const lit = (provinces ?? []).filter(p => p.count > 0).sort((a, b) => b.count - a.count)
  // 집계는 '전남·광주'처럼 둘을 묶어 오기도 한다. 지도에서는 각각에 불을 켠다
  const order = new Map(lit.flatMap((p, i) => p.name.split('·').map(n => [n.trim(), i] as const)))
  const top = lit.slice(0, 4)

  let w = 0
  return (
    <ScrollStage length={3.2} className="cs-scene cs-scene--statement" label="흩어진 공고를 한 장의 지도로">
      <div className="cs-scene__map" aria-hidden="true" style={{ '--lit': Math.max(1, lit.length) } as CSSProperties}>
        <svg viewBox={KOREA_VISUAL_VIEWBOX}>
          {KOREA_PROVINCES.map(p => {
            const geo = KOREA_REGIONS.find(r => r.code === p.code)
            const i = geo ? order.get(geo.name) : undefined
            return (
              <path
                key={p.id}
                d={p.path}
                className="cs-scene__land"
                data-lit={i !== undefined || undefined}
                style={i !== undefined ? ({ '--i': i } as CSSProperties) : undefined}
              />
            )
          })}
        </svg>
      </div>

      <div className="cs-wrap cs-scene__copy">
        <span className="cs-sec-eyebrow">One Map</span>
        <p className="cs-scene__words" style={{ '--n': WORDS } as CSSProperties}>
          {LINES.map((line, li) => (
            <span key={li} className="cs-scene__line">
              {line.map((word, wi) => {
                const i = w++
                // 단어 사이 띄어쓰기는 상자 밖에 둔다 — inline-block 안의 끝 공백은 사라진다
                return (
                  <Fragment key={word.text}>
                    {wi > 0 && ' '}
                    <span
                      className="cs-scene__word"
                      data-glow={word.glow || undefined}
                      style={{ '--i': i } as CSSProperties}
                    >
                      {word.text}
                    </span>
                  </Fragment>
                )
              })}
            </span>
          ))}
        </p>

        <div className="cs-scene__facts">
          <div className="cs-scene__fact">
            <b className="cs-num">{total ?? '—'}</b>
            <span>지금 접수 중·예정인 공고</span>
          </div>
          {top.map(p => (
            <div key={p.name} className="cs-scene__fact">
              <b className="cs-num">{p.count}</b>
              <span>{p.name}</span>
            </div>
          ))}
        </div>

        {/* 장면의 끝 — 같은 지도를 손으로 움직여 보는 곳으로. 지도 화면은 이 그림에서 이어 들어간다 */}
        <Link href="/map" className="cs-scene__go">
          지도에서 직접 보기
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </Link>
      </div>
    </ScrollStage>
  )
}
