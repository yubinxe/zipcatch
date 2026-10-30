'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  compareModels,
  PRESENTATION,
  shortType,
  verifiedFor,
  type OfficialNotice,
} from '@/lib/consumer/complex-visualization'
import { lockScroll } from '@/lib/consumer/scroll-lock'
import { useSheetDrag } from '@/lib/consumer/use-sheet-drag'
import { FEATURES } from '@/lib/features'
import { useDialogFocus } from '../phone/useDialogFocus'
import ShareStudio from '../ShareStudio'
import ComplexCanvas from './ComplexCanvas'
import { ComplexInfoPanel, SourceDrawer, UnitTypeCompare, UnitTypeSelector, won } from './ComplexParts'

/**
 * PROPERTY EXPERIENCE — 공고 하나의 주택형을 화면 가득 펼쳐 보고 견준다.
 *
 * 장면: 도착(전체) → 주택형 → 같은 단지 안 비교 → 공고로 돌아가기.
 * 숫자는 공고 상세 API 의 주택형 값 그대로다. 건물·단지 모양은 확인된 형상(verifiedGeometry)이
 * 있을 때만 그린다 — 지금 공고들은 없으므로 '주택형 비교를 위한 개념 시각화'라고 늘 적어 둔다.
 */
type Step = 'arrive' | 'type' | 'compare'

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
  const models = notice.models
  const [selected, setSelected] = useState<string | null>(initial)
  const [compare, setCompare] = useState<string | null>(null)
  const [step, setStep] = useState<Step>(initial ? 'type' : 'arrive')
  const [hover, setHover] = useState<string | null>(null)
  const [overview, setOverview] = useState(0)
  const [shown, setShown] = useState(false)
  const { panelRef, sheet, setSheet, grip } = useSheetDrag(150)

  const close = useCallback(() => onClose(selected), [onClose, selected])
  // 위에 공유 이미지 창이 겹치면 Esc·초점은 그 창 몫이다 (useDialogFocus 가 맨 위 창만 가둔다)
  useDialogFocus(true, box, close)
  useEffect(() => {
    const unlock = lockScroll()
    box.current?.focus()
    // 도입 — 어둠에서 떠오른 뒤 이름과 숫자가 차례로
    const id = window.setTimeout(() => setShown(true), PRESENTATION.fadeMs)
    return () => {
      window.clearTimeout(id)
      unlock()
    }
  }, [])

  // 휴대폰 정보 시트는 아래 주택형 띠 위에 선다 — 띠의 실제 높이를 잰다
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
  const cmp = compare ? byName.get(compare) ?? null : null
  const totals = useMemo(() => {
    const hh = models.reduce((s, m) => s + (m.households ?? 0), 0)
    const amts = models.map(m => m.topAmount).filter((v): v is number => v !== null)
    return { hh, lo: amts.length ? Math.min(...amts) : null, hi: amts.length ? Math.max(...amts) : null }
  }, [models])

  const pickType = useCallback(
    (name: string) => {
      if (step === 'compare' && selected && name !== selected) {
        setCompare(name)
        return
      }
      setSelected(name)
      setCompare(null)
      setStep('type')
      setSheet('full')
    },
    [step, selected, setSheet],
  )

  const goStep = (s: Step) => {
    if (s === 'arrive') {
      setSelected(null)
      setCompare(null)
      setOverview(n => n + 1)
    }
    if (s === 'type' && !selected) setSelected(models[0]?.name ?? null)
    if (s === 'compare') {
      const first = selected ?? models[0]?.name ?? null
      setSelected(first)
      // 다른 전용면적 가운데 첫 주택형을 기본 비교 대상으로 — 사용자가 바로 바꿀 수 있다
      const other = models.find(m => m.name !== first && m.exclusiveArea !== byName.get(first ?? '')?.exclusiveArea) ?? models.find(m => m.name !== first)
      setCompare(other?.name ?? null)
    }
    setStep(s)
  }

  const canvasState = useMemo(() => ({ selected, compare: step === 'compare' ? compare : null, hover }), [selected, compare, step, hover])

  return createPortal(
    <div className="pxe" role="dialog" aria-modal="true" aria-labelledby="cx-title" ref={box} tabIndex={-1} data-shown={shown || undefined}>
      <header className="cx-head">
        <div className="cx-head__t">
          <span className="cx-kicker">Property Experience</span>
          <h2 id="cx-title" className="cx-title">
            {notice.name}
          </h2>
          <p className="cx-head__facts">
            {/* 숫자 한가운데서 줄이 꺾이지 않게 덩어리마다 묶는다 */}
            <span>주택형 {models.length}종</span> · <span>공급 {totals.hh.toLocaleString('ko-KR')}세대</span>
            {totals.lo !== null && totals.hi !== null && (
              <>
                {' · '}
                <span>
                  최고금액 {won(totals.lo)} ~ {won(totals.hi)}
                </span>
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
          <ComplexCanvas models={models} state={canvasState} onPick={pickType} onHover={setHover} overviewKey={overview} />
          {/* 화면에 늘 적는다 — 건물 모양이 아니라 숫자로 세운 기둥이다 */}
          <p className="cx-concept">
            <b>주택형 비교를 위한 개념 시각화</b> 바닥 넓이 = 전용면적(옅은 판 = 공급면적), 높이 = 공급 세대수. 실제 단지 배치·건물
            모양이 아닙니다.
          </p>
        </div>

        <aside className="cx-panel" data-sheet={sheet} ref={panelRef} aria-label="주택형 정보">
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
          {step === 'compare' && sel && cmp ? (
            <>
              <UnitTypeCompare a={sel} b={cmp} />
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
                    assumptions: ['동일 단지 내 주택형 비교', '최고금액 기준', '평당가는 공급면적 기준'],
                    source: `청약홈 주택형별 공급 (공고 ${notice.announcementId})`,
                    asOf: src?.checkedAt ?? new Date().toISOString().slice(0, 10),
                    slug: `types-${shortType(sel.name)}-${shortType(cmp.name)}`,
                  })}
                />
              )}
            </>
          ) : (
            <ComplexInfoPanel model={sel} src={src} />
          )}
          <SourceDrawer notice={notice} src={src} />
        </aside>
      </div>

      <footer className="cx-foot" ref={foot}>
        <nav className="cx-steps" aria-label="장면">
          {(
            [
              ['arrive', '전체'],
              ['type', '주택형'],
              ['compare', '같은 단지 비교'],
            ] as [Step, string][]
          ).map(([s, l], i) => (
            <button key={s} type="button" aria-current={step === s ? 'step' : undefined} onClick={() => goStep(s)}>
              <i aria-hidden="true">{String(i + 1).padStart(2, '0')}</i>
              {l}
            </button>
          ))}
        </nav>
        <UnitTypeSelector
          models={models}
          selected={selected}
          compare={compare}
          comparing={step === 'compare'}
          onSelect={pickType}
        />
      </footer>
    </div>,
    document.body,
  )
}
