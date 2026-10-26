'use client'

import type { ReactNode } from 'react'
import { FIT_WEIGHTS } from '@/lib/crm/services/scoring'

/** 선호 적합도 세부 점수 */
export interface FitBreakdown {
  regionScore: number
  /** 공고에 면적이 없으면 null — 0% 막대로 그리지 않는다 */
  areaScore: number | null
  housingTypeScore: number
}

export function PageHead({
  title,
  sub,
  right,
}: {
  title: string
  sub?: string
  right?: ReactNode
}) {
  return (
    <div className="crm-page-head">
      <div>
        <h1 className="crm-page-title">{title}</h1>
        {sub && <p className="crm-page-sub">{sub}</p>}
      </div>
      {right && <div className="crm-filter-row">{right}</div>}
    </div>
  )
}

export function Stat({
  label,
  value,
  unit,
  hint,
  hot,
  flash,
  live,
  delta,
}: {
  label: string
  value: number | string
  unit?: string
  hint?: string
  /** 위험/주의 강조 */
  hot?: boolean
  /** 방금 값이 바뀜 */
  flash?: boolean
  /** 이벤트로 실시간 변동하는 지표 */
  live?: boolean
  delta?: string
}) {
  const cls = [
    'crm-stat',
    hot ? 'crm-stat--hot' : '',
    live ? 'crm-stat--live-metric' : '',
    flash ? 'crm-stat--flash' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={cls}>
      <div className="crm-stat__label">{label}</div>
      <div className="crm-stat__value">
        {typeof value === 'number' ? value.toLocaleString() : value}
        {unit && <span className="crm-stat__unit">{unit}</span>}
      </div>
      {hint && <div className="crm-stat__hint">{hint}</div>}
      {delta && <span className="crm-stat__delta">{delta}</span>}
    </div>
  )
}

export function scoreTier(score: number) {
  if (score >= 85) return 'high'
  if (score >= 70) return 'mid'
  return 'low'
}

export function ScoreBadge({ score, large }: { score: number; large?: boolean }) {
  return (
    <span
      className={`score-badge${large ? ' score-badge--lg' : ''}`}
      data-tier={scoreTier(score)}
      title="선호조건 일치도 (당첨확률·자격 판정이 아닙니다)"
    >
      {score}
    </span>
  )
}

const BAR_ROWS: { key: keyof FitBreakdown; label: string; weight: number }[] = [
  { key: 'regionScore', label: '지역', weight: FIT_WEIGHTS.region },
  { key: 'areaScore', label: '면적', weight: FIT_WEIGHTS.area },
  { key: 'housingTypeScore', label: '주택유형', weight: FIT_WEIGHTS.housingType },
]

export function ScoreBars({ breakdown }: { breakdown: FitBreakdown }) {
  return (
    <div className="score-bars">
      {BAR_ROWS.map(row => {
        const v = breakdown[row.key]
        // 값이 없는 항목은 막대를 비우고 가중치가 재분배됐음을 적는다
        if (v === null) {
          return (
            <div key={row.key} className="score-bar__row">
              <span className="score-bar__label">
                {row.label}
                <span className="score-bar__weight">재분배</span>
              </span>
              <span className="score-bar__track" />
              <span className="score-bar__val muted" style={{ fontSize: 13 }}>
                미공개
              </span>
            </div>
          )
        }
        return (
          <div key={row.key} className="score-bar__row">
            <span className="score-bar__label">
              {row.label}
              <span className="score-bar__weight">{row.weight}%</span>
            </span>
            <span className="score-bar__track">
              <span
                className="score-bar__fill"
                data-strong={v >= 90 ? 'true' : 'false'}
                data-weak={v < 40 ? 'true' : 'false'}
                style={{ width: `${v}%` }}
              />
            </span>
            <span className="score-bar__val">{v}</span>
          </div>
        )
      })}
    </div>
  )
}

