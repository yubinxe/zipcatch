'use client'

import { useRef, type KeyboardEvent } from 'react'
import {
  compareModels,
  groupByArea,
  pageUrl,
  planFor,
  shortType,
  type OfficialModel,
  type OfficialNotice,
  type VerifiedSource,
} from '@/lib/consumer/complex-visualization'
import { useTween } from './useTween'

/** 만원 → '3억 9,050만원' */
export function won(man: number) {
  const v = Math.round(man)
  if (Math.abs(v) >= 10000) {
    const e = Math.trunc(v / 10000)
    const r = Math.abs(v % 10000)
    return r ? `${e}억 ${r.toLocaleString('ko-KR')}만원` : `${e}억원`
  }
  return `${v.toLocaleString('ko-KR')}만원`
}

function Num({ value, fmt, label }: { value: number | null; fmt: (v: number) => string; label: string }) {
  const shown = useTween(value)
  return (
    <div className="cx-num">
      <dt>{label}</dt>
      <dd>
        {/* 흐르는 숫자는 눈에만. 읽는 사람에게는 공식 값 그대로 */}
        <span aria-hidden="true">{shown === null ? '—' : fmt(shown)}</span>
        <span className="cs-sr">{value === null ? '공고에 없음' : fmt(value)}</span>
      </dd>
    </div>
  )
}

const area = (v: number) => `${v.toFixed(2)}㎡`
const count = (v: number) => `${Math.round(v).toLocaleString('ko-KR')}세대`
const per = (v: number) => `${Math.round(v).toLocaleString('ko-KR')}만원`

/* ── 정보 패널 ─────────────────────────────────────────── */
export function ComplexInfoPanel({ model, src }: { model: OfficialModel | null; src: VerifiedSource | null }) {
  if (!model) {
    return (
      <div className="cx-info cx-info--empty">
        <p>아래에서 주택형을 고르면 공고에 적힌 면적·세대수·최고금액이 여기에 섭니다.</p>
      </div>
    )
  }
  const plan = planFor(src, model)
  return (
    <div className="cx-info" aria-live="polite">
      <p className="cx-info__type">
        <b>{shortType(model.name)}</b>
        <span>청약홈 표기 {model.name}</span>
      </p>
      <dl className="cx-info__nums">
        <Num label="전용면적" value={model.exclusiveArea} fmt={area} />
        <Num label="공급면적" value={model.supplyArea} fmt={area} />
        <Num label="공급 세대수" value={model.households} fmt={count} />
        <Num label="분양 최고금액" value={model.topAmount} fmt={won} />
        <Num label="평당가 (공급면적 기준)" value={model.perPyeong} fmt={per} />
      </dl>
      {plan && src ? (
        <p className="cx-info__plan">
          <span>
            공고문 평면도{' '}
            {plan.pages.map((p, i) => (
              <span key={p}>
                {i ? ' · ' : ''}
                <a href={pageUrl(src, p)} target="_blank" rel="noopener noreferrer">
                  {p}쪽
                </a>
              </span>
            ))}
            <span className="cs-sr"> (새 창, 원문 PDF)</span>
          </span>
          <small>방·창·향 같은 모양은 원문 평면도에서 확인하세요. 이 화면은 그리지 않습니다.</small>
        </p>
      ) : (
        <p className="cx-info__plan">
          <small>이 주택형의 평면도는 아직 확인하지 않았습니다. 방 구성·향은 공고문 원문에서 확인하세요.</small>
        </p>
      )}
    </div>
  )
}

