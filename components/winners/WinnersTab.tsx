'use client'

import { useState, useEffect } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts'
import { fetchWinnersAge, fetchWinnersRegion, fetchWinnersScore } from '@/lib/api'
import type { AgeStatItem, AreaStatItem, ScoreStatItem } from '@/lib/types'
import { CardHead } from '@/components/ui'

function fmtMonth(ym: string) {
  if (!ym || ym.length < 6) return ym
  return `${ym.slice(0, 4)}년 ${ym.slice(4, 6)}월`
}

const cardStyle: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--line)',
  borderRadius: 'var(--r-lg)',
  boxShadow: 'var(--shadow)',
  padding: 'var(--pad-card)',
}

const selectStyle: React.CSSProperties = {
  padding: '9px 32px 9px 14px',
  borderRadius: 'var(--r-sm)',
  border: '1px solid var(--line)',
  background: 'var(--surface)',
  color: 'var(--ink)',
  fontSize: 14.5,
  fontFamily: 'inherit',
  outline: 'none',
  appearance: 'none',
  WebkitAppearance: 'none',
  cursor: 'pointer',
}

function SelectWrap({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  if (options.length === 0) return null
  return (
    <div style={{ position: 'relative', display: 'inline-flex' }}>
      <select value={value} onChange={e => onChange(e.target.value)} style={selectStyle}>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--ink-3)', display: 'flex' }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6" /></svg>
      </span>
    </div>
  )
}

function ScoreCard({ label, value, sub, accent }: { label: string; value: string | number; sub?: string; accent?: boolean }) {
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--line)',
      borderRadius: 'var(--r-md)', padding: '20px 22px',
      boxShadow: 'var(--shadow)',
    }}>
      <div style={{ fontSize: 14, color: 'var(--ink-3)', fontWeight: 550 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginTop: 10 }}>
        <span className="tnum" style={{
          fontSize: 38, fontWeight: 760, letterSpacing: '-0.04em', lineHeight: 1,
          color: accent ? 'var(--accent)' : 'var(--ink)',
        }}>
          {value}
        </span>
        <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink-3)' }}>점</span>
      </div>
      {sub && <div style={{ fontSize: 13.5, color: 'var(--ink-3)', marginTop: 10, fontWeight: 450 }}>{sub}</div>}
    </div>
  )
}

const thStyle: React.CSSProperties = {
  padding: '13px 18px',
  fontSize: 13,
  fontWeight: 650,
  color: 'var(--ink-3)',
  letterSpacing: '0.02em',
  whiteSpace: 'nowrap',
  textAlign: 'left',
  background: 'var(--surface-2)',
  borderBottom: '1px solid var(--line)',
}

const REGIONS = [
  { code: '', name: '전체' },
  { code: '100', name: '서울' }, { code: '200', name: '강원' }, { code: '300', name: '대전' },
  { code: '312', name: '충남' }, { code: '338', name: '세종' }, { code: '360', name: '충북' },
  { code: '400', name: '인천' }, { code: '410', name: '경기' }, { code: '500', name: '광주' },
  { code: '513', name: '전남' }, { code: '560', name: '전북' }, { code: '600', name: '부산' },
  { code: '621', name: '경남' }, { code: '680', name: '울산' }, { code: '690', name: '제주' },
  { code: '700', name: '대구' }, { code: '712', name: '경북' },
]

const Skeleton = ({ h = 240 }: { h?: number }) => (
    <div style={{ height: h, borderRadius: 12, background: 'var(--track)' }} />
  )

