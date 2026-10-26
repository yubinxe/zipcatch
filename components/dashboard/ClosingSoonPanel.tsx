'use client'

import Link from 'next/link'
import { forwardRef } from 'react'
import { Icon, StatusPill } from '@/components/ui'
import { CLOSING_SOON_DAYS, type HeroAnnouncement } from '@/lib/announcement-helpers'

function HeroStat({ label, value, hot }: { label: string; value: string; hot?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: 13, color: 'var(--ink-3)', fontWeight: 550, marginBottom: 5, whiteSpace: 'nowrap' }}>
        {label}
      </div>
      <div
        className="tnum"
        style={{
          fontSize: 15,
          fontWeight: 700,
          color: hot ? 'var(--hot)' : 'var(--ink)',
          letterSpacing: '-0.01em',
          whiteSpace: 'nowrap',
        }}
      >
        {value}
      </div>
    </div>
  )
}

const ClosingSoonPanel = forwardRef<
  HTMLElement,
  {
    items: HeroAnnouncement[]
    onClose: () => void
  }
>(function ClosingSoonPanel({ items, onClose }, ref) {
  return (
    <section ref={ref} className="closing-soon-panel rise" aria-labelledby="closing-soon-title">
      <div className="closing-soon-panel__head">
        <div>
          <div className="closing-soon-panel__badge">
            <Icon name="clock" size={14} />
            마감 {CLOSING_SOON_DAYS}일 이내
          </div>
          <h2 id="closing-soon-title" className="closing-soon-panel__title">
            마감 임박 분양
            <span className="closing-soon-panel__count tnum">{items.length}</span>
          </h2>
          <p className="closing-soon-panel__desc">
            오늘 기준 접수 마감까지 {CLOSING_SOON_DAYS}일 이하로 남은 단지입니다. 카드를 눌러 일정과 상세를 확인하세요.
          </p>
        </div>
        <button type="button" className="closing-soon-panel__close" onClick={onClose} aria-label="목록 닫기">
          <Icon name="x" size={18} />
        </button>
      </div>

      {items.length === 0 ? (
        <div className="closing-soon-panel__empty">
          현재 마감 {CLOSING_SOON_DAYS}일 이내인 접수 중 분양이 없습니다.
        </div>
      ) : (
        <div className="closing-soon-panel__grid">
          {items.map((a, i) => (
            <Link
              key={a.id}
              href={`/property/${encodeURIComponent(a.id)}`}
              className="hero-card-link rise"
              style={{ animationDelay: `${i * 50 + 40}ms`, textDecoration: 'none', color: 'inherit' }}
            >
              <article className="hero-card" style={{ height: '100%' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                  <StatusPill status={a.status} pulse />
                  <div style={{ textAlign: 'right' }}>
                    <div
                      className="tnum closing-soon-dday"
                      data-urgent={a.dday <= 2 ? 'true' : 'false'}
                    >
                      D-{a.dday}
                    </div>
                    <div className="closing-soon-dday-label">마감까지</div>
                  </div>
                </div>
                <h3 className="closing-soon-card__name">{a.name}</h3>
                <div className="closing-soon-card__meta">
                  <Icon name="pin" size={14} />
                  {a.sido} {a.gu} · {a.builder}
                </div>
                <div className="closing-soon-card__stats">
                  <HeroStat label="청약 기간" value={`${a.open.slice(5)} ~ ${a.close.slice(5)}`} />
                  <HeroStat label="분양세대" value={a.units.toLocaleString()} />
                </div>
                <div className="hero-card-cta">
                  <span>상세 보기</span>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M5 12h14M13 6l6 6-6 6" />
                  </svg>
                </div>
              </article>
            </Link>
          ))}
        </div>
      )}
    </section>
  )
})

export default ClosingSoonPanel