/* ── 주택형 고르기 — 화살표로 옮기고, 비교 중이면 두 번째를 고른다 ── */
export function UnitTypeSelector({
  models,
  selected,
  compare,
  comparing,
  onSelect,
}: {
  models: OfficialModel[]
  selected: string | null
  compare: string | null
  comparing: boolean
  onSelect: (name: string) => void
}) {
  const box = useRef<HTMLDivElement>(null)
  const flat = groupByArea(models).flatMap(g => g.models)
  const current = comparing ? compare : selected
  const onKey = (e: KeyboardEvent) => {
    if (!['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'].includes(e.key)) return
    e.preventDefault()
    const i = Math.max(0, flat.findIndex(m => m.name === current))
    const n = (i + (e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1) + flat.length) % flat.length
    onSelect(flat[n].name)
    box.current?.querySelector<HTMLButtonElement>(`[data-name="${flat[n].name}"]`)?.focus()
  }
  return (
    <div className="cx-types" ref={box} role="radiogroup" aria-label={comparing ? '비교할 주택형' : '주택형'} onKeyDown={onKey}>
      {groupByArea(models).map(g => (
        <div key={g.area} className="cx-types__row">
          <span className="cx-types__k">전용 {g.area}㎡</span>
          {g.models.map(m => {
            const on = m.name === current
            return (
              <button
                key={m.name}
                type="button"
                role="radio"
                aria-checked={on}
                tabIndex={on || (!current && m === flat[0]) ? 0 : -1}
                data-name={m.name}
                data-sel={m.name === selected || undefined}
                data-cmp={m.name === compare || undefined}
                disabled={comparing && m.name === selected}
                onClick={() => onSelect(m.name)}
              >
                {shortType(m.name)}
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}

/* ── 같은 단지 안 주택형 비교 ──────────────────────────── */
export function UnitTypeCompare({ a, b }: { a: OfficialModel; b: OfficialModel }) {
  const diffs = compareModels(a, b)
  const fmt: Record<string, (v: number) => string> = { exclusiveArea: area, supplyArea: area, topAmount: won, perPyeong: per, households: count }
  return (
    <div className="cx-cmp">
      <p className="cx-cmp__k">동일 단지 내 주택형 비교</p>
      <p className="cx-cmp__who">
        <b data-k="sel">{shortType(a.name)}</b> → <b data-k="cmp">{shortType(b.name)}</b>
      </p>
      <ul>
        {diffs.map(d => {
          const max = Math.max(Math.abs(d.a), Math.abs(d.b)) || 1
          const sign = d.diff > 0 ? '+' : d.diff < 0 ? '−' : '±'
          return (
            <li key={d.key}>
              <span className="cx-cmp__label">{d.label}</span>
              <span className="cx-cmp__bars" aria-hidden="true">
                <i data-k="sel" style={{ width: `${(Math.abs(d.a) / max) * 100}%` }} />
                <i data-k="cmp" style={{ width: `${(Math.abs(d.b) / max) * 100}%` }} />
              </span>
              <span className="cx-cmp__v">
                {fmt[d.key](d.a)} → {fmt[d.key](d.b)}
                <b data-sign={sign}>
                  {sign}
                  {fmt[d.key](Math.abs(d.diff)).replace(/^-/, '')}
                </b>
              </span>
            </li>
          )
        })}
      </ul>
      {diffs.length < 5 && <p className="cx-cmp__note">두 주택형 모두 값이 있는 항목만 견줍니다.</p>}
    </div>
  )
}

/* ── 출처 서랍 ─────────────────────────────────────────── */
export function SourceDrawer({ notice, src }: { notice: OfficialNotice; src: VerifiedSource | null }) {
  return (
    <details className="cx-src">
      <summary>자료의 출처와 확인 범위</summary>
      <dl>
        <div>
          <dt>공식 값</dt>
          <dd>
            {notice.source} · 청약홈 주택형별 공급(공고 {notice.announcementId})
            {notice.sourceUrl && (
              <>
                {' · '}
                <a href={notice.sourceUrl} target="_blank" rel="noopener noreferrer">
                  청약홈 공고 상세
                </a>
              </>
            )}
          </dd>
        </div>
        {src ? (
          <>
            <div>
              <dt>원문 대조</dt>
              <dd>
                {src.checkedAt} · {src.checkNote}
              </dd>
            </div>
            <div>
              <dt>공식 자료</dt>
              <dd>
                <a href={src.documentUrl} target="_blank" rel="noopener noreferrer">
                  {src.documentTitle}
                </a>{' '}
                · 사업주체 {src.developer}
                <ul>
                  {src.assets
                    .filter(a => a.kind !== '단위세대 평면도')
                    .map(a => (
                      <li key={a.kind}>
                        {a.kind} — {a.pages.map(p => (
                          <a key={p} href={pageUrl(src, p)} target="_blank" rel="noopener noreferrer">
                            {p}쪽{' '}
                          </a>
                        ))}
                      </li>
                    ))}
                </ul>
                <small>{src.assets[0]?.useNote}</small>
              </dd>
            </div>
            <div>
              <dt>건물 형상</dt>
              <dd>{src.geometryNote}</dd>
            </div>
          </>
        ) : (
          <div>
            <dt>공식 자료</dt>
            <dd>이 공고의 조감도·배치도·평면도는 아직 확인하지 않았습니다. 건물 모양은 그리지 않습니다.</dd>
          </div>
        )}
      </dl>
    </details>
  )
}
