import { molitKey, hasMolitKey } from '@/lib/config/data-portal-key'
import {
  compareHalves,
  dedupe,
  dongCounts,
  isProvisional,
  monthLabel,
  monthlySeries,
  normalizeRent,
  normalizeTrade,
  parsePage,
  recentDeals,
  recentMonths,
  selectDeals,
  type AreaBand,
  type DealKind,
  type FlowDeal,
  type HalfCompare,
  type HouseKind,
  type MonthPoint,
  dist,
  primaryValue,
  type Dist,
} from './flow-core'

/**
 * 실거래 흐름 — 국토교통부 실거래가 공개 API 를 지역·기간·거래 종류로 모아 읽는다.
 *
 * 기존 공고 상세의 견줌자(lib/adapters/molit-trade.ts · molit-rent.ts)는 공고 하나를
 * 위한 요약이고, 이것은 사용자가 지역을 골라 직접 들여다보는 화면을 위한 것이다.
 * 두 쪽이 같은 원칙(중앙값·해제 거래 제외·최소 표본)을 쓰되, 여기서는 그 앞의
 * 빈틈을 메운다.
 *
 *  - 한 달 응답이 1,000건을 넘으면 다음 페이지까지 읽는다(totalCount 기준).
 *  - 달마다 성공·실패를 따로 남긴다. 한 달을 못 읽었다고 0건으로 그리지 않는다.
 *  - 바깥 호출에는 제한 시간이 있고, 동시에 6개까지만 부른다.
 *  - 신고가 끝난 지난달은 하루, 신고 기한이 남은 달은 한 시간 캐시한다.
 */

const BASE = 'https://apis.data.go.kr/1613000'

const SERVICES: Record<'trade' | 'rent', Record<HouseKind, { path: string; label: string }>> = {
  trade: {
    APT: { path: 'RTMSDataSvcAptTrade/getRTMSDataSvcAptTrade', label: '아파트 매매 실거래가' },
    ROW: { path: 'RTMSDataSvcRHTrade/getRTMSDataSvcRHTrade', label: '연립다세대 매매 실거래가' },
    OFFI: { path: 'RTMSDataSvcOffiTrade/getRTMSDataSvcOffiTrade', label: '오피스텔 매매 실거래가' },
  },
  rent: {
    APT: { path: 'RTMSDataSvcAptRent/getRTMSDataSvcAptRent', label: '아파트 전월세 실거래가' },
    ROW: { path: 'RTMSDataSvcRHRent/getRTMSDataSvcRHRent', label: '연립다세대 전월세 실거래가' },
    OFFI: { path: 'RTMSDataSvcOffiRent/getRTMSDataSvcOffiRent', label: '오피스텔 전월세 실거래가' },
  },
}

const PAGE_SIZE = 1000
const MAX_PAGES = 8
const TIMEOUT_MS = 10000
const CONCURRENCY = 6

export const FLOW_MONTHS = [3, 6, 12, 24] as const
export type FlowMonths = (typeof FLOW_MONTHS)[number]

export interface FlowQuery {
  lawd: string
  months: FlowMonths
  kind: DealKind
  house: HouseKind
  band: AreaBand
  dong: string | null
}

interface MonthFetch {
  ym: string
  ok: boolean
  reason: string | null
  deals: FlowDeal[]
  canceled: number
  invalid: number
  /** 응답이 말한 총 건수와 실제로 읽은 건수 */
  total: number | null
  read: number
}

async function fetchPage(url: string, revalidate: number): Promise<string> {
  const res = await fetch(url, { next: { revalidate }, signal: AbortSignal.timeout(TIMEOUT_MS) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.text()
}

async function fetchMonth(group: 'trade' | 'rent', house: HouseKind, lawd: string, ym: string, now: Date): Promise<MonthFetch> {
  const svc = SERVICES[group][house]
  const revalidate = isProvisional(monthLabel(ym), now) ? 3600 : 86400
  const raw: Record<string, string>[] = []
  let total: number | null = null
  try {
    for (let page = 1; page <= MAX_PAGES; page++) {
      const params = new URLSearchParams({
        serviceKey: molitKey(),
        LAWD_CD: lawd,
        DEAL_YMD: ym,
        numOfRows: String(PAGE_SIZE),
        pageNo: String(page),
      })
      const parsed = parsePage(await fetchPage(`${BASE}/${svc.path}?${params}`, revalidate))
      if (parsed.error) throw new Error(parsed.error)
      total = parsed.totalCount
      raw.push(...parsed.rows)
      if (parsed.rows.length < PAGE_SIZE || total === null || raw.length >= total) break
    }
  } catch (err) {
    const reason =
      err instanceof Error ? (err.name === 'TimeoutError' ? '응답 시간 초과' : err.message) : '불러오지 못했습니다'
    return { ym, ok: false, reason, deals: [], canceled: 0, invalid: 0, total, read: raw.length }
  }
  if (group === 'trade') {
    const n = normalizeTrade(raw, ym)
    return { ym, ok: true, reason: null, deals: n.deals, canceled: n.canceled, invalid: n.invalid, total, read: raw.length }
  }
  const n = normalizeRent(raw, ym)
  return { ym, ok: true, reason: null, deals: n.deals, canceled: 0, invalid: n.invalid, total, read: raw.length }
}

/** 동시에 limit 개까지만 */
async function pool<T, R>(items: T[], limit: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++
        out[i] = await fn(items[i])
      }
    }),
  )
  return out
}

