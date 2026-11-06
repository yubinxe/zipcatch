'use client'

import { useRef, type KeyboardEvent } from 'react'
import {
  compareModels,
  currentDocument,
  dongsForType,
  groupByArea,
  landRentFor,
  planFor,
  priceRange,
  shortType,
  stackOf,
  typeRowFor,
  type OfficialModel,
  type OfficialNotice,
  type SiteData,
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

/** 원 → '51만 1,500원' */
export function wonFull(v: number) {
  const n = Math.round(v)
  const man = Math.trunc(n / 10000)
  const r = n % 10000
  if (!man) return `${r.toLocaleString('ko-KR')}원`
  return r ? `${man.toLocaleString('ko-KR')}만 ${r.toLocaleString('ko-KR')}원` : `${man.toLocaleString('ko-KR')}만원`
}

const area = (v: number) => `${v.toFixed(2)}㎡`
const count = (v: number) => `${Math.round(v).toLocaleString('ko-KR')}세대`
const per = (v: number) => `${Math.round(v).toLocaleString('ko-KR')}만원`

function Num({
  value,
  fmt,
  label,
  sub,
  tone,
}: {
  value: number | null
  fmt: (v: number) => string
  label: string
  sub?: React.ReactNode
  tone?: 'gold'
}) {
  const shown = useTween(value)
  return (
    <div className="cx-num" data-tone={tone}>
      <dt>{label}</dt>
      <dd>
        {/* 흐르는 숫자는 눈에만. 읽는 사람에게는 공식 값 그대로 */}
        <span aria-hidden="true">{shown === null ? '—' : fmt(shown)}</span>
        <span className="cs-sr">{value === null ? '공고에 없음' : fmt(value)}</span>
      </dd>
      {sub && <p className="cx-num__sub">{sub}</p>}
    </div>
  )
}

/* ── 휴대폰 접힌 시트의 첫 줄 — 장면을 가리지 않고 핵심만 ── */
export function KeyStrip({ items }: { items: { label: string; value: string; tone?: 'gold' | 'blue' }[] }) {
  return (
    <dl className="cx-key">
      {items.map(i => (
        <div key={i.label} data-tone={i.tone}>
          <dt>{i.label}</dt>
          <dd>{i.value}</dd>
        </div>
      ))}
    </dl>
  )
}

/* ── 건축 모드 — 단지 전체 ───────────────────────────── */
export function ComplexSummary({
  notice,
  src,
  site,
  onPickDong,
}: {
  notice: OfficialNotice
  src: VerifiedSource | null
  site: SiteData | null
  onPickDong: (id: number) => void
}) {
  if (!src) {
    const hh = notice.models.reduce((s, m) => s + (m.households ?? 0), 0)
    return (
      <div className="cx-sum">
        <p className="cx-sum__k">단지 개요</p>
        <dl className="cx-info__nums">
          <Num label="주택형" value={notice.models.length} fmt={v => `${Math.round(v)}종`} />
          <Num label="이번 청약 세대(특별+일반)" value={hh} fmt={count} />
        </dl>
        <p className="cx-note">이 공고의 단지 배치·동 자료는 아직 확인하지 않았습니다.</p>
      </div>
    )
  }
  const s = src.supply
  const parts = [
    { k: 'pre', label: '사전청약 당첨자 배정', v: s.preWinners },
    { k: 'special', label: '신규 특별공급', v: s.special },
    { k: 'general', label: '신규 일반공급', v: s.general },
  ]
  const lease = src.landLease
  return (
    <div className="cx-sum">
      <p className="cx-sum__k">단지 전체</p>
      <dl className="cx-info__nums">
        <Num label="총 건설호수" value={s.total} fmt={count} sub={`공고 ${s.page}쪽 · 이번에 새로 청약받는 세대는 ${s.main.toLocaleString('ko-KR')}세대`} />
        {site && (
          <Num
            label="동 · 최고층"
            value={site.dongs.length}
            fmt={v => `${Math.round(v)}개 동 · ${Math.max(...site.dongs.map(d => d.floors))}층`}
            sub="층수는 공고 가격표의 가장 높은 호수 층"
          />
        )}
      </dl>
      <div className="cx-split" role="img" aria-label={parts.map(p => `${p.label} ${p.v}세대`).join(', ')}>
        <div className="cx-split__bar" aria-hidden="true">
          {parts.map(p => (
            <i key={p.k} data-k={p.k} style={{ flexGrow: p.v }} />
          ))}
        </div>
        <ul aria-hidden="true">
          {parts.map(p => (
            <li key={p.k} data-k={p.k}>
              <span>{p.label}</span>
              <b>{p.v.toLocaleString('ko-KR')}</b>
            </li>
          ))}
        </ul>
      </div>
      {lease && (
        <div className="cx-lease">
          <p className="cx-sum__k">토지임대부 — 건물값과 땅값을 따로 낸다</p>
          <dl>
            {Object.entries(lease.monthlyByArea).map(([a, v]) => (
              <div key={a}>
                <dt>전용 {a}㎡ 월 토지임대료</dt>
                <dd>{wonFull(v)}</dd>
              </div>
            ))}
          </dl>
          <p className="cx-note">{lease.note}</p>
        </div>
      )}
      <div>
        <p className="cx-sum__k">일정 (공고 원문)</p>
        <ol className="cx-sched">
          {src.schedule.map(i => (
            <li key={i.label}>
              <span>{i.label}</span>
              <b>{i.date}</b>
            </li>
          ))}
        </ol>
      </div>
      {site && (
        <div>
          <p className="cx-sum__k">동을 눌러 층·호를 봅니다</p>
          <div className="cx-dongs">
            {site.dongs.map(d => (
              <button key={d.id} type="button" onClick={() => onPickDong(d.id)}>
                <b>{d.id}</b>
                <span>
                  {d.floors}층 · {d.units}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/* ── 주택형 정보 ─────────────────────────────────────── */
export function ComplexInfoPanel({
  model,
  src,
  site,
  docUrl,
  onPickDong,
}: {
  model: OfficialModel | null
  src: VerifiedSource | null
  site: SiteData | null
  docUrl: string | null
  onPickDong: (id: number) => void
}) {
  if (!model) {
    return (
      <div className="cx-info cx-info--empty">
        <p>아래에서 주택형을 고르면 공고에 적힌 면적·세대수·금액이 여기에 섭니다.</p>
      </div>
    )
  }
  const plan = planFor(src, model)
  const row = typeRowFor(src, model)
  const rent = landRentFor(src, model)
  const range = site ? priceRange(site, model.name) : null
  const where = site ? dongsForType(site, model.name) : []
  const special = row ? row.main - row.general : null
  return (
    <div className="cx-info" aria-live="polite">
      <p className="cx-info__type">
        <b>{shortType(model.name)}</b>
        <span>청약홈 표기 {model.name}</span>
      </p>
      <dl className="cx-info__nums">
        <Num
          label={row ? '주거전용면적 (공고문)' : '전용면적 (주택형 표기)'}
          value={model.exclusiveArea}
          fmt={area}
          sub={
            row && row.subs.length > 1
              ? `세부타입 ${row.subs.map(s => `${s.label} ${s.exclusive}`).join(' · ')}㎡ — 청약은 대표타입으로, 세부타입은 무작위 배정`
              : undefined
          }
        />
        <Num label="공급면적 (전용+주거공용)" value={model.supplyArea} fmt={area} />
        <Num
          label={rent !== null ? '건물 분양가 최고 (층·향별 차등)' : '분양 최고금액'}
          value={model.topAmount}
          fmt={won}
          tone="gold"
          sub={range ? `최저 ${won(range.min)} · 공고 가격표 ${range.units}세대 기준` : undefined}
        />
        {rent !== null && (
          <Num
            label="월 토지임대료 (건물 분양가와 별도)"
            value={rent}
            fmt={wonFull}
            sub={`공고 ${src?.landLease?.page}쪽 — 전용 ${Math.trunc(model.exclusiveArea ?? 0)}㎡ 전체 주택형 같은 금액`}
          />
        )}
        <Num
          label="이번 청약 세대 (특별+일반)"
          value={model.households}
          fmt={count}
          sub={
            row
              ? `특별 ${special}(청년 ${row.youth} · 신혼 ${row.newlywed} · 생애최초 ${row.firstHome} · 신생아 ${row.newborn}) · 일반 ${row.general}`
              : undefined
          }
        />
        {row && (
          <Num
            label="단지 안 이 주택형 전체"
            value={row.total}
            fmt={count}
            sub={`사전청약 당첨자 배정 ${row.preWinners}세대 포함 · 최고 ${Math.max(...row.subs.map(s => s.maxFloor))}층`}
          />
        )}
        <Num label="평당가 (공급면적 기준)" value={model.perPyeong} fmt={per} />
      </dl>
      {row && (
        <p className="cx-note">
          발코니 확장비(별도, 부가세 포함){' '}
          {row.subs.map(s => `${row.subs.length > 1 ? `${s.label} ` : ''}${wonFull(s.balcony)}`).join(' · ')}
        </p>
      )}
      {where.length > 0 && (
        <div className="cx-where">
          <p className="cx-sum__k">이 주택형이 있는 동 — 공고 가격표</p>
          <div className="cx-dongs">
            {where.map(w => (
              <button key={w.dong} type="button" onClick={() => onPickDong(w.dong)}>
                <b>{w.dong}</b>
                <span>
                  {w.count}세대 · {w.lowest === w.highest ? `${w.lowest}층` : `${w.lowest}~${w.highest}층`}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="cx-info__plan">
        {plan && docUrl ? (
          <>
            <span>
              단위세대 평면도 — 정정본 공고문 {plan.pages.join(' · ')}쪽{' '}
              <a href={docUrl} target="_blank" rel="noopener noreferrer">
                SH 공고 원문
                <span className="cs-sr"> (새 창)</span>
              </a>
            </span>
            {plan.corrected && <small>2026.10.23 정정: {plan.corrected}</small>}
            <small>방·창·향 같은 모양은 원문 평면도에서 확인하세요. 이 화면은 그리지 않습니다(사용 허락 없음).</small>
          </>
        ) : (
          <small>이 주택형의 평면도는 아직 확인하지 않았습니다. 방 구성·향은 공고문 원문에서 확인하세요.</small>
        )}
      </div>
    </div>
  )
}

/* ── 동 하나 — 층 × 호. 공고 가격표 그대로 ───────────────── */
export function DongStack({
  site,
  dong,
  selected,
  compare,
  onClose,
  onPickType,
}: {
  site: SiteData
  dong: number
  selected: string | null
  compare: string | null
  onClose: () => void
  onPickType: (name: string) => void
}) {
  const { floors, lines, cells } = stackOf(site, dong)
  const d = site.dongs.find(x => x.id === dong)
  return (
    <div className="cx-stack">
      <div className="cx-stack__h">
        <p className="cx-info__type">
          <b>{dong}동</b>
          <span>
            {d?.units}세대 · {d?.lowest}~{d?.floors}층 · {lines.length}개 호 라인
          </span>
        </p>
        <button type="button" className="cx-ghost" onClick={onClose}>
          동 선택 풀기
        </button>
      </div>
      <div className="cx-stack__scroll">
        <table className="cx-stack__t">
          <caption className="cs-sr">{dong}동 층별 호 — 칸마다 주택형과 건물 분양가</caption>
          <thead>
            <tr>
              <th scope="col">층</th>
              {lines.map(l => (
                <th key={l} scope="col">
                  {String(l).padStart(2, '0')}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {floors.map(f => (
              <tr key={f}>
                <th scope="row">{f}</th>
                {lines.map(l => {
                  const c = cells.get(`${f}-${l}`)
                  if (!c) return <td key={l} data-empty />
                  const k = c.type === selected ? 'sel' : c.type === compare ? 'cmp' : undefined
                  const label = `${dong}동 ${c.ho}호 · ${c.plan} · ${won(Math.floor(c.price / 10))}`
                  return (
                    <td key={l} data-k={k} title={label} onClick={() => onPickType(c.type)}>
                      <span aria-hidden="true">{c.plan}</span>
                      <span className="cs-sr">{label}</span>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="cx-note">
        칸 = 공고 가격표의 한 세대(동·호·평면유형·주택가격). 칸의 왼쪽·오른쪽은 호 번호 순서일 뿐 실제 위치·향이 아닙니다. 칸을 누르면 그 주택형을
        고릅니다.
      </p>
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
    let n = i
    for (let step = 0; step < flat.length; step++) {
      n = (n + (e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1) + flat.length) % flat.length
      if (!(comparing && flat[n].name === selected)) break
    }
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
export function UnitTypeCompare({ a, b, src }: { a: OfficialModel; b: OfficialModel; src: VerifiedSource | null }) {
  const diffs = compareModels(a, b)
  const fmt: Record<string, (v: number) => string> = { exclusiveArea: area, supplyArea: area, topAmount: won, perPyeong: per, households: count }
  const ra = landRentFor(src, a)
  const rb = landRentFor(src, b)
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
              <span className="cx-cmp__label">{d.key === 'topAmount' && ra !== null ? '건물 분양가 최고' : d.label}</span>
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
        {ra !== null && rb !== null && (
          <li>
            <span className="cx-cmp__label">월 토지임대료 (별도)</span>
            <span className="cx-cmp__v">
              {wonFull(ra)} → {wonFull(rb)}
              <b>{ra === rb ? '같음' : `${rb > ra ? '+' : '−'}${wonFull(Math.abs(rb - ra))}`}</b>
            </span>
          </li>
        )}
      </ul>
      {diffs.length < 5 && <p className="cx-cmp__note">두 주택형 모두 값이 있는 항목만 견줍니다.</p>}
    </div>
  )
}

/* ── 출처 서랍 ─────────────────────────────────────────── */
const USE_LABEL = { LICENSED: '사용 허락', LINK_ONLY: '원문 연결만', UNAVAILABLE: '확보 못 함' } as const

export function SourceDrawer({ notice, src }: { notice: OfficialNotice; src: VerifiedSource | null }) {
  const doc = src ? currentDocument(src) : null
  return (
    <details className="cx-src">
      <summary>자료의 출처와 사용 조건</summary>
      <dl>
        <div>
          <dt>공식 값</dt>
          <dd>
            {notice.source} · 청약홈 주택형별 공급(공고 {notice.announcementId}) — 공공데이터포털 「한국부동산원_청약홈 분양정보 조회 서비스」, 이용허락범위
            제한 없음
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
        {src && doc ? (
          <>
            <div>
              <dt>원문 대조 ({src.checkedAt})</dt>
              <dd>{src.checkNote}</dd>
            </div>
            <div>
              <dt>원문과 정정</dt>
              <dd>
                <ul>
                  {src.documents.map(d => (
                    <li key={d.title}>
                      <a href={d.url} target="_blank" rel="noopener noreferrer">
                        {d.title}
                      </a>{' '}
                      — {d.fileDate}. {d.note}
                    </li>
                  ))}
                </ul>
                <ul>
                  {src.corrections.map(c => (
                    <li key={c.what}>
                      <b>{c.what}</b>: {c.detail}
                    </li>
                  ))}
                </ul>
              </dd>
            </div>
            <div>
              <dt>자료별 사용 상태</dt>
              <dd>
                <ul className="cx-assets">
                  {src.assets
                    .filter(a => a.kind !== '단위세대 평면도')
                    .map(a => (
                      <li key={a.kind}>
                        <span className="cx-badge" data-use={a.use}>
                          {USE_LABEL[a.use]}
                        </span>{' '}
                        {a.kind}
                        {a.pages.length > 0 && ` — 공고문 ${a.pages.join('·')}쪽`}
                        <small>{a.useNote}</small>
                      </li>
                    ))}
                  <li>
                    <span className="cx-badge" data-use="LINK_ONLY">
                      {USE_LABEL.LINK_ONLY}
                    </span>{' '}
                    단위세대 평면도 20종 — 공고문 15~39쪽
                  </li>
                </ul>
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
