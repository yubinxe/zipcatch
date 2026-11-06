'use client'

import Link from 'next/link'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { SearchProfile } from '@/lib/crm/types'
import { FEATURES } from '@/lib/features'

/**
 * 내 조건의 지도 — 지금 열린 공고 전부를 점 하나씩으로 놓고, 내 조건에 맞는 것은 가운데로,
 * 조금 벗어난 것은 가운데 둘레로, 나머지는 바깥으로 모은다.
 *
 * 보증금·월세 상한을 움직이면 같은 매칭(/api/search, 저장하지 않는 읽기)을 다시 돌려
 * 점들이 고리 사이를 옮겨 간다. 조건을 '만약에'로 바꿔 보는 자리라 저장된 조건은 바꾸지 않는다.
 * 이것은 조건 대조이지 자격 판정이 아니다 — 화면에 그렇게 적는다.
 */

interface Row {
  property: { id: string; name: string; region: string; housingType: string }
}
interface Matched {
  primary: Row[]
  relaxed: Row[]
}
interface Dot {
  id: string
  name: string
  hint: string
  ring: 0 | 1 | 2
}

/** 공고 id 로 정한 각도 — 조건이 바뀌어도 같은 공고는 같은 방향에 남는다 */
function angleOf(id: string) {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619)
  return ((h >>> 0) / 2 ** 32) * Math.PI * 2
}
function radialOf(id: string) {
  let h = 5381
  for (let i = 0; i < id.length; i++) h = ((h << 5) + h + id.charCodeAt(i)) | 0
  return ((h >>> 0) % 1000) / 1000
}
const RING: [number, number][] = [
  [0.04, 0.28],
  [0.4, 0.6],
  [0.72, 0.96],
]
const RING_LABEL = ['조건 일치', '조금 벗어남', '그 밖']

function won(man: number) {
  return man >= 10000 ? `${(man / 10000).toLocaleString('ko-KR', { maximumFractionDigits: 1 })}억원` : `${man.toLocaleString('ko-KR')}만원`
}