export function Chip({
  children,
  tone = 'default',
  dot,
}: {
  children: ReactNode
  tone?: 'default' | 'accent' | 'pos' | 'warn' | 'hot'
  dot?: boolean
}) {
  return (
    <span className={`crm-chip${tone === 'default' ? '' : ` crm-chip--${tone}`}`}>
      {dot && <span className="crm-chip__dot" />}
      {children}
    </span>
  )
}

export function DemoFlag({ label = '시연용 합성 데이터' }: { label?: string }) {
  return <span className="demo-flag">◇ {label}</span>
}

/** 이름 이니셜 아바타 — 표 가독성을 높인다 */
export function Avatar({ name }: { name: string }) {
  return <span className="crm-avatar">{name.slice(0, 1)}</span>
}

export function Person({ name, id }: { name: string; id: string }) {
  return (
    <span className="crm-person">
      <Avatar name={name} />
      <span>
        <span className="crm-person__name">{name}</span>
        <span className="crm-person__id">{id}</span>
      </span>
    </span>
  )
}

export function Drawer({
  open,
  onClose,
  title,
  subtitle,
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  subtitle?: string
  children: ReactNode
}) {
  if (!open) return null
  return (
    <div className="crm-drawer-root" role="dialog" aria-modal="true" aria-label={title}>
      <button className="crm-drawer-backdrop" onClick={onClose} aria-label="닫기" />
      <div className="crm-drawer-panel">
        <div className="crm-drawer-head">
          <div style={{ minWidth: 0 }}>
            <div className="crm-drawer-title">{title}</div>
            {subtitle && <div className="crm-drawer-sub">{subtitle}</div>}
          </div>
          <button className="crm-drawer-close" onClick={onClose} aria-label="닫기">
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>
        <div className="crm-drawer-body">{children}</div>
      </div>
    </div>
  )
}

export function KeyValues({ items }: { items: { k: string; v: ReactNode }[] }) {
  return (
    <div className="crm-kv">
      {items.map(item => (
        <div key={item.k} className="crm-kv__cell">
          <div className="crm-kv__k">{item.k}</div>
          <div className="crm-kv__v">{item.v}</div>
        </div>
      ))}
    </div>
  )
}

export function Section({
  title,
  right,
  children,
}: {
  title: string
  right?: ReactNode
  children: ReactNode
}) {
  return (
    <section>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div className="crm-sec-title">{title}</div>
        {right}
      </div>
      {children}
    </section>
  )
}

export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="crm-skel" style={{ height: 44 }} />
      ))}
    </div>
  )
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="crm-error">
      <span>{message}</span>
      {onRetry && (
        <button type="button" className="crm-btn crm-btn--sm" onClick={onRetry}>
          다시 시도
        </button>
      )}
    </div>
  )
}

const EMPTY_ICONS: Record<string, ReactNode> = {
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </>
  ),
  bell: (
    <>
      <path d="M18 8a6 6 0 1 0-12 0c0 7-3 8-3 8h18s-3-1-3-8" />
      <path d="M13.7 21a2 2 0 0 1-3.4 0" />
    </>
  ),
  calendar: (
    <>
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M8 3v4M16 3v4M4 10h16" />
    </>
  ),
  spark: <path d="M12 3l2.2 6.2L20 11l-5.8 1.8L12 19l-2.2-6.2L4 11l5.8-1.8z" />,
}

export function Empty({
  title,
  icon = 'search',
  children,
}: {
  title?: string
  icon?: keyof typeof EMPTY_ICONS
  children?: ReactNode
}) {
  return (
    <div className="crm-empty">
      <span className="crm-empty__icon">
        <svg
          width="21"
          height="21"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {EMPTY_ICONS[icon]}
        </svg>
      </span>
      {title && <div className="crm-empty__title">{title}</div>}
      {children}
    </div>
  )
}

/** 버튼 안 로딩 스피너 */
export function Spinner() {
  return <span className="crm-spin" aria-hidden="true" />
}