export type FlowStatus = 'ok' | 'partial' | 'error' | 'unconfigured'

export interface FlowResult {
  status: FlowStatus
  query: FlowQuery
  source: { label: string; endpoint: string; url: string; agency: string }
  fetchedAt: string
  months: { month: string; ok: boolean; reason: string | null; provisional: boolean; total: number | null; read: number }[]
  /** 조건에 맞는 거래 전체의 분포 */
  overall: Dist
  /** 매매만 — 전용 3.3㎡당 */
  overallPerPyeong: Dist | null
  /** 월세만 — 월 임대료 */
  overallRent: Dist | null
  series: MonthPoint[]
  halves: HalfCompare | null
  dongs: { dong: string; count: number }[]
  recent: FlowDeal[]
  quality: {
    /** 조건 전(동·면적·전월세 구분 전) 원자료 건수 */
    raw: number
    canceled: number
    invalid: number
    duplicates: number
    /** 읽지 못한 달 수 */
    failedMonths: number
    /** 페이지 상한 때문에 다 못 읽은 달 */
    truncatedMonths: number
  }
  /** CSV 등 원자료가 필요한 쪽에서만 쓴다 — 응답 JSON 에는 넣지 않는다 */
  deals?: FlowDeal[]
}

export async function readFlow(q: FlowQuery, opts: { withDeals?: boolean } = {}): Promise<FlowResult> {
  const group = q.kind === 'trade' ? 'trade' : 'rent'
  const svc = SERVICES[group][q.house]
  const now = new Date()
  const source = {
    label: svc.label,
    /** 호출한 오퍼레이션 — 공공데이터포털에서 같은 이름으로 찾을 수 있다 */
    endpoint: `apis.data.go.kr/1613000/${svc.path}`,
    /** 같은 자료를 사람이 직접 확인하는 곳 */
    url: 'https://rt.molit.go.kr/',
    agency: '국토교통부',
  }
  const yms = recentMonths(q.months, now)
  const empty = {
    overall: dist([]),
    overallPerPyeong: null,
    overallRent: null,
    series: [],
    halves: null,
    dongs: [],
    recent: [],
    quality: { raw: 0, canceled: 0, invalid: 0, duplicates: 0, failedMonths: 0, truncatedMonths: 0 },
  }
  if (!hasMolitKey()) {
    return {
      status: 'unconfigured',
      query: q,
      source,
      fetchedAt: now.toISOString(),
      months: yms.map(ym => ({ month: monthLabel(ym), ok: false, reason: '인증키 미설정', provisional: isProvisional(monthLabel(ym), now), total: null, read: 0 })),
      ...empty,
    }
  }

  const fetched = await pool(yms, CONCURRENCY, ym => fetchMonth(group, q.house, q.lawd, ym, now))
  const failed = fetched.filter(m => !m.ok).length
  const { deals: all, dropped } = dedupe(fetched.flatMap(m => m.deals))
  const scoped = selectDeals(all, { kind: q.kind, band: q.band, dong: q.dong })
  const series = monthlySeries(
    scoped,
    fetched.map(m => ({ ym: m.ym, failed: !m.ok })),
    q.kind,
    now,
  )
  // 동 목록은 동 조건을 걸기 전, 나머지 조건만 건 거래로 센다
  const forDongs = selectDeals(all, { kind: q.kind, band: q.band, dong: null })
  const values = scoped.map(d => primaryValue(d, q.kind)).filter((v): v is number => v !== null)

  return {
    status: failed === 0 ? 'ok' : failed === fetched.length ? 'error' : 'partial',
    query: q,
    source,
    fetchedAt: now.toISOString(),
    months: fetched.map(m => ({
      month: monthLabel(m.ym),
      ok: m.ok,
      reason: m.reason,
      provisional: isProvisional(monthLabel(m.ym), now),
      total: m.total,
      read: m.read,
    })),
    overall: dist(values),
    overallPerPyeong:
      q.kind === 'trade' ? dist(scoped.filter(d => d.amount !== null).map(d => (d.amount as number) / (d.area / 3.3058))) : null,
    overallRent: q.kind === 'wolse' ? dist(scoped.map(d => d.rent ?? 0)) : null,
    series,
    halves: compareHalves(scoped, series, q.kind),
    dongs: dongCounts(forDongs),
    recent: recentDeals(scoped, 60),
    quality: {
      raw: fetched.reduce((s, m) => s + m.read, 0),
      canceled: fetched.reduce((s, m) => s + m.canceled, 0),
      invalid: fetched.reduce((s, m) => s + m.invalid, 0),
      duplicates: dropped,
      failedMonths: failed,
      truncatedMonths: fetched.filter(m => m.ok && m.total !== null && m.read < m.total).length,
    },
    ...(opts.withDeals ? { deals: scoped } : {}),
  }
}
