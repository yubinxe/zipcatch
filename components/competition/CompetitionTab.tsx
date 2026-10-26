'use client'

import { useState, useEffect } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts'
import { fetchCompetitionStats, fetchCompetitionSearch, fetchSpecialSupply } from '@/lib/api'
import type { CompetitionStatItem, CompetitionItem, SpecialSupplyItem } from '@/lib/types'
import { CardHead } from '@/components/ui'

const SPECIAL_LABELS: Record<string, string> = {
  MNYCH_HSHLDCO: '다자녀',
  NWWDS_NMTW_HSHLDCO: '신혼부부',
  LFE_FRST_HSHLDCO: '생애최초',
  YGMN_HSHLDCO: '청년',
  OLD_PARNTS_SUPORT_HSHLDCO: '노부모부양',
  NWBB_NWBBSHR_HSHLDCO: '신생아',
  INSTT_RECOMEND_HSHLDCO: '기관추천',
}

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

export default function CompetitionTab() {
  // ── 지역별 경쟁률 통계 ─────────────────────────────
  const [allStats, setAllStats]                   = useState<CompetitionStatItem[]>([])
  const [availableMonths, setAvailableMonths]     = useState<string[]>([])
  const [selectedMonth, setSelectedMonth]         = useState('')
  const [statsLoading, setStatsLoading]           = useState(true)
  const [statsError, setStatsError]               = useState('')

  useEffect(() => {
    fetchCompetitionStats({ month: '' })
      .then(r => {
        const data = r.data ?? []
        setAllStats(data)
        const months = [...new Set(data.map(d => d.STAT_DE))].sort().reverse()
        setAvailableMonths(months)
        if (months.length > 0) setSelectedMonth(months[0])
      })
      .catch(() => setStatsError('데이터 로드 오류'))
      .finally(() => setStatsLoading(false))
  }, [])

  const chartData = allStats
    .filter(d => d.STAT_DE === selectedMonth)
    .map(d => ({
      name: d.SUBSCRPT_AREA_CODE_NM,
      특별공급: parseFloat(d.SPSPLY_CMPET_RATE) || 0,
      일반공급: parseFloat(d.SUPLY_CMPET_RATE) || 0,
    }))

  // ── 단지별 경쟁률 검색 ──────────────────────────────
  const [pblancNo, setPblancNo]               = useState('')
  const [searchInput, setSearchInput]         = useState('')
  const [compData, setCompData]               = useState<CompetitionItem[]>([])
  const [spData, setSpData]                   = useState<SpecialSupplyItem[]>([])
  const [searchLoading, setSearchLoading]     = useState(false)
  const [searchError, setSearchError]         = useState('')

  const handleSearch = async () => {
    if (!searchInput.trim()) return
    setSearchLoading(true)
    setSearchError('')
    try {
      const [comp, sp] = await Promise.all([
        fetchCompetitionSearch({ pblancNo: searchInput.trim() }),
        fetchSpecialSupply({ pblancNo: searchInput.trim() }),
      ])
      setCompData(comp.data ?? [])
      setSpData(sp.data ?? [])
      setPblancNo(searchInput.trim())
    } catch {
      setSearchError('검색 중 오류가 발생했습니다.')
    } finally {
      setSearchLoading(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gap)' }}>
      {/* ── 지역별 경쟁률 통계 ── */}
      <div className="rise" style={cardStyle}>
        <CardHead
          title="지역별 청약 경쟁률"
          sub="특별공급 / 일반공급 경쟁률 비교"
          right={
            availableMonths.length > 0 ? (
              <SelectWrap
                value={selectedMonth}
                onChange={setSelectedMonth}
                options={availableMonths.map(m => ({ value: m, label: fmtMonth(m) }))}
              />
            ) : undefined
          }
        />

        {statsLoading ? (
          <div style={{ height: 280, borderRadius: 12, background: 'var(--track)' }} />
        ) : statsError ? (
          <div style={{ height: 280, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--hot)', fontSize: 15 }}>{statsError}</div>
        ) : chartData.length === 0 ? (
          <div style={{ height: 280, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink-3)', fontSize: 15 }}>데이터가 없습니다</div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 44 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
              <XAxis dataKey="name" tick={{ fontSize: 13, fill: 'var(--ink-3)' }} angle={-30} textAnchor="end" interval={0} />
              <YAxis tick={{ fontSize: 12.5, fill: 'var(--ink-3)' }} tickFormatter={v => `${v}:1`} />
              <Tooltip
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                formatter={(value: any) => [`${Number(value).toFixed(2)}:1`]}
                contentStyle={{ borderRadius: 12, border: '1px solid var(--line)', background: 'var(--surface)', fontSize: 13, color: 'var(--ink)' }}
              />
              <Legend wrapperStyle={{ fontSize: 13, paddingTop: 8, color: 'var(--ink-2)' }} />
              <Bar dataKey="특별공급" fill="var(--accent)" radius={[5, 5, 0, 0]} />
              <Bar dataKey="일반공급" fill="var(--pos)" radius={[5, 5, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* ── 단지별 경쟁률 검색 ── */}
      <div className="rise" style={{ ...cardStyle, animationDelay: '80ms' }}>
        <CardHead title="단지별 경쟁률 상세 조회" sub="공고번호(PBLANC_NO)를 입력하면 주택형별 경쟁률과 특별공급 현황을 확인할 수 있습니다" />

        <div style={{ display: 'flex', gap: 10, marginBottom: 24 }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <span style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-3)', display: 'flex' }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
            </span>
            <input
              type="text"
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              placeholder="공고번호 입력 (예: 2026000219)"
              style={{
                width: '100%', padding: '10px 14px 10px 38px',
                borderRadius: 'var(--r-sm)', border: '1px solid var(--line)',
                background: 'var(--surface)', color: 'var(--ink)',
                fontSize: 14.5, fontFamily: 'inherit', outline: 'none',
              }}
            />
          </div>
          <button
            type="button"
            className="btn-ink"
            onClick={handleSearch}
            disabled={searchLoading}
            style={{
              padding: '10px 22px',
              opacity: searchLoading ? 0.6 : 1,
              cursor: searchLoading ? 'not-allowed' : 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {searchLoading ? '검색 중...' : '조회'}
          </button>
        </div>

        {searchError && <p style={{ color: 'var(--hot)', fontSize: 14.5, marginBottom: 16 }}>{searchError}</p>}

        {pblancNo && !searchLoading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* 경쟁률 */}
            {compData.length > 0 && (
              <div>
                <div style={{ fontSize: 15, fontWeight: 650, color: 'var(--ink-2)', marginBottom: 10 }}>주택형별 경쟁률</div>
                <div style={{ overflowX: 'auto', borderRadius: 'var(--r-md)', border: '1px solid var(--line)' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 500 }}>
                    <thead>
                      <tr>
                        {['주택형', '공급세대', '거주구분', '신청건수', '경쟁률'].map((h, i) => (
                          <th key={h} style={{ ...thStyle, textAlign: i >= 1 ? 'right' : 'left' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {compData.map((item, i) => {
                        const rate = parseFloat(item.CMPET_RATE)
                        const rateColor = rate >= 10 ? 'var(--hot)' : rate >= 3 ? 'var(--warn)' : 'var(--pos)'
                        return (
                          <tr key={i} className="rowhover">
                            <td style={{ padding: '13px 18px', fontSize: 14.5, fontWeight: 650, color: 'var(--ink)', borderBottom: '1px solid var(--line)' }}>{item.HOUSE_TY}</td>
                            <td style={{ padding: '13px 18px', textAlign: 'right', fontSize: 14.5, color: 'var(--ink-2)', borderBottom: '1px solid var(--line)' }} className="tnum">{Number(item.SUPLY_HSHLDCO).toLocaleString()}</td>
                            <td style={{ padding: '13px 18px', fontSize: 14.5, color: 'var(--ink-2)', borderBottom: '1px solid var(--line)' }}>{item.RESIDE_SENM}</td>
                            <td style={{ padding: '13px 18px', textAlign: 'right', fontSize: 14.5, color: 'var(--ink-2)', borderBottom: '1px solid var(--line)' }} className="tnum">{Number(item.REQ_CNT).toLocaleString()}</td>
                            <td style={{ padding: '13px 18px', textAlign: 'right', borderBottom: '1px solid var(--line)' }} className="tnum">
                              <span style={{ fontSize: 15, fontWeight: 700, color: item.CMPET_RATE === '-' ? 'var(--ink-3)' : rateColor }}>
                                {item.CMPET_RATE === '-' ? '-' : `${parseFloat(item.CMPET_RATE).toFixed(2)}:1`}
                              </span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* 특별공급 */}
            {spData.length > 0 && (
              <div>
                <div style={{ fontSize: 15, fontWeight: 650, color: 'var(--ink-2)', marginBottom: 10 }}>특별공급 신청현황</div>
                <div style={{ overflowX: 'auto', borderRadius: 'var(--r-md)', border: '1px solid var(--line)' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th style={thStyle}>주택형</th>
                        <th style={{ ...thStyle, textAlign: 'right' }}>특별공급</th>
                        {Object.entries(SPECIAL_LABELS).map(([key, label]) => (
                          <th key={key} style={{ ...thStyle, textAlign: 'right' }}>{label}</th>
                        ))}
                        <th style={thStyle}>결과</th>
                      </tr>
                    </thead>
                    <tbody>
                      {spData.map((item, i) => (
                        <tr key={i} className="rowhover">
                          <td style={{ padding: '13px 18px', fontSize: 14.5, fontWeight: 650, color: 'var(--ink)', borderBottom: '1px solid var(--line)' }}>{item.HOUSE_TY}</td>
                          <td style={{ padding: '13px 18px', textAlign: 'right', fontSize: 14.5, color: 'var(--ink-2)', borderBottom: '1px solid var(--line)' }} className="tnum">{Number(item.SPSPLY_HSHLDCO).toLocaleString()}</td>
                          {Object.keys(SPECIAL_LABELS).map(key => (
                            <td key={key} style={{ padding: '13px 18px', textAlign: 'right', fontSize: 14.5, color: 'var(--ink-2)', borderBottom: '1px solid var(--line)' }} className="tnum">
                              {item[key as keyof SpecialSupplyItem] || '-'}
                            </td>
                          ))}
                          <td style={{ padding: '13px 18px', fontSize: 14, color: 'var(--ink-2)', borderBottom: '1px solid var(--line)', whiteSpace: 'nowrap' }}>{item.SUBSCRPT_RESULT_NM || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {compData.length === 0 && spData.length === 0 && (
              <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--ink-3)', fontSize: 15 }}>
                해당 공고번호의 데이터가 없습니다
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
