'use client'

import Link from 'next/link'
import { lockScroll } from '@/lib/consumer/scroll-lock'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { KOREA_PROVINCES, KOREA_VISUAL_VIEWBOX } from '@/lib/korea-map-data'
import { KOREA_REGIONS } from '@/lib/korea-regions'
import { mapProvince } from '@/lib/consumer/classify'
import Atlas3D from '../three/Atlas3D'
import type { AtlasState } from '../three/atlas-scene'
import { useDialogFocus } from '../phone/useDialogFocus'

/**
 * 탐험 모드 — 첫 화면의 입체 지도를 화면 가득 펼쳐, 조건을 바꾸면 기둥이 따라 솟고
 * 지역을 고르면 카메라가 그곳으로 내려간다.
 *
 * 공고는 지도 화면과 같은 길(/api/notices/map — 지금 접수 중·예정)에서 받는다.
 * 금액은 원문에 있는 것만 쓴다. LH 목록처럼 금액이 없는 공고는 금액 조건을 걸면
 * 빠지므로, 빠진 수를 함께 적는다.
 */

interface Pin {
  id: string
  name: string
  province: string
  region: string
  housingType: string
  kind: 'SALE' | 'RENT'
  deposit: number | null
  monthlyRent: number | null
  daysLeft: number | null
}

type Kind = 'ALL' | 'SALE' | 'RENT'
type Due = 'ALL' | '7' | '30'
type Cap = 'ALL' | '10000' | '30000' | '50000'

const NAME_BY_CODE = new Map(KOREA_REGIONS.map(r => [r.code, r.name]))
const CODE_BY_NAME = new Map(KOREA_REGIONS.map(r => [r.name, r.code]))

const KIND: { v: Kind; l: string }[] = [
  { v: 'ALL', l: '전체' },
  { v: 'SALE', l: '분양' },
  { v: 'RENT', l: '임대' },
]
const DUE: { v: Due; l: string }[] = [
  { v: 'ALL', l: '마감 무관' },
  { v: '7', l: '7일 안' },
  { v: '30', l: '30일 안' },
]
const CAP: { v: Cap; l: string }[] = [
  { v: 'ALL', l: '금액 무관' },
  { v: '10000', l: '1억 이하' },
  { v: '30000', l: '3억 이하' },
  { v: '50000', l: '5억 이하' },
]

function dday(n: number | null) {
  if (n === null) return '미정'
  if (n === 0) return 'D-DAY'
  return n < 0 ? '마감' : `D-${n}`
}

function money(man: number | null) {
  if (man === null) return '금액 공고문 확인'
  if (man >= 10000) {
    const eok = Math.floor(man / 10000)
    const rest = man % 10000
    return rest ? `${eok}억 ${rest.toLocaleString()}만원` : `${eok}억원`
  }
  return `${man.toLocaleString()}만원`
}

