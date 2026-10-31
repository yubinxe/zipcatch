'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  compareModels,
  currentDocument,
  landRentFor,
  officialModel,
  PRESENTATION,
  shortType,
  verifiedFor,
  type OfficialNotice,
  type SiteData,
} from '@/lib/consumer/complex-visualization'
import { lockScroll } from '@/lib/consumer/scroll-lock'
import { loadSite } from '@/lib/consumer/sites'
import { useSheetDrag } from '@/lib/consumer/use-sheet-drag'
import { FEATURES } from '@/lib/features'
import { useDialogFocus } from '../phone/useDialogFocus'
import ShareStudio from '../ShareStudio'
import ComplexCanvas from './ComplexCanvas'
import {
  ComplexInfoPanel,
  ComplexSummary,
  DongStack,
  KeyStrip,
  SourceDrawer,
  UnitTypeCompare,
  UnitTypeSelector,
  won,
  wonFull,
} from './ComplexParts'
import type { SceneMode } from './complex-scene'

/**
 * PROPERTY EXPERIENCE — 공고 하나의 단지·주택형을 화면 가득 펼친다.
 *
 * 모드
 *  - 건축(architecture)  현장 매스 모형: 지도 기여자의 동 윤곽(ODbL) × 공고의 동별 최고층. 실제 외관 아님
 *  - 주택형(unit)        고른 주택형이 있는 동을 밝히고, 숫자는 공고문 값
 *  - 데이터 구조(data)   면적·세대수 기둥 — 통계적 표현
 * 현장 자료(site)가 없는 공고는 데이터 구조만 연다.
 *
 * 도입: 어둠 속 단지명·위치(fadeMs) → 넓은 화면에서 다가감(arriveMs) → 카메라가 서면 패널(panelMs).
 */
type Phase = 'dark' | 'approach' | 'arrived'

