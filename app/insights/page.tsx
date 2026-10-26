'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { format, subMonths } from 'date-fns'
import { fetchAnnouncements } from '@/lib/api'
import { buildDashboardSummary } from '@/lib/announcement-helpers'
import type { DashboardKpi } from '@/lib/announcement-helpers'
import { Icon } from '@/components/ui'
import SiteHeader from '@/components/layout/SiteHeader'
import Hero from '@/components/dashboard/Hero'
import KpiStrip from '@/components/dashboard/KpiStrip'
import ClosingSoonPanel from '@/components/dashboard/ClosingSoonPanel'
import type { HeroAnnouncement } from '@/lib/announcement-helpers'

const AnnouncementTab = dynamic(() => import('@/components/announcements/AnnouncementTab'), { ssr: false })
const CompetitionTab = dynamic(() => import('@/components/competition/CompetitionTab'), { ssr: false })
const WinnersTab = dynamic(() => import('@/components/winners/WinnersTab'), { ssr: false })
const PredictionTab = dynamic(() => import('@/components/prediction/PredictionTab'), { ssr: false })
const HotMapTab = dynamic(() => import('@/components/hotmap/HotMapTab'), { ssr: false })

type TabId = 'ann' | 'comp' | 'win' | 'predict' | 'map'

const TABS: { id: TabId; label: string; icon: 'home' | 'chart' | 'users' | 'spark' | 'pin' }[] = [
  { id: 'ann', label: '분양정보', icon: 'home' },
  { id: 'comp', label: '경쟁률 현황', icon: 'chart' },
  { id: 'map', label: '핫플레이스', icon: 'pin' },
  { id: 'win', label: '당첨자 통계', icon: 'users' },
  { id: 'predict', label: '가점 비교', icon: 'spark' },
]

const EMPTY_KPI: DashboardKpi = {
  openCount: 0,
  soonCount: 0,
  totalUnits: 0,
  updated: '—',
}

export default function Page() {
  const [tab, setTab] = useState<TabId>('ann')
  const [dark, setDark] = useState(false)
  const [heroItems, setHeroItems] = useState<HeroAnnouncement[]>([])
  const [closingSoonItems, setClosingSoonItems] = useState<HeroAnnouncement[]>([])
  const [soonPanelOpen, setSoonPanelOpen] = useState(false)
  const [kpi, setKpi] = useState<DashboardKpi>(EMPTY_KPI)
  const [dashLoading, setDashLoading] = useState(true)
  const soonPanelRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const today = new Date()
    const dateFrom = format(subMonths(today, 2), 'yyyy-MM-dd')
    const dateTo = format(subMonths(today, -2), 'yyyy-MM-dd')

    fetchAnnouncements({ page: 1, perPage: 120, dateFrom, dateTo })
      .then(res => {
        const summary = buildDashboardSummary(res.data ?? [])
        setHeroItems(summary.heroItems)
        setClosingSoonItems(summary.closingSoonItems)
        setKpi(summary.kpi)
      })
      .catch(() => {
        setHeroItems([])
        setClosingSoonItems([])
        setKpi(EMPTY_KPI)
      })
      .finally(() => setDashLoading(false))
  }, [])

  const toggleSoonPanel = useCallback(() => {
    setSoonPanelOpen(prev => {
      const next = !prev
      if (next) {
        requestAnimationFrame(() => {
          soonPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
        })
      }
      return next
    })
  }, [])

  const toggleDark = () => {
    const next = !dark
    setDark(next)
    document.documentElement.setAttribute('data-theme', next ? 'dark' : 'light')
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-sub)' }}>
      <SiteHeader dark={dark} onToggleTheme={toggleDark} updated={kpi.updated} />

      <main className="dash-main" style={{ maxWidth: 1240, margin: '0 auto', padding: '40px 32px 80px' }}>
        {dashLoading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gap)', marginBottom: 'var(--gap)' }}>
            <div style={{ height: 120, borderRadius: 'var(--r-lg)', background: 'var(--track)' }} />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--gap)' }}>
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} style={{ height: 88, borderRadius: 'var(--r-md)', background: 'var(--track)' }} />
              ))}
            </div>
          </div>
        ) : (
          <>
            <Hero items={heroItems} />
            <KpiStrip
              kpi={kpi}
              soonPanelOpen={soonPanelOpen}
              onSoonClick={toggleSoonPanel}
            />
            {soonPanelOpen && (
              <ClosingSoonPanel
                ref={soonPanelRef}
                items={closingSoonItems}
                onClose={() => setSoonPanelOpen(false)}
              />
            )}
          </>
        )}

        <div style={{ display: 'flex', justifyContent: 'center', margin: '8px 0 var(--gap)', overflowX: 'auto' }}>
          <div
            className="tab-bar"
            style={{
              display: 'inline-flex',
              gap: 4,
              padding: 4,
              borderRadius: 14,
              background: 'var(--bg-sub)',
              border: '1px solid var(--line)',
            }}
          >
            {TABS.map(t => {
              const on = tab === t.id
              return (
                <button
                  key={t.id}
                  type="button"
                  className="tab-btn"
                  data-active={on ? 'true' : 'false'}
                  onClick={() => setTab(t.id)}
                >
                  <Icon name={t.icon} size={17} />
                  {t.label}
                </button>
              )
            })}
          </div>
        </div>

        <div key={tab} style={{ animation: 'fadeIn .45s ease both' }}>
          {tab === 'ann' && <AnnouncementTab />}
          {tab === 'comp' && <CompetitionTab />}
          {tab === 'win' && <WinnersTab />}
          {tab === 'predict' && <PredictionTab />}
          {tab === 'map' && <HotMapTab />}
        </div>
      </main>

      <footer style={{ borderTop: '1px solid var(--line)', padding: '24px 32px', textAlign: 'center' }}>
        <p style={{ margin: 0, fontSize: 14, color: 'var(--ink-3)' }}>
          데이터 출처: 공공데이터포털 청약홈 OpenAPI · 한국부동산원
        </p>
      </footer>
    </div>
  )
}