function Seg<T extends string>({
  label,
  value,
  items,
  onChange,
}: {
  label: string
  value: T
  items: { v: T; l: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div className="sx-seg" role="radiogroup" aria-label={label}>
      {items.map(it => (
        <button
          key={it.v}
          type="button"
          role="radio"
          aria-checked={value === it.v}
          className="sx-seg__b"
          onClick={() => onChange(it.v)}
        >
          {it.l}
        </button>
      ))}
    </div>
  )
}

export default function SpatialExplorer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const dialogRef = useRef<HTMLDivElement>(null)
  useDialogFocus(open, dialogRef, onClose)

  const [pins, setPins] = useState<Pin[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [kind, setKind] = useState<Kind>('ALL')
  const [due, setDue] = useState<Due>('ALL')
  const [cap, setCap] = useState<Cap>('ALL')
  const [active, setActive] = useState<string | null>(null)
  const [hover, setHover] = useState<string | null>(null)
  const [live, setLive] = useState(false)
  /** 휴대폰 바텀시트 — 'peek' 은 손잡이와 요약만, 'full' 은 목록까지 */
  const [sheet, setSheet] = useState<'peek' | 'full'>('peek')
  /*
   * 바텀시트 끌기 — 손가락을 그대로 따라오고, 놓는 순간의 속도로 어디에 설지 정한다.
   * 빠르게 튕기면 짧게 끌어도 넘어가고, 천천히 놓으면 가까운 쪽에 선다. 남은 거리와 속도로
   * 돌아가는 시간을 정해 손을 뗀 속도가 그대로 이어지게 한다.
   */
  const panelRef = useRef<HTMLElement>(null)
  const drag = useRef<{ y0: number; base: number; peek: number; last: { y: number; t: number }[]; moved: boolean } | null>(null)

  useEffect(() => {
    if (!open || pins) return
    let alive = true
    fetch('/api/notices/map', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error('공고를 불러오지 못했어요.'))))
      .then(j => alive && (j.error ? setError(j.error) : setPins(j.pins)))
      .catch((e: unknown) => alive && setError(e instanceof Error ? e.message : String(e)))
    return () => {
      alive = false
    }
  }, [open, pins])

  // 열려 있는 동안 뒤 화면은 스크롤되지 않는다
  useEffect(() => {
    if (!open) return
    const unlock = lockScroll()
    dialogRef.current?.focus()
    return unlock
  }, [open])

  const { filtered, droppedForPrice } = useMemo(() => {
    let dropped = 0
    const out = (pins ?? []).filter(p => {
      if (kind !== 'ALL' && p.kind !== kind) return false
      if (due !== 'ALL' && (p.daysLeft === null || p.daysLeft > Number(due))) return false
      if (cap !== 'ALL') {
        if (p.deposit === null) {
          dropped++
          return false
        }
        if (p.deposit > Number(cap)) return false
      }
      return true
    })
    return { filtered: out, droppedForPrice: dropped }
  }, [pins, kind, due, cap])

  const byRegion = useMemo(() => {
    const m = new Map<string, Pin[]>()
    for (const p of filtered) {
      const code = CODE_BY_NAME.get(mapProvince(p.province, p.region))
      if (!code) continue
      const list = m.get(code) ?? []
      list.push(p)
      m.set(code, list)
    }
    for (const list of m.values()) list.sort((a, z) => (a.daysLeft ?? 9999) - (z.daysLeft ?? 9999))
    return m
  }, [filtered])

  const ranked = useMemo(
    () => [...byRegion.entries()].map(([code, list]) => ({ code, n: list.length })).sort((a, b) => b.n - a.n),
    [byRegion],
  )
  const max = ranked[0]?.n ?? 0
  // 조건을 바꿔 고른 지역이 비면 전국으로 물러선다
  const activeCode = active && byRegion.has(active) ? active : null

  const scene = useMemo<AtlasState>(() => {
    const counts: Record<string, number> = {}
    for (const r of ranked) counts[r.code] = r.n
    return { counts, max, active: activeCode ?? hover, labels: ranked.slice(0, 6).map(r => r.code), zoom: !!activeCode }
  }, [ranked, max, activeCode, hover])

  const pick = useCallback((code: string) => {
    setActive(a => (a === code ? null : code))
    setSheet('full')
  }, [])

  const list = activeCode ? byRegion.get(activeCode) ?? [] : [...filtered].sort((a, z) => (a.daysLeft ?? 9999) - (z.daysLeft ?? 9999))

  if (!open) return null

  return (
    <div className="sx" role="dialog" aria-modal="true" aria-labelledby="sx-title" ref={dialogRef} tabIndex={-1}>
      <header className="sx-head">
        <div>
          <span className="sx-kicker">Explore</span>
          <h2 id="sx-title" className="sx-title">
            {activeCode ? `${NAME_BY_CODE.get(activeCode)}의 공고` : '전국의 공고를 탐험합니다'}
          </h2>
        </div>
        <button type="button" className="sx-close" onClick={onClose} aria-label="탐험 모드 닫기">
          닫기
        </button>
      </header>

      <div className="sx-filters">
        <Seg label="유형" value={kind} items={KIND} onChange={setKind} />
        <Seg label="마감" value={due} items={DUE} onChange={setDue} />
        <Seg label="보증금·분양가" value={cap} items={CAP} onChange={setCap} />
      </div>

      <div className="sx-body">
        <div className="sx-stage" data-3d={live ? 'on' : undefined}>
          <svg className="sx-flat" viewBox={KOREA_VISUAL_VIEWBOX} role="img" aria-label="지역별 공고 지도">
            {KOREA_PROVINCES.map(p => {
              const n = byRegion.get(p.code)?.length ?? 0
              const lvl = n && max ? Math.max(1, Math.ceil((n / max) * 4)) : 0
              return (
                <path
                  key={p.code}
                  d={p.path}
                  data-level={lvl}
                  data-on={p.code === activeCode || undefined}
                  onClick={() => n && pick(p.code)}
                />
              )
            })}
          </svg>
          <Atlas3D state={scene} onHover={setHover} onPick={pick} onLive={setLive} />
          {activeCode && (
            <button type="button" className="sx-back" onClick={() => setActive(null)}>
              ← 전국으로
            </button>
          )}
        </div>

        <aside className="sx-panel" data-sheet={sheet} aria-label="조건에 맞는 공고" ref={panelRef}>
          <div
            className="sx-grip"
            onPointerDown={e => {
              const el = panelRef.current
              if (!el || getComputedStyle(el).position !== 'fixed') return // 넓은 화면은 옆 패널이라 끌지 않는다
              const peek = el.offsetHeight - 140
              drag.current = { y0: e.clientY, base: sheet === 'full' ? 0 : peek, peek, last: [{ y: e.clientY, t: e.timeStamp }], moved: false }
              el.style.transition = 'none'
              ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
            }}
            onPointerMove={e => {
              const d = drag.current
              const el = panelRef.current
              if (!d || !el) return
              const dy = e.clientY - d.y0
              if (Math.abs(dy) > 6) d.moved = true
              // 끝을 넘으면 저항을 준다(1/3) — 고무줄처럼
              let off = d.base + dy
              if (off < 0) off /= 3
              if (off > d.peek) off = d.peek + (off - d.peek) / 3
              el.style.transform = `translateY(${off}px)`
              d.last.push({ y: e.clientY, t: e.timeStamp })
              if (d.last.length > 6) d.last.shift()
            }}
            onPointerUp={e => {
              const d = drag.current
              const el = panelRef.current
              drag.current = null
              if (!d || !el) return
              if (!d.moved) {
                el.style.transition = ''
                el.style.transform = ''
                setSheet(v => (v === 'peek' ? 'full' : 'peek'))
                return
              }
              const a = d.last[0]
              const b = d.last[d.last.length - 1]
              const v = (b.y - a.y) / Math.max(1, b.t - a.t) // px/ms, 아래가 +
              const cur = Math.min(d.peek, Math.max(0, d.base + (e.clientY - d.y0)))
              // 튕겼으면(0.4px/ms 넘게) 그 방향으로, 아니면 지금 속도로 0.2초 더 간 자리에서 가까운 쪽에 세운다
              const to: 'full' | 'peek' =
                Math.abs(v) > 0.4 ? (v < 0 ? 'full' : 'peek') : cur + v * 200 < d.peek / 2 ? 'full' : 'peek'
              const dist = Math.abs((to === 'full' ? 0 : d.peek) - cur)
              const ms = Math.round(Math.min(460, Math.max(200, dist / Math.max(0.6, Math.abs(v)))))
              el.style.transition = `transform ${ms}ms cubic-bezier(0.2, 0.9, 0.25, 1)`
              el.style.transform = ''
              setSheet(to)
              // 끝나면 CSS 의 기본 전환으로 돌려 둔다
              window.setTimeout(() => {
                if (panelRef.current && !drag.current) panelRef.current.style.transition = ''
              }, ms + 30)
            }}
            onPointerCancel={() => {
              drag.current = null
              if (panelRef.current) {
                panelRef.current.style.transition = ''
                panelRef.current.style.transform = ''
              }
            }}
          >
            <button
              type="button"
              className="sx-grip__b"
              aria-expanded={sheet === 'full'}
              aria-label={sheet === 'full' ? '목록 접기' : '목록 펼치기'}
              onClick={e => {
                // 포인터로 누른 것은 위에서 처리한다. 키보드(Enter·Space)만 여기서
                if (e.detail === 0) setSheet(s => (s === 'peek' ? 'full' : 'peek'))
              }}
            />
          </div>

          <div className="sx-sum" aria-live="polite">
            <strong>{pins ? `${list.length}건` : error ? '불러오지 못함' : '불러오는 중'}</strong>
            <span>
              {activeCode ? NAME_BY_CODE.get(activeCode) : '전국'} · 조건에 맞는 공고
              {cap !== 'ALL' && droppedForPrice > 0 && ` · 금액 미기재 ${droppedForPrice}건 제외`}
            </span>
          </div>

          <ul className="sx-regions" aria-label="지역 고르기">
            {ranked.map(r => (
              <li key={r.code}>
                <button
                  type="button"
                  aria-pressed={r.code === activeCode}
                  onClick={() => pick(r.code)}
                  onPointerEnter={() => setHover(r.code)}
                  onPointerLeave={() => setHover(null)}
                >
                  {NAME_BY_CODE.get(r.code)} <b>{r.n}</b>
                </button>
              </li>
            ))}
          </ul>

          {error ? (
            <p className="sx-empty">{error}</p>
          ) : pins && list.length === 0 ? (
            <p className="sx-empty">조건에 맞는 공고가 없어요. 조건을 넓혀 보세요.</p>
          ) : (
            <ol className="sx-list">
              {list.slice(0, 40).map(p => (
                <li key={p.id} data-kind={p.kind.toLowerCase()}>
                  <Link href={`/notices/${p.id}`} onClick={onClose}>
                    <span className="sx-list__d" data-hot={p.daysLeft !== null && p.daysLeft <= 3 ? '' : undefined}>
                      {dday(p.daysLeft)}
                    </span>
                    <span className="sx-list__n">{p.name}</span>
                    <span className="sx-list__m">
                      {p.province} · {p.housingType} · {money(p.deposit)}
                      {p.monthlyRent ? ` · 월 ${p.monthlyRent.toLocaleString()}만원` : ''}
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          )}
          {list.length > 40 && <p className="sx-more">마감이 가까운 40건까지 보여 드려요.</p>}
        </aside>
      </div>
    </div>
  )
}
