/**
 * 서울 분양아파트 기본현황(HUG · 공공데이터포털 15152174)을 화면이 읽을 모양으로 — 순수 함수만.
 *
 * 원자료는 사업장명 · 사업구분 · 세대수 · 분양 개시일 네 칸이다. 공정률(공사 진척)이 아니라
 * '언제, 어떤 방식으로, 몇 세대가 분양됐나'의 이력이다.
 *
 * 1,432곳 가운데 998곳은 분양 개시일이 비어 있다(2026-10 실측). 그 사업장을 버리거나 아무
 * 해에 넣지 않는다 — 연도별 그래프에서는 빼고 '개시일 미표기'로 따로 센다.
 */

export interface SeoulRow {
  사업장명?: string | null
  사업구분?: string | null
  세대수?: number | string | null
  '분양 개시일'?: string | null
}

/** 그래프의 색 묶음 — 많은 셋과 나머지 */
export const SUPPLY_GROUPS = ['재건축', '재개발', '일반분양', '기타'] as const
export type SupplyGroup = (typeof SUPPLY_GROUPS)[number]

export interface SeoulYear {
  year: string
  sites: number
  households: number
  byGroup: Record<SupplyGroup, number>
}

export interface SeoulSupplyRead {
  sites: number
  households: number
  /** 분양 개시일이 비어 연도별 그래프에 넣지 못한 사업장 수 */
  undated: number
  byType: { type: string; sites: number; households: number }[]
  years: SeoulYear[]
  recent: { name: string; type: string; households: number | null; date: string }[]
  /** 자료 안에서 가장 늦은 분양 개시일 */
  latest: string | null
}

const groupOf = (t: string): SupplyGroup =>
  t === '재건축' || t === '재개발' || t === '일반분양' ? t : '기타'

function n(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const x = Number(String(v).replace(/[,\s]/g, ''))
  return Number.isFinite(x) && x >= 0 ? x : null
}

export function readSeoulSupply(rows: SeoulRow[]): SeoulSupplyRead {
  const types = new Map<string, { sites: number; households: number }>()
  const years = new Map<string, SeoulYear>()
  const dated: SeoulSupplyRead['recent'] = []
  let households = 0
  let undated = 0

  for (const r of rows) {
    const type = String(r.사업구분 ?? '').trim() || '구분 미표기'
    const h = n(r.세대수)
    households += h ?? 0
    const t = types.get(type) ?? { sites: 0, households: 0 }
    t.sites++
    t.households += h ?? 0
    types.set(type, t)

    const date = String(r['분양 개시일'] ?? '').trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      undated++
      continue
    }
    const year = date.slice(0, 4)
    const y = years.get(year) ?? { year, sites: 0, households: 0, byGroup: { 재건축: 0, 재개발: 0, 일반분양: 0, 기타: 0 } }
    y.sites++
    y.households += h ?? 0
    y.byGroup[groupOf(type)] += h ?? 0
    years.set(year, y)
    dated.push({ name: String(r.사업장명 ?? '').trim() || '이름 미표기 사업장', type, households: h, date })
  }

  dated.sort((a, b) => b.date.localeCompare(a.date))
  return {
    sites: rows.length,
    households,
    undated,
    byType: [...types.entries()].map(([type, v]) => ({ type, ...v })).sort((a, b) => b.sites - a.sites),
    years: [...years.values()].sort((a, b) => a.year.localeCompare(b.year)),
    recent: dated.slice(0, 8),
    latest: dated[0]?.date ?? null,
  }
}
