'use client'

import Link from 'next/link'

import { Fragment, useEffect, useMemo, useRef, useState, type CSSProperties, type FocusEvent } from 'react'
import { KOREA_PROVINCES, KOREA_VISUAL_VIEWBOX } from '@/lib/korea-map-data'
import { KOREA_REGIONS } from '@/lib/korea-regions'
import Statement3D from '@/components/consumer/three/Statement3D'
import type { StatementDatum } from '@/components/consumer/three/statement-scene'
import ScrollStage from './ScrollStage'

/**
 * 장면 1 — 흩어진 공고가 한 장의 지도로 모인다.
 *
 * 내릴수록 문장이 한 단어씩 켜지고, 옆의 지도는 바로 위에서 본 평면에서 점점 뒤로
 * 누우며 입체가 된다. 공고가 많은 지역부터 차례로 불이 들어오며 솟고, 높이는 공고
 * 수에 정비례한다. 불이 들어오는 지역과 숫자는 `/api/notices/map` 의 실제 집계다 —
 * 공고가 없는 지역은 끝까지 어둡고 낮게 남는다.
 *
 * 입체는 두 겹이다. 넓은 화면에서 WebGL 이 되면 three 장면(three/Statement3D)이,
 * 그 전에·그 밖에서는 CSS 입체(평면 지도를 원근으로 눕히고, 불이 든 지역을 여러 장
 * 겹쳐 쌓아 올린 것)가 같은 칸을 채운다. 둘 다 `--p` 하나로 움직인다.
 */

const LINES: { text: string; glow?: boolean }[][] = [
  [{ text: '흩어진' }, { text: '공고를' }],
  [{ text: '한' }, { text: '장의' }, { text: '지도로,', glow: true }],
  [{ text: '내' }, { text: '조건에' }, { text: '맞게.', glow: true }],
]
const WORDS = LINES.flat().length
/** CSS 입체에서 가장 많은 지역이 쌓이는 장 수 */
const LAYERS = 12

interface Province {
  name: string
  count: number
}

/**
 * 키보드로 '지도에서 직접 보기'에 오면 장면의 끝(다 선 지도)으로 데려간다.
 * 무대는 화면에 붙어 있어(sticky) 브라우저가 초점 자리로 스크롤해 주지 않는다 —
 * 보이지 않는 곳에 초점이 앉지 않게 직접 옮긴다. 이미 무대가 화면을 덮고 있으면 그대로 둔다.
 */
function revealEnd(e: FocusEvent<HTMLElement>) {
  const stage = e.currentTarget.closest<HTMLElement>('.cs-stage')
  if (!stage) return
  const r = stage.getBoundingClientRect()
  const end = r.bottom - window.innerHeight
  // 무대가 화면을 덮고 장면이 거의 끝났으면(링크가 이미 보이면 — 손으로 누른 경우) 움직이지 않는다
  const p = parseFloat(stage.querySelector<HTMLElement>('.cs-stage__pin')?.style.getPropertyValue('--p') ?? '')
  if (r.top <= 1 && r.bottom >= window.innerHeight - 1 && p >= 0.8) return
  window.scrollTo({ top: window.scrollY + end, behavior: 'instant' })
}

const CODE_BY_NAME = new Map(KOREA_REGIONS.map(r => [r.name, r.code]))

