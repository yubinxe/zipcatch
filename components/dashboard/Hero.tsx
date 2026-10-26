'use client'

import Link from 'next/link'
import { Icon, StatusPill } from '@/components/ui'
import type { HeroAnnouncement } from '@/lib/announcement-helpers'

function HeroStat({ label, value, hot }: { label: string; value: string; hot?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: 13, color: 'var(--ink-3)', fontWeight: 550, marginBottom: 5, whiteSpace: 'nowrap' }}>{label}</div>
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

export default function Hero({ items }: { items: HeroAnnouncement[] }) {
  if (items.length === 0) {
    return (
      <section className="rise" style={{ marginBottom: 'var(--gap)' }}>
        <div style={{ fontSize: 15, color: 'var(--ink-3)', textAlign: 'center', padding: '32px 0' }}>
          현재 접수 중이거나 마감 임박인 분양이 없습니다. 분양정보 탭에서 전체 목록을 확인하세요.
        </div>
      </section>
    )
  }

  return (
    <section style={{ marginBottom: 'var(--gap)' }}>
      <div
        className="rise"
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          gap: 16,
          marginBottom: 18,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 7,
              padding: '5px 12px',
              borderRadius: 99,
              background: 'var(--hot-soft)',
              color: 'var(--hot)',
              fontSize: 13.5,
              fontWeight: 700,
              marginBottom: 14,
              whiteSpace: 'nowrap',
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: 99,
                background: 'var(--hot)',
                animation: 'pulseDot 1.6s ease-in-out infinite',
              }}
            />
            지금 청약 가능
          </div>
          <h1 style={{ margin: 0, fontSize: 40, fontWeight: 760, letterSpacing: '-0.035em', lineHeight: 1.08, color: 'var(--ink)' }}>
            놓치면 안 되는
            <br />
            이번 주 청약 일정
          </h1>
        </div>
        <p style={{ margin: 0, fontSize: 15, color: 'var(--ink-2)', maxWidth: 280, lineHeight: 1.55, fontWeight: 450 }}>
          마감이 임박한 단지를 한눈에. 카드를 눌러 상세 일정과 경쟁률을 확인하세요.
        </p>
      </div>

      <div
        className="hero-grid"
        style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--gap)' }}
      >
        {items.map((a, i) => (
          <Link
            key={a.id}
            href={`/property/${encodeURIComponent(a.id)}`}
            className="hero-card-link rise"
            style={{ animationDelay: `${i * 90 + 60}ms`, textDecoration: 'none', color: 'inherit' }}
          >
            <article className="hero-card" style={{ height: '100%' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                <StatusPill status={a.status} pulse={a.status === 'soon'} />
                {a.status === 'soon' ? (
                  <div style={{ textAlign: 'right' }}>
                    <div
                      className="tnum"
                      style={{
                        fontSize: 30,
                        fontWeight: 800,
                        letterSpacing: '-0.04em',
                        color: 'var(--hot)',
                        lineHeight: 1,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      D-{a.dday}
                    </div>
                  </div>
                ) : (
                  <div className="tnum" style={{ fontSize: 15, fontWeight: 650, color: 'var(--ink-3)', whiteSpace: 'nowrap' }}>
                    D-{a.dday}
                  </div>
                )}
              </div>
              <h3 style={{ margin: '20px 0 6px', fontSize: 22, fontWeight: 720, letterSpacing: '-0.025em', color: 'var(--ink)' }}>
                {a.name}
              </h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--ink-3)', fontSize: 14.5, fontWeight: 500 }}>
                <Icon name="pin" size={14} />
                {a.sido} {a.gu} · {a.builder}
              </div>
              <div style={{ display: 'flex', gap: 26, marginTop: 22, paddingTop: 20, borderTop: '1px solid var(--line)' }}>
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
    </section>
  )
}