export default function HousingUniverse({ profile, base }: { profile: SearchProfile; base: Matched }) {
  const [all, setAll] = useState<Row[] | null>(null)
  const [dep, setDep] = useState<number | null>(profile.unknownFields.includes('maxDeposit') ? null : profile.maxDeposit)
  const [rent, setRent] = useState<number | null>(profile.unknownFields.includes('maxMonthlyRent') ? null : profile.maxMonthlyRent)
  const [regions, setRegions] = useState<string[]>(profile.regions)
  const [what, setWhat] = useState<Matched | null>(null)
  const [busy, setBusy] = useState(false)
  const [hover, setHover] = useState<Dot | null>(null)
  const ids = useId()
  const first = useRef(true)

  useEffect(() => {
    let alive = true
    fetch('/api/notices', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(j => alive && setAll(j.notices ?? []))
      .catch(() => alive && setAll([]))
    return () => {
      alive = false
    }
  }, [])

  // 상한을 움직이면 잠깐 기다렸다가 같은 매칭을 다시 묻는다(저장하지 않음)
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    const ctl = new AbortController()
    const t = setTimeout(() => {
      setBusy(true)
      fetch('/api/search', {
        method: 'POST',
        signal: ctl.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          readOnly: true,
          regions,
          householdType: profile.householdType,
          housingTypes: profile.housingTypes,
          maxDeposit: dep,
          maxMonthlyRent: rent,
          minArea: profile.unknownFields.includes('minArea') ? null : profile.minArea,
        }),
      })
        .then(r => (r.ok ? r.json() : Promise.reject()))
        .then(j => setWhat({ primary: j.primary ?? [], relaxed: j.relaxed ?? [] }))
        .catch(() => {})
        .finally(() => setBusy(false))
    }, 350)
    return () => {
      clearTimeout(t)
      ctl.abort()
    }
  }, [dep, rent, regions, profile])

  const cur = what ?? base
  const dots = useMemo<Dot[]>(() => {
    const ring = new Map<string, 0 | 1>()
    for (const r of cur.primary) ring.set(r.property.id, 0)
    for (const r of cur.relaxed) if (!ring.has(r.property.id)) ring.set(r.property.id, 1)
    const seen = new Set<string>()
    const out: Dot[] = []
    const push = (p: Row['property'], rg: 0 | 1 | 2) => {
      if (seen.has(p.id)) return
      seen.add(p.id)
      out.push({ id: p.id, name: p.name, hint: `${p.region} · ${p.housingType}`, ring: rg })
    }
    for (const r of [...cur.primary, ...cur.relaxed]) push(r.property, ring.get(r.property.id)!)
    for (const r of all ?? []) push(r.property, ring.get(r.property.id) ?? 2)
    return out
  }, [cur, all])
  const counts = [0, 1, 2].map(k => dots.filter(d => d.ring === k).length)

  /** 고를 수 있는 지역 — 저장한 지역과, 지금 공고가 많은 광역 */
  const regionChoices = useMemo(() => {
    const n = new Map<string, number>()
    for (const r of all ?? []) n.set(r.property.region, (n.get(r.property.region) ?? 0) + 1)
    const top = [...n.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k)
    return [...new Set([...profile.regions, ...top])].slice(0, 9)
  }, [all, profile.regions])
  const toggleRegion = (name: string) =>
    setRegions(prev =>
      prev.includes(name) ? (prev.length > 1 ? prev.filter(x => x !== name) : prev) : prev.length < 3 ? [...prev, name] : prev,
    )

  if (!FEATURES.universe) return null

  const changed = what !== null

  return (
    <section className="hu" aria-labelledby={`${ids}-t`}>
      <div className="hu-head">
        <span className="cs-sa-kicker">My Universe</span>
        <h2 className="hu-title" id={`${ids}-t`}>
          지금 열린 공고 {dots.length}건 가운데, 내 조건은 여기에
        </h2>
        <p className="hu-sub">
          {regions.join(' · ')} · 가운데가 조건 일치, 그 둘레가 조금 벗어난 후보입니다. 지역과 상한을 바꿔 보세요.
        </p>
      </div>

      <div className="hu-body">
        <div className="hu-ctrl">
          <div className="hu-regions" role="group" aria-label="지역 (셋까지)">
            <span className="hu-regions__k">지역 · 셋까지</span>
            {regionChoices.map(name => (
              <button
                key={name}
                type="button"
                aria-pressed={regions.includes(name)}
                disabled={!regions.includes(name) && regions.length >= 3}
                onClick={() => toggleRegion(name)}
              >
                {name}
              </button>
            ))}
          </div>
          <Cap label="보증금 상한" value={dep} max={50000} step={500} onChange={setDep} />
          <Cap label="월세 상한" value={rent} max={150} step={5} onChange={setRent} unit="만원" />
          <dl className="hu-counts" aria-live="polite">
            {RING_LABEL.map((l, k) => (
              <div key={l} data-ring={k}>
                <dt>
                  <i aria-hidden="true" />
                  {l}
                </dt>
                <dd className="cs-num">{counts[k]}</dd>
              </div>
            ))}
          </dl>
          {changed && (
            <p className="hu-what">
              &lsquo;만약에&rsquo; 조건입니다 — 저장한 조건은 그대로예요.{' '}
              <button
                type="button"
                onClick={() => {
                  setDep(profile.unknownFields.includes('maxDeposit') ? null : profile.maxDeposit)
                  setRent(profile.unknownFields.includes('maxMonthlyRent') ? null : profile.maxMonthlyRent)
                  setRegions(profile.regions)
                  setWhat(null)
                  first.current = true
                }}
              >
                저장한 조건으로
              </button>
            </p>
          )}
        </div>

        <figure className="hu-field" data-busy={busy || undefined}>
          <svg viewBox="-100 -100 200 200" role="img" aria-label={`조건 일치 ${counts[0]}건, 조금 벗어남 ${counts[1]}건, 그 밖 ${counts[2]}건`}>
            {RING.map(([, r], k) => (
              <circle key={k} r={r * 100} className="hu-ring" data-ring={k} />
            ))}
            {dots.map(d => {
              const [lo, hi] = RING[d.ring]
              const rr = (lo + (hi - lo) * radialOf(d.id)) * 100
              const a = angleOf(d.id)
              return (
                <circle
                  key={d.id}
                  r={d.ring === 0 ? 3.4 : 2.4}
                  className="hu-dot"
                  data-ring={d.ring}
                  data-on={hover?.id === d.id || undefined}
                  style={{ transform: `translate(${(Math.cos(a) * rr).toFixed(2)}px, ${(Math.sin(a) * rr).toFixed(2)}px)` }}
                  onPointerEnter={() => setHover(d)}
                  onPointerLeave={() => setHover(null)}
                />
              )
            })}
          </svg>
          <figcaption className="hu-tip" aria-hidden={!hover}>
            {hover ? (
              <>
                <b>{hover.name}</b>
                <span>
                  {hover.hint} · {RING_LABEL[hover.ring]}
                </span>
              </>
            ) : (
              <span>점에 손을 올리면 공고 이름이 보입니다</span>
            )}
          </figcaption>
        </figure>
      </div>

      <p className="hu-note">
        조건 일치는 지역·금액·유형·면적을 공고와 대조한 결과입니다. 무주택·소득·자산·가점 같은 <b>자격은 판정하지 않습니다</b>
        — <Link href="/score">가점 계산</Link>과 공고문 원문으로 따로 확인하세요.
      </p>
    </section>
  )
}

function Cap({
  label,
  value,
  max,
  step,
  onChange,
  unit = '',
}: {
  label: string
  value: number | null
  max: number
  step: number
  onChange: (v: number | null) => void
  unit?: string
}) {
  const id = useId()
  const v = value ?? max
  return (
    <div className="hu-cap">
      <label htmlFor={id}>
        {label}
        <output className="cs-num">{value === null ? '정하지 않음' : unit ? `${value.toLocaleString('ko-KR')}${unit}` : won(value)}</output>
      </label>
      <input
        id={id}
        type="range"
        min={0}
        max={max}
        step={step}
        value={v}
        onChange={e => onChange(Number(e.target.value))}
        style={{ ['--p' as string]: `${(v / max) * 100}%` }}
      />
      {value !== null && (
        <button type="button" className="hu-cap__clear" onClick={() => onChange(null)}>
          상한 없이
        </button>
      )}
    </div>
  )
}