export default function StatementScene() {
  const [provinces, setProvinces] = useState<Province[] | null>(null)
  const [total, setTotal] = useState<number | null>(null)
  const [live, setLive] = useState(false)
  const mapRef = useRef<HTMLDivElement>(null)
  const copyRef = useRef<HTMLDivElement>(null)

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

  /*
   * 지도 칸은 글이 끝나는 곳에서 시작한다 — 글자 크기가 화면 폭을 따라 바뀌므로
   * 실제 글의 오른쪽 끝을 재어 `--copy-r` 로 적는다. 어느 폭에서도 지도가 글을 덮지 않는다.
   */
  useEffect(() => {
    const copy = copyRef.current
    const map = mapRef.current
    if (!copy || !map) return
    const measure = () => {
      const base = map.parentElement?.getBoundingClientRect().left ?? 0
      let right = 0
      copy.querySelectorAll('.cs-scene__word, .cs-scene__fact, .cs-scene__go').forEach(el => {
        right = Math.max(right, el.getBoundingClientRect().right - base)
      })
      if (right > 0) map.style.setProperty('--copy-r', `${Math.round(right)}px`)
    }
    measure()
    // 글 상자의 폭은 그대로여도 숫자 줄은 집계가 오면 길어진다 — 숫자 칸마다 따로 본다
    const ro = new ResizeObserver(measure)
    ro.observe(copy)
    copy.querySelectorAll('.cs-scene__fact').forEach(el => ro.observe(el))
    return () => ro.disconnect()
  }, [provinces])

  // 공고가 많은 지역부터 순서를 매긴다. 순서가 곧 불이 들어오고 솟는 차례다
  const lit = useMemo(() => (provinces ?? []).filter(p => p.count > 0).sort((a, b) => b.count - a.count), [provinces])
  const max = lit[0]?.count ?? 0
  // 집계는 '전남·광주'처럼 둘을 묶어 오기도 한다. 지도에서는 각각에 불을 켠다
  const byCode = useMemo(() => {
    const m = new Map<string, { i: number; level: number }>()
    lit.forEach((p, i) => {
      // 공고 수에 정비례하는 높이(장 수). 공고가 있으면 적어도 한 장
      const level = Math.max(1, Math.round((p.count / max) * LAYERS))
      for (const n of p.name.split('·')) {
        const code = CODE_BY_NAME.get(n.trim())
        if (code) m.set(code, { i, level })
      }
    })
    return m
  }, [lit, max])
  const data = useMemo<StatementDatum[] | null>(
    () =>
      provinces
        ? lit.map(p => ({
            name: p.name,
            count: p.count,
            codes: p.name
              .split('·')
              .map(n => CODE_BY_NAME.get(n.trim()))
              .filter((c): c is string => !!c),
          }))
        : null,
    [provinces, lit],
  )
  const top = lit.slice(0, 4)
  const litCodes = KOREA_PROVINCES.filter(p => byCode.has(p.code))

  let w = 0
  return (
    <ScrollStage length={3.2} className="cs-scene cs-scene--statement" label="흩어진 공고를 한 장의 지도로">
      <div
        ref={mapRef}
        className="cs-scene__map"
        aria-hidden="true"
        data-3d={live ? 'on' : undefined}
        style={{ '--lit': Math.max(1, lit.length), '--layers': LAYERS } as CSSProperties}
      >
        {/* 지역 경로는 한 번만 싣고, 바닥판과 쌓는 장마다 <use> 로 다시 쓴다 */}
        <svg className="cs-sm-defs" width="0" height="0" focusable="false">
          <defs>
            {KOREA_PROVINCES.map(p => (
              <path key={p.id} id={`cs-sm-${p.code}`} d={p.path} />
            ))}
          </defs>
        </svg>

        <div className="cs-sm-relief">
          <div className="cs-sm-shadow" />
          <svg className="cs-sm-layer cs-sm-layer--base" viewBox={KOREA_VISUAL_VIEWBOX}>
            {KOREA_PROVINCES.map(p => {
              const o = byCode.get(p.code)
              return (
                <use
                  key={p.id}
                  href={`#cs-sm-${p.code}`}
                  className="cs-scene__land"
                  data-lit={o ? true : undefined}
                  style={o ? ({ '--i': o.i } as CSSProperties) : undefined}
                />
              )
            })}
          </svg>
          {Array.from({ length: LAYERS }, (_, k) => k + 1).map(j => {
            const here = litCodes.filter(p => (byCode.get(p.code)?.level ?? 0) >= j)
            if (!here.length) return null
            return (
              <svg key={j} className="cs-sm-layer" viewBox={KOREA_VISUAL_VIEWBOX} style={{ '--j': j } as CSSProperties}>
                {here.map(p => {
                  const o = byCode.get(p.code)!
                  return (
                    <use
                      key={p.id}
                      href={`#cs-sm-${p.code}`}
                      className={j === o.level ? 'cs-sm-cap' : 'cs-sm-wall'}
                      style={{ '--i': o.i, '--l': o.level } as CSSProperties}
                    />
                  )
                })}
              </svg>
            )
          })}
        </div>

        <Statement3D data={data} onLive={setLive} />
      </div>

      <div ref={copyRef} className="cs-wrap cs-scene__copy">
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
        <Link href="/map" className="cs-scene__go" onFocus={revealEnd}>
          지도에서 직접 보기
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </Link>
      </div>
    </ScrollStage>
  )
}