export default function ComplexExperience({
  notice,
  initial,
  onClose,
}: {
  notice: OfficialNotice
  initial: string | null
  /** 닫을 때 마지막으로 고른 주택형을 돌려준다 — 공고 화면이 그 줄을 짚는다 */
  onClose: (selected: string | null) => void
}) {
  const box = useRef<HTMLDivElement>(null)
  const foot = useRef<HTMLElement>(null)
  const src = verifiedFor(notice.announcementId)
  const doc = src ? currentDocument(src) : null
  // 청약홈 전용면적(표기 59)을 공고문 값(59.97)으로 — 확인된 공고만
  const models = useMemo(() => notice.models.map(m => officialModel(src, m)), [notice.models, src])
  const [site, setSite] = useState<SiteData | null>(null)
  const [siteState, setSiteState] = useState<'loading' | 'ready' | 'none'>(src?.siteKey ? 'loading' : 'none')
  const [mode, setMode] = useState<SceneMode>(src?.siteKey ? (initial ? 'unit' : 'architecture') : 'data')
  const [selected, setSelected] = useState<string | null>(initial)
  const [compare, setCompare] = useState<string | null>(null)
  const [comparing, setComparing] = useState(false)
  const [dong, setDong] = useState<number | null>(null)
  const [hover, setHover] = useState<string | null>(null)
  const [overview, setOverview] = useState(0)
  const [phase, setPhase] = useState<Phase>('dark')
  const { panelRef, sheet, setSheet, grip } = useSheetDrag(150)

  const close = useCallback(() => onClose(selected), [onClose, selected])
  // 위에 공유 이미지 창이 겹치면 Esc·초점은 그 창 몫이다 (useDialogFocus 가 맨 위 창만 가둔다)
  useDialogFocus(true, box, close)
  useEffect(() => {
    const unlock = lockScroll()
    box.current?.focus()
    const id = window.setTimeout(() => setPhase(p => (p === 'dark' ? 'approach' : p)), PRESENTATION.fadeMs)
    return () => {
      window.clearTimeout(id)
      unlock()
    }
  }, [])

  useEffect(() => {
    if (!src?.siteKey) return
    let alive = true
    loadSite(src.siteKey)
      .then(s => {
        if (!alive) return
        setSite(s)
        setSiteState(s ? 'ready' : 'none')
        if (!s) setMode('data')
      })
      .catch(() => {
        if (!alive) return
        setSiteState('none')
        setMode('data')
      })
    return () => {
      alive = false
    }
  }, [src?.siteKey])

  // 휴대폰 정보 시트는 아래 띠 위에 선다 — 띠의 실제 높이를 잰다
  useEffect(() => {
    const f = foot.current
    const b = box.current
    if (!f || !b || !('ResizeObserver' in window)) return
    const ro = new ResizeObserver(() => b.style.setProperty('--cx-foot', `${f.offsetHeight}px`))
    ro.observe(f)
    return () => ro.disconnect()
  }, [])

  const byName = useMemo(() => new Map(models.map(m => [m.name, m])), [models])
  const sel = selected ? byName.get(selected) ?? null : null
  const cmp = comparing && compare ? byName.get(compare) ?? null : null
  const newSupply = useMemo(() => models.reduce((s, m) => s + (m.households ?? 0), 0), [models])

  const arrived = useCallback(() => setPhase('arrived'), [])

  // 주택형 고르기 — 시트는 저절로 펼치지 않는다(장면을 가리지 않게). 숫자는 접힌 줄에서도 보인다
  const pickType = useCallback(
    (name: string) => {
      if (comparing && selected && name !== selected) {
        setCompare(name)
        return
      }
      setSelected(name)
      setDong(null)
      setMode(m => (m === 'architecture' ? 'unit' : m))
    },
    [comparing, selected],
  )
  const pickDong = useCallback((id: number) => {
    setDong(d => (d === id ? null : id))
    setMode(m => (m === 'data' ? 'unit' : m))
  }, [])

  const goMode = (m: SceneMode) => {
    if (m === 'architecture') {
      setComparing(false)
      setDong(null)
      setOverview(n => n + 1)
    }
    if (m !== 'architecture' && !selected) setSelected(models[0]?.name ?? null)
    if (m === 'data') setDong(null)
    setMode(m)
  }
  const toggleCompare = () => {
    if (comparing) {
      setComparing(false)
      setCompare(null)
      return
    }
    const first = selected ?? models[0]?.name ?? null
    setSelected(first)
    // 다른 전용면적 가운데 첫 주택형을 기본 비교 대상으로 — 바로 바꿀 수 있다
    const base = byName.get(first ?? '')
    const other =
      models.find(m => m.name !== first && Math.trunc(m.exclusiveArea ?? 0) !== Math.trunc(base?.exclusiveArea ?? 0)) ??
      models.find(m => m.name !== first)
    setCompare(other?.name ?? null)
    setComparing(true)
    setDong(null)
    if (mode === 'architecture') setMode('unit')
  }

  // 휴대폰에서 접힌 시트가 장면 아래를 덮는 비율 — 장면은 그만큼 위로 올려 보인다
  const [inset, setInset] = useState(0)
  useEffect(() => {
    const st = box.current?.querySelector<HTMLElement>('.cx-stage')
    const pn = panelRef.current
    if (!st || !pn || !('ResizeObserver' in window)) return
    const measure = () => {
      const fixed = getComputedStyle(pn).position === 'fixed'
      setInset(fixed ? Math.min(0.5, Math.round((150 / Math.max(1, st.offsetHeight)) * 100) / 100) : 0)
    }
    const ro = new ResizeObserver(measure)
    ro.observe(st)
    measure()
    return () => ro.disconnect()
  }, [panelRef])

  // 동·모드가 바뀌면 패널은 맨 위부터
  useEffect(() => {
    panelRef.current?.scrollTo({ top: 0 })
  }, [dong, mode, comparing, panelRef])

  const canvasState = useMemo(
    () => ({ mode, selected: mode === 'architecture' ? null : selected, compare: comparing ? compare : null, hover, dong, inset }),
    [mode, selected, comparing, compare, hover, dong, inset],
  )

  const showStack = site && dong !== null && mode !== 'data'
  const key = (() => {
    if (showStack) {
      const d = site!.dongs.find(x => x.id === dong)
      return [
        { label: '동', value: `${dong}동` },
        { label: '층·세대', value: `${d?.floors}층 · ${d?.units}세대` },
      ]
    }
    if (sel && cmp) {
      const d = compareModels(sel, cmp).find(x => x.key === 'topAmount')
      return [
        { label: '비교', value: `${shortType(sel.name)} → ${shortType(cmp.name)}` },
        ...(d ? [{ label: '최고금액 차이', value: `${d.diff > 0 ? '+' : d.diff < 0 ? '−' : ''}${won(Math.abs(d.diff))}`, tone: 'gold' as const }] : []),
      ]
    }
    if (sel && mode !== 'architecture') {
      const rent = landRentFor(src, sel)
      return [
        { label: '주택형', value: shortType(sel.name) },
        ...(sel.topAmount !== null ? [{ label: rent !== null ? '건물 분양가 최고' : '최고금액', value: won(sel.topAmount), tone: 'gold' as const }] : []),
        ...(sel.exclusiveArea !== null ? [{ label: '전용', value: `${sel.exclusiveArea}㎡` }] : []),
        ...(sel.households !== null ? [{ label: '이번 청약', value: `${sel.households}세대` }] : []),
        ...(rent !== null ? [{ label: '월 토지임대료', value: wonFull(rent) }] : []),
      ]
    }
    if (src)
      return [
        { label: '총 건설호수', value: `${src.supply.total.toLocaleString('ko-KR')}세대`, tone: 'gold' as const },
        { label: '이번 청약', value: `${src.supply.main.toLocaleString('ko-KR')}세대` },
        ...(site ? [{ label: '동', value: `${site.dongs.length}개 · 최고 ${Math.max(...site.dongs.map(d => d.floors))}층` }] : []),
      ]
    return [
      { label: '주택형', value: `${models.length}종` },
      { label: '이번 청약', value: `${newSupply.toLocaleString('ko-KR')}세대` },
    ]
  })()

  const onSite = mode !== 'data' && !!site
  const topFloor = site ? Math.max(...site.dongs.map(d => d.floors)) : null

  return createPortal(
    <div
      className="pxe"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cx-title"
      ref={box}
      tabIndex={-1}
      data-phase={phase}
      data-mode={mode}
    >
      <header className="cx-head">
        <div className="cx-head__t">
          <span className="cx-kicker">Property Experience</span>
          <h2 id="cx-title" className="cx-title">
            {notice.name}
          </h2>
          <p className="cx-head__facts">
            {/* 숫자 한가운데서 줄이 꺾이지 않게 덩어리마다 묶는다 */}
            {src ? (
              <>
                <span>단지 {src.supply.total.toLocaleString('ko-KR')}세대</span> ·{' '}
                <span>
                  이번 청약 {src.supply.main}세대(특별 {src.supply.special} · 일반 {src.supply.general})
                </span>{' '}
                · <span>사전청약 당첨자 {src.supply.preWinners}세대</span>
              </>
            ) : (
              <>
                <span>주택형 {models.length}종</span> · <span>이번 청약 {newSupply.toLocaleString('ko-KR')}세대</span>
              </>
            )}
          </p>
        </div>
        <button type="button" className="cx-close" onClick={close}>
          공고로 돌아가기
        </button>
      </header>

      <div className="cx-body">
        <div className="cx-stage">
          {siteState === 'loading' ? (
            <div className="cx-canvas__loading">현장 자료를 싣고 있어요</div>
          ) : (
            <ComplexCanvas
              models={models}
              site={site}
              state={canvasState}
              onPick={pickType}
              onPickDong={pickDong}
              onHover={setHover}
              onArrived={arrived}
              overviewKey={overview}
            />
          )}

          {/* 건축 모드의 큰 글자 — 어둠에서 먼저 떠오른다 */}
          <div className="cx-hero" aria-hidden={mode !== 'architecture'}>
            <p className="cx-hero__name">{notice.name.replace(/\(.*\)$/, '').trim()}</p>
            {src && site && (
              <p className="cx-hero__meta">
                {site.dongs.length}개 동 · 최고 {topFloor}층 · {src.supply.total.toLocaleString('ko-KR')}세대
              </p>
            )}
          </div>

          {/* 화면에 늘 적는다 — 무엇을 근거로 그렸고 무엇이 아닌지 */}
          <p className="cx-concept">
            {onSite ? (
              <>
                <b>개념 시각화 — 매스 모형</b>동 윤곽{' '}
                <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">
                  © OpenStreetMap 기여자
                </a>
                (ODbL) × 공고의 동별 최고층<span className="cx-concept__more">(높이는 층수 × 3m 가정)</span>. 실제 외관·색·창이 아닙니다.
              </>
            ) : (
              <>
                <b>{site ? '데이터 구조 — 통계적 표현' : '주택형 비교를 위한 개념 시각화'}</b>바닥 = 전용면적<span className="cx-concept__more">(옅은 판 = 공급면적)</span>, 높이 =
                이번 청약 세대수. 실제 단지 배치·건물 모양이 아닙니다.
              </>
            )}
          </p>
        </div>

        <aside className="cx-panel" data-sheet={sheet} ref={panelRef} aria-label="단지·주택형 정보">
          <div className="cx-grip" {...grip}>
            <button
              type="button"
              className="cx-grip__b"
              aria-expanded={sheet === 'full'}
              aria-label={sheet === 'full' ? '정보 접기' : '정보 펼치기'}
              onClick={e => {
                if (e.detail === 0) setSheet(s => (s === 'peek' ? 'full' : 'peek'))
              }}
            />
          </div>
          <KeyStrip items={key} />
          {showStack ? (
            <DongStack
              site={site!}
              dong={dong!}
              selected={selected}
              compare={comparing ? compare : null}
              onClose={() => setDong(null)}
              onPickType={pickType}
            />
          ) : mode === 'architecture' ? (
            <ComplexSummary notice={notice} src={src} site={site} onPickDong={pickDong} />
          ) : sel && cmp ? (
            <>
              <UnitTypeCompare a={sel} b={cmp} src={src} />
              {FEATURES.share && (
                <ShareStudio
                  label="비교를 이미지로"
                  card={() => ({
                    kicker: 'Same complex',
                    title: `${notice.name} — ${shortType(sel.name)} vs ${shortType(cmp.name)}`,
                    rows: compareModels(sel, cmp).map((d, i) => ({
                      label: d.label,
                      value: `${d.diff > 0 ? '+' : ''}${d.key === 'topAmount' ? won(d.diff) : d.key === 'households' ? `${d.diff}세대` : d.key === 'perPyeong' ? `${d.diff}만원` : `${d.diff}㎡`}`,
                      sub: `${shortType(sel.name)} ${d.a.toLocaleString('ko-KR')} → ${shortType(cmp.name)} ${d.b.toLocaleString('ko-KR')}`,
                      bar: null,
                      tone: i % 2,
                    })),
                    assumptionsLabel: '읽는 법',
                    assumptions: [
                      '동일 단지 내 주택형 비교',
                      src?.landLease ? '건물 분양가 최고 기준 · 토지임대료 별도' : '최고금액 기준',
                      '평당가는 공급면적 기준',
                    ],
                    source: `${src ? '입주자모집공고(정정)·' : ''}청약홈 주택형별 공급 (공고 ${notice.announcementId})`,
                    asOf: src?.checkedAt ?? new Date().toISOString().slice(0, 10),
                    slug: `types-${shortType(sel.name)}-${shortType(cmp.name)}`,
                  })}
                />
              )}
            </>
          ) : (
            <ComplexInfoPanel model={sel} src={src} site={site} docUrl={doc?.url ?? null} onPickDong={pickDong} />
          )}
          <SourceDrawer notice={notice} src={src} />
        </aside>
      </div>

      <footer className="cx-foot" ref={foot}>
        <div className="cx-modes">
          <nav className="cx-steps" aria-label="보기">
            {(
              [
                ['architecture', '건축', !site],
                ['unit', '주택형', !site],
                ['data', '데이터 구조', false],
              ] as [SceneMode, string, boolean][]
            ).map(([m, l, off], i) =>
              off ? null : (
                <button key={m} type="button" aria-current={mode === m ? 'page' : undefined} onClick={() => goMode(m)}>
                  <i aria-hidden="true">{String(i + 1).padStart(2, '0')}</i>
                  {l}
                </button>
              ),
            )}
          </nav>
          <button type="button" className="cx-cmpbtn" aria-pressed={comparing} onClick={toggleCompare}>
            같은 단지 비교
          </button>
        </div>
        <UnitTypeSelector models={models} selected={selected} compare={compare} comparing={comparing} onSelect={pickType} />
      </footer>
    </div>,
    document.body,
  )
}