export default function WinnersTab() {
  // ── 연령별 통계 ─────────────────────────────────────
  const [allAgeApplicants, setAllAgeApplicants] = useState<AgeStatItem[]>([])
  const [allAgeWinners, setAllAgeWinners]       = useState<AgeStatItem[]>([])
  const [ageMonths, setAgeMonths]               = useState<string[]>([])
  const [ageMonth, setAgeMonth]                 = useState('')
  const [ageMode, setAgeMode]                   = useState<'applicants' | 'winners'>('winners')
  const [ageLoading, setAgeLoading]             = useState(true)

  useEffect(() => {
    fetchWinnersAge({ monthFrom: '', monthTo: '' })
      .then(r => {
        setAllAgeApplicants(r.applicants)
        setAllAgeWinners(r.winners)
        const months = [...new Set([
          ...r.applicants.map(d => d.STAT_DE),
          ...r.winners.map(d => d.STAT_DE),
        ])].sort().reverse()
        setAgeMonths(months)
        if (months.length > 0) setAgeMonth(months[0])
      })
      .catch(() => {})
      .finally(() => setAgeLoading(false))
  }, [])

  const ageSource = ageMode === 'applicants' ? allAgeApplicants : allAgeWinners
  const currentAgeItem = ageSource.find(d => d.STAT_DE === ageMonth)
  const ageChartData = currentAgeItem ? [
    { name: '30대', value: Number(currentAgeItem.AGE_30) || 0 },
    { name: '40대', value: Number(currentAgeItem.AGE_40) || 0 },
    { name: '50대', value: Number(currentAgeItem.AGE_50) || 0 },
    { name: '60대+', value: Number(currentAgeItem.AGE_60) || 0 },
  ] : []

  // ── 지역별 통계 ─────────────────────────────────────
  const [allRegionApplicants, setAllRegionApplicants] = useState<AreaStatItem[]>([])
  const [allRegionWinners, setAllRegionWinners]       = useState<AreaStatItem[]>([])
  const [regionMonths, setRegionMonths]               = useState<string[]>([])
  const [regionMonth, setRegionMonth]                 = useState('')
  const [regionLoading, setRegionLoading]             = useState(true)

  useEffect(() => {
    fetchWinnersRegion({ month: '' })
      .then(r => {
        setAllRegionApplicants(r.applicants)
        setAllRegionWinners(r.winners)
        const months = [...new Set([
          ...r.applicants.map(d => d.STAT_DE),
          ...r.winners.map(d => d.STAT_DE),
        ])].sort().reverse()
        setRegionMonths(months)
        if (months.length > 0) setRegionMonth(months[0])
      })
      .catch(() => {})
      .finally(() => setRegionLoading(false))
  }, [])

  const regionMap = new Map<string, { name: string; 신청자: number; 당첨자: number }>()
  allRegionApplicants
    .filter(d => d.STAT_DE === regionMonth)
    .forEach(r => {
      regionMap.set(r.SUBSCRPT_AREA_CODE, {
        name: r.SUBSCRPT_AREA_CODE_NM,
        신청자: Number(r.AGE_30) + Number(r.AGE_40) + Number(r.AGE_50) + Number(r.AGE_60),
        당첨자: 0,
      })
    })
  allRegionWinners
    .filter(d => d.STAT_DE === regionMonth)
    .forEach(r => {
      const prev = regionMap.get(r.SUBSCRPT_AREA_CODE)
      if (prev) prev.당첨자 = Number(r.AGE_30) + Number(r.AGE_40) + Number(r.AGE_50) + Number(r.AGE_60)
    })
  const regionChartData = Array.from(regionMap.values())

  // ── 가점 통계 ────────────────────────────────────────
  const [allScoreData, setAllScoreData] = useState<ScoreStatItem[]>([])
  const [scoreMonths, setScoreMonths]   = useState<string[]>([])
  const [scoreMonth, setScoreMonth]     = useState('')
  const [scoreRegion, setScoreRegion]   = useState('')
  const [scoreLoading, setScoreLoading] = useState(false)

  useEffect(() => {
    fetchWinnersScore({ month: '', region: scoreRegion })
      .then(r => {
        const data = r.data ?? []
        setAllScoreData(data)
        const months = [...new Set(data.map(d => d.STAT_DE))].sort().reverse()
        setScoreMonths(months)
        if (months.length > 0) setScoreMonth(months[0])
      })
      .catch(() => {})
      .finally(() => setScoreLoading(false))
  }, [scoreRegion])

  const filteredScore = allScoreData.filter(d =>
    d.STAT_DE === scoreMonth && (!scoreRegion || d.SUBSCRPT_AREA_CODE === scoreRegion)
  )

  const avgScore = filteredScore.length > 0
    ? (filteredScore.reduce((s, d) => s + parseFloat(d.AVRG_SCORE || '0'), 0) / filteredScore.length).toFixed(1)
    : '-'
  const maxTop = filteredScore.length > 0
    ? Math.max(...filteredScore.map(d => parseFloat(d.TOP_SCORE || '0'))).toString()
    : '-'
  const minLow = filteredScore.length > 0
    ? Math.min(...filteredScore.map(d => parseFloat(d.LWET_SCORE || '0'))).toString()
    : '-'
  const medScore = filteredScore.length > 0
    ? (filteredScore.reduce((s, d) => s + parseFloat(d.MED_SCORE || '0'), 0) / filteredScore.length).toFixed(1)
    : '-'



  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gap)' }}>
      {/* ── 연령대별 현황 ── */}
      <div className="rise" style={cardStyle}>
        <CardHead
          title="연령대별 현황"
          sub="30대 ~ 60대 이상 분포"
          wrapRight
          right={
            <>
              <div style={{
                display: 'inline-flex', borderRadius: 10, overflow: 'hidden',
                border: '1px solid var(--line)', fontSize: 14.5,
              }}>
                {(['applicants', 'winners'] as const).map(mode => (
                  <button key={mode} onClick={() => setAgeMode(mode)} style={{
                    padding: '8px 16px', border: 'none',
                    background: ageMode === mode ? 'var(--accent)' : 'transparent',
                    color: ageMode === mode ? '#fff' : 'var(--ink-2)',
                    fontWeight: 650, fontFamily: 'inherit', cursor: 'pointer',
                    transition: 'all .2s',
                  }}>
                    {mode === 'applicants' ? '신청자' : '당첨자'}
                  </button>
                ))}
              </div>
              <SelectWrap
                value={ageMonth}
                onChange={setAgeMonth}
                options={ageMonths.map(m => ({ value: m, label: fmtMonth(m) }))}
              />
            </>
          }
        />
        {ageLoading ? <Skeleton h={220} /> : ageChartData.length === 0 ? (
          <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink-3)', fontSize: 15 }}>데이터 없음</div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={ageChartData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
              <XAxis dataKey="name" tick={{ fontSize: 14, fill: 'var(--ink-3)' }} />
              <YAxis tick={{ fontSize: 12.5, fill: 'var(--ink-3)' }} tickFormatter={v => v.toLocaleString()} />
              <Tooltip
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                formatter={(v: any) => [Number(v).toLocaleString() + '명', ageMode === 'winners' ? '당첨자' : '신청자']}
                contentStyle={{ borderRadius: 12, border: '1px solid var(--line)', background: 'var(--surface)', fontSize: 13, color: 'var(--ink)' }}
              />
              <Bar dataKey="value" name={ageMode === 'winners' ? '당첨자' : '신청자'} fill="var(--accent)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* ── 지역별 신청·당첨자 ── */}
      <div className="rise" style={{ ...cardStyle, animationDelay: '60ms' }}>
        <CardHead
          title="지역별 신청·당첨자 현황"
          sub="전연령 합산 기준"
          right={
            <SelectWrap
              value={regionMonth}
              onChange={setRegionMonth}
              options={regionMonths.map(m => ({ value: m, label: fmtMonth(m) }))}
            />
          }
        />
        {regionLoading ? <Skeleton h={280} /> : regionChartData.length === 0 ? (
          <div style={{ height: 280, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink-3)', fontSize: 15 }}>데이터 없음</div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={regionChartData} margin={{ top: 4, right: 8, left: 0, bottom: 44 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
              <XAxis dataKey="name" tick={{ fontSize: 12.5, fill: 'var(--ink-3)' }} angle={-30} textAnchor="end" interval={0} />
              <YAxis tick={{ fontSize: 12.5, fill: 'var(--ink-3)' }} tickFormatter={v => v.toLocaleString()} />
              <Tooltip
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                formatter={(v: any, name: any) => [Number(v).toLocaleString() + '명', name]}
                contentStyle={{ borderRadius: 12, border: '1px solid var(--line)', background: 'var(--surface)', fontSize: 13, color: 'var(--ink)' }}
              />
              <Legend wrapperStyle={{ fontSize: 13, paddingTop: 8, color: 'var(--ink-2)' }} />
              <Bar dataKey="신청자" fill="var(--ink-3)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="당첨자" fill="var(--accent)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* ── 가점 통계 ── */}
      <div className="rise" style={{ ...cardStyle, animationDelay: '120ms' }}>
        <CardHead
          title="가점제 당첨 통계"
          sub="지역·거주구분별 가점 분포"
          wrapRight
          right={
            <>
              <SelectWrap
                value={scoreRegion}
                onChange={setScoreRegion}
                options={REGIONS.map(r => ({ value: r.code, label: r.name }))}
              />
              <SelectWrap
                value={scoreMonth}
                onChange={setScoreMonth}
                options={scoreMonths.map(m => ({ value: m, label: fmtMonth(m) }))}
              />
            </>
          }
        />

        {scoreLoading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} h={90} />)}
            </div>
            <Skeleton h={120} />
          </div>
        ) : (
          <>
            <div className="score-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 20 }}>
              <ScoreCard label="평균 가점" value={avgScore !== '-' ? avgScore : '-'} sub="선택 지역 평균" accent />
              <ScoreCard label="중위 가점" value={medScore !== '-' ? medScore : '-'} sub="중앙값" />
              <ScoreCard label="최고 가점" value={maxTop !== '-' ? maxTop : '-'} sub="최고 기록" />
              <ScoreCard label="최저 가점" value={minLow !== '-' ? minLow : '-'} sub="최저 기록(커트라인)" />
            </div>

            {filteredScore.length > 0 ? (
              <div style={{ overflowX: 'auto', borderRadius: 'var(--r-md)', border: '1px solid var(--line)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 500 }}>
                  <thead>
                    <tr>
                      {['지역', '거주구분', '평균', '중위', '최고', '최저'].map((h, i) => (
                        <th key={h} style={{ ...thStyle, textAlign: i >= 2 ? 'right' : 'left' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredScore.map((item, i) => (
                      <tr key={i} className="rowhover">
                        <td style={{ padding: '13px 18px', fontSize: 14.5, fontWeight: 650, color: 'var(--ink)', borderBottom: '1px solid var(--line)' }}>{item.SUBSCRPT_AREA_CODE_NM}</td>
                        <td style={{ padding: '13px 18px', fontSize: 14.5, color: 'var(--ink-2)', borderBottom: '1px solid var(--line)' }}>{item.RESIDE_SECD_NM}</td>
                        <td style={{ padding: '13px 18px', textAlign: 'right', fontSize: 15, fontWeight: 700, color: 'var(--accent)', borderBottom: '1px solid var(--line)' }} className="tnum">{item.AVRG_SCORE}점</td>
                        <td style={{ padding: '13px 18px', textAlign: 'right', fontSize: 14.5, color: 'var(--ink-2)', borderBottom: '1px solid var(--line)' }} className="tnum">{item.MED_SCORE}점</td>
                        <td style={{ padding: '13px 18px', textAlign: 'right', fontSize: 14.5, color: 'var(--pos)', borderBottom: '1px solid var(--line)' }} className="tnum">{item.TOP_SCORE}점</td>
                        <td style={{ padding: '13px 18px', textAlign: 'right', fontSize: 14.5, color: 'var(--ink-3)', borderBottom: '1px solid var(--line)' }} className="tnum">{item.LWET_SCORE}점</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--ink-3)', fontSize: 15 }}>
                해당 조건의 데이터가 없습니다
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
