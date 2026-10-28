/**
 * 실거래 흐름 — 응답 읽기와 집계(순수 함수).
 *
 * 네트워크도 별칭 import 도 쓰지 않는다. `node --test` 가 그대로 불러 검사할 수
 * 있어야 하기 때문이다. 부르는 쪽은 lib/market/flow.ts.
 *
 * ── 이 집계가 지키는 것 ──
 *
 * 1. 매매·전세·월세를 한 숫자로 섞지 않는다. 매매는 거래금액, 전세는 보증금,
 *    월세는 보증금과 월 임대료를 따로 센다.
 * 2. 대푯값은 평균이 아니라 중앙값이다. 한 달에 3건보다 적으면 대푯값을 내지 않고
 *    (null), 사분위는 5건부터 낸다. 0 으로 채우거나 앞뒤 달로 메우지 않는다.
 * 3. 해제(취소)된 매매는 뺀다. 계약이 무른 값을 시세로 세지 않는다.
 * 4. 금액 단위는 원자료 그대로 만원이다. 평당가는 **전용면적** 3.3058㎡ 기준이며
 *    공급면적과 섞지 않는다.
 * 5. 같은 거래가 두 번 들어오면(페이지 경계·재요청) 한 번만 센다.
 * 6. 달은 **계약 월**이다. 신고는 계약 후 30일 안에 하면 되므로, 그 기한이 아직
 *    지나지 않은 달은 '신고 진행 중'으로 표시한다 — 건수가 적게 보이는 것이
 *    거래가 줄어서가 아닐 수 있다.
 */

export type DealKind = 'trade' | 'jeonse' | 'wolse'
export type HouseKind = 'APT' | 'ROW' | 'OFFI'
export type AreaBand = 'all' | 'u60' | '60to85' | 'o85'

export const AREA_BANDS: { key: AreaBand; label: string; min: number; max: number }[] = [
  { key: 'all', label: '전체 면적', min: 0, max: Infinity },
  { key: 'u60', label: '전용 60㎡ 이하', min: 0, max: 60 },
  { key: '60to85', label: '전용 60~85㎡', min: 60, max: 85 },
  { key: 'o85', label: '전용 85㎡ 초과', min: 85, max: Infinity },
]

/** 1평 = 3.3058㎡ — 전용면적 기준 */
export const PYEONG = 3.3058
/** 한 달에 이보다 적으면 대푯값을 내지 않는다 */
export const MIN_FOR_MEDIAN = 3
/** 사분위는 이만큼은 있어야 뜻이 있다 */
export const MIN_FOR_QUARTILE = 5
/** 부동산 거래신고·주택임대차 신고 기한(계약일로부터) */
export const REPORT_WINDOW_DAYS = 30

export interface FlowDeal {
  /** 계약 연월 YYYY-MM */
  month: string
  /** 계약 일 */
  day: number | null
  dong: string
  /** 단지·건물 이름 */
  name: string
  /** 전용면적 ㎡ */
  area: number
  floor: number | null
  builtYear: number | null
  /** 매매 거래금액 · 만원 */
  amount: number | null
  /** 전월세 보증금 · 만원 */
  deposit: number | null
  /** 월 임대료 · 만원. 전세는 0 */
  rent: number | null
  /** 전월세 계약 구분(신규/갱신). 원자료에 없으면 null */
  contract: string | null
  /** 매매 거래 유형(중개거래/직거래). 원자료에 없으면 null */
  dealing: string | null
}

type Row = Record<string, string>

/* ───────────────────────── 응답 읽기 ───────────────────────── */

export interface ParsedPage {
  /** 결과 코드가 정상이 아니거나 인증 오류면 오류 문구 */
  error: string | null
  totalCount: number | null
  rows: Row[]
}

/**
 * 공공데이터포털 XML 한 페이지.
 *
 * 인증 오류는 `<returnAuthMsg>` 로, 서비스 오류는 `resultCode` 로 온다. 둘 다 아니고
 * 항목이 없으면 정상 0건이다 — 이 둘을 섞으면 '거래 없음'과 '불러오기 실패'가
 * 구별되지 않는다.
 */
export function parsePage(body: string): ParsedPage {
  const auth = body.match(/<returnAuthMsg>([\s\S]*?)<\/returnAuthMsg>/)
  if (auth) return { error: `인증 오류: ${auth[1].trim()}`, totalCount: null, rows: [] }

  const code = body.match(/<resultCode>([\s\S]*?)<\/resultCode>/)?.[1]?.trim()
  if (code && !/^0+$/.test(code)) {
    const msg = body.match(/<resultMsg>([\s\S]*?)<\/resultMsg>/)?.[1]?.trim() ?? ''
    return { error: `응답 오류 ${code}${msg ? ` ${msg}` : ''}`, totalCount: null, rows: [] }
  }
  if (!code && !body.includes('<item>') && !body.includes('<items')) {
    return { error: '알 수 없는 응답 형식', totalCount: null, rows: [] }
  }

  const rows: Row[] = []
  for (const m of body.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const row: Row = {}
    for (const f of m[1].matchAll(/<([A-Za-z가-힣_]+)>([\s\S]*?)<\/\1>/g)) row[f[1]] = f[2].trim()
    rows.push(row)
  }
  const total = Number(body.match(/<totalCount>(\d+)<\/totalCount>/)?.[1])
  return { error: null, totalCount: Number.isFinite(total) ? total : null, rows }
}

function pick(r: Row, keys: string[]): string {
  for (const k of keys) if (r[k] !== undefined && r[k] !== '') return r[k]
  return ''
}

/** '40,646' 처럼 쉼표가 섞인 금액 */
function num(v: string): number | null {
  if (!v) return null
  const n = Number(v.replace(/[^\d.-]/g, ''))
  return Number.isFinite(n) ? n : null
}

function base(r: Row, month: string) {
  const area = num(pick(r, ['excluUseAr', '전용면적']))
  const dayRaw = num(pick(r, ['dealDay', '일']))
  const floor = num(pick(r, ['floor', '층']))
  const built = num(pick(r, ['buildYear', '건축년도']))
  return {
    month,
    day: dayRaw !== null && dayRaw >= 1 && dayRaw <= 31 ? dayRaw : null,
    dong: pick(r, ['umdNm', '법정동']),
    name: pick(r, ['aptNm', 'mhouseNm', 'offiNm', 'aptName', '아파트', '연립다세대', '단지']),
    area: area !== null && area > 0 ? area : null,
    floor,
    builtYear: built !== null && built > 0 ? built : null,
  }
}

/** YYYYMM → YYYY-MM */
export function monthLabel(ym: string): string {
  return `${ym.slice(0, 4)}-${ym.slice(4, 6)}`
}

/** 매매. 해제된 거래와 금액·면적을 읽을 수 없는 건은 뺀다 */
export function normalizeTrade(rows: Row[], ym: string): { deals: FlowDeal[]; canceled: number; invalid: number } {
  const month = monthLabel(ym)
  const deals: FlowDeal[] = []
  let canceled = 0
  let invalid = 0
  for (const r of rows) {
    const flag = pick(r, ['cdealType', '해제여부'])
    if (flag === 'O' || flag === 'Y') {
      canceled++
      continue
    }
    const b = base(r, month)
    const amount = num(pick(r, ['dealAmount', '거래금액']))
    if (b.area === null || amount === null || amount <= 0) {
      invalid++
      continue
    }
    deals.push({
      ...b,
      area: b.area,
      amount,
      deposit: null,
      rent: null,
      contract: null,
      dealing: pick(r, ['dealingGbn', '거래유형']) || null,
    })
  }
  return { deals, canceled, invalid }
}

/** 전월세. 보증금이 없거나 면적을 읽을 수 없는 건은 뺀다 */
export function normalizeRent(rows: Row[], ym: string): { deals: FlowDeal[]; invalid: number } {
  const month = monthLabel(ym)
  const deals: FlowDeal[] = []
  let invalid = 0
  for (const r of rows) {
    const b = base(r, month)
    const deposit = num(pick(r, ['deposit', '보증금액']))
    const rent = num(pick(r, ['monthlyRent', '월세금액'])) ?? 0
    if (b.area === null || deposit === null || deposit < 0 || rent < 0 || (deposit === 0 && rent === 0)) {
      invalid++
      continue
    }
    deals.push({
      ...b,
      area: b.area,
      amount: null,
      deposit,
      rent,
      contract: pick(r, ['contractType', '계약구분']) || null,
      dealing: null,
    })
  }
  return { deals, invalid }
}

/**
 * 같은 거래를 한 번만.
 *
 * 원자료에 거래 고유번호가 없어 계약일·위치·면적·층·금액을 묶어 열쇠로 쓴다.
 * 같은 단지 같은 층에서 같은 날 같은 값에 두 건이 실제로 계약됐다면 하나로
 * 합쳐지는 한계가 있다 — 드물고, 중복 집계보다 덜 해롭다.
 */
export function dedupe(deals: FlowDeal[]): { deals: FlowDeal[]; dropped: number } {
  const seen = new Set<string>()
  const out: FlowDeal[] = []
  for (const d of deals) {
    const key = [d.month, d.day, d.dong, d.name, d.area, d.floor, d.amount, d.deposit, d.rent, d.contract].join('|')
    if (seen.has(key)) continue
    seen.add(key)
    out.push(d)
  }
  return { deals: out, dropped: deals.length - out.length }
}

/* ───────────────────────── 집계 ───────────────────────── */

/** 정렬된 배열의 분위수(선형 보간). 비어 있으면 null */
export function quantile(sorted: number[], q: number): number | null {
  if (sorted.length === 0) return null
  const pos = (sorted.length - 1) * q
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo)
}

export interface Dist {
  count: number
  median: number | null
  p25: number | null
  p75: number | null
  min: number | null
  max: number | null
}

export function dist(values: number[]): Dist {
  const s = values.filter(v => Number.isFinite(v)).sort((a, b) => a - b)
  const n = s.length
  const r = (v: number | null) => (v === null ? null : Math.round(v))
  return {
    count: n,
    median: n >= MIN_FOR_MEDIAN ? r(quantile(s, 0.5)) : null,
    p25: n >= MIN_FOR_QUARTILE ? r(quantile(s, 0.25)) : null,
    p75: n >= MIN_FOR_QUARTILE ? r(quantile(s, 0.75)) : null,
    min: n ? s[0] : null,
    max: n ? s[n - 1] : null,
  }
}

/** 이 계약 월의 신고 기한이 아직 남아 있는가 */
export function isProvisional(month: string, now: Date): boolean {
  const [y, m] = month.split('-').map(Number)
  const lastDay = new Date(Date.UTC(y, m, 0))
  const deadline = lastDay.getTime() + REPORT_WINDOW_DAYS * 86400000
  return deadline > now.getTime()
}

/** 최근 N개월 YYYYMM (오래된 달부터). 한국 시간 기준 */
export function recentMonths(n: number, now: Date): string[] {
  const kst = new Date(now.getTime() + 9 * 3600000)
  const y = kst.getUTCFullYear()
  const m = kst.getUTCMonth()
  const out: string[] = []
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - i, 1))
    out.push(`${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}`)
  }
  return out
}

export function inBand(area: number, band: AreaBand): boolean {
  const b = AREA_BANDS.find(x => x.key === band) ?? AREA_BANDS[0]
  // 경계: 60㎡ 는 '60 이하', 85㎡ 는 '60~85'에 든다(주택공급 규칙의 면적 구분과 같게)
  return band === 'all' || (area > b.min && area <= b.max)
}

/** 거래 종류에 맞는 대표 금액 */
export function primaryValue(d: FlowDeal, kind: DealKind): number | null {
  if (kind === 'trade') return d.amount
  return d.deposit
}

export interface MonthPoint {
  month: string
  /** 이 달을 불러오지 못했다 — 0건과 다르다 */
  failed: boolean
  provisional: boolean
  /** 매매 거래금액 · 전세/월세 보증금 (만원) */
  value: Dist
  /** 매매만 — 전용 3.3㎡당 만원 */
  perPyeong: Dist | null
  /** 월세만 — 월 임대료 만원 */
  rent: Dist | null
  /** 같은 달 다른 달보다 거래가 눈에 띄게 많거나 적었는가(관측 표시일 뿐 원인은 말하지 않는다) */
  volumeFlag: 'high' | 'low' | null
}

export interface FlowFilter {
  kind: DealKind
  band: AreaBand
  dong: string | null
}

/** 계약 구분·전월세 구분까지 걸러 이 화면이 셀 거래만 */
export function selectDeals(deals: FlowDeal[], f: FlowFilter): FlowDeal[] {
  return deals.filter(d => {
    if (f.kind === 'jeonse' && !(d.rent === 0)) return false
    if (f.kind === 'wolse' && !(d.rent !== null && d.rent > 0)) return false
    if (f.dong && d.dong !== f.dong) return false
    return inBand(d.area, f.band)
  })
}

export function monthlySeries(
  deals: FlowDeal[],
  months: { ym: string; failed: boolean }[],
  kind: DealKind,
  now: Date,
): MonthPoint[] {
  const points: MonthPoint[] = months.map(({ ym, failed }) => {
    const month = monthLabel(ym)
    const rows = failed ? [] : deals.filter(d => d.month === month)
    const values = rows.map(d => primaryValue(d, kind)).filter((v): v is number => v !== null)
    return {
      month,
      failed,
      provisional: isProvisional(month, now),
      value: dist(values),
      perPyeong:
        kind === 'trade'
          ? dist(rows.filter(d => d.amount !== null).map(d => (d.amount as number) / (d.area / PYEONG)))
          : null,
      rent: kind === 'wolse' ? dist(rows.map(d => d.rent ?? 0)) : null,
      volumeFlag: null,
    }
  })

  /*
   * 거래량 관측 표시 — 신고가 끝난 달끼리만 견준다. 그런 달이 4개 미만이면 아무것도
   * 표시하지 않는다. 기준은 그 달들 건수의 중앙값의 2배 이상 / 절반 이하.
   */
  const settled = points.filter(p => !p.failed && !p.provisional)
  if (settled.length >= 4) {
    const s = settled.map(p => p.value.count).sort((a, b) => a - b)
    const mid = quantile(s, 0.5) ?? 0
    if (mid >= 5) {
      for (const p of settled) {
        if (p.value.count >= mid * 2) p.volumeFlag = 'high'
        else if (p.value.count <= mid / 2) p.volumeFlag = 'low'
      }
    }
  }
  return points
}

export interface HalfCompare {
  /** 앞쪽 절반 기간 · 뒤쪽 절반 기간 (신고 진행 중인 달 제외) */
  before: { from: string; to: string; dist: Dist }
  after: { from: string; to: string; dist: Dist }
  /** 중앙값 변화율 % — 양쪽 중앙값이 있을 때만 */
  medianChangePct: number | null
  countChangePct: number | null
}

/**
 * 기간 앞뒤 절반 비교. 달마다의 중앙값을 다시 평균내지 않고, 각 절반에 든 거래
 * 전체로 중앙값을 다시 잰다 — 거래가 적은 달이 많은 달과 같은 무게를 갖지 않게.
 */
export function compareHalves(deals: FlowDeal[], series: MonthPoint[], kind: DealKind): HalfCompare | null {
  const usable = series.filter(p => !p.failed && !p.provisional).map(p => p.month)
  if (usable.length < 4) return null
  const half = Math.floor(usable.length / 2)
  const a = usable.slice(0, half)
  const b = usable.slice(usable.length - half)
  const pickVals = (ms: string[]) =>
    deals.filter(d => ms.includes(d.month)).map(d => primaryValue(d, kind)).filter((v): v is number => v !== null)
  const da = dist(pickVals(a))
  const db = dist(pickVals(b))
  const pct = (x: number | null, y: number | null) => (x && y !== null ? Math.round(((y - x) / x) * 1000) / 10 : null)
  return {
    before: { from: a[0], to: a[a.length - 1], dist: da },
    after: { from: b[0], to: b[b.length - 1], dist: db },
    medianChangePct: pct(da.median, db.median),
    countChangePct: da.count > 0 ? pct(da.count, db.count) : null,
  }
}

/** 동별 건수 (많은 순) — 동 선택지는 실제 응답에 나온 동만 */
export function dongCounts(deals: FlowDeal[]): { dong: string; count: number }[] {
  const m = new Map<string, number>()
  for (const d of deals) if (d.dong) m.set(d.dong, (m.get(d.dong) ?? 0) + 1)
  return [...m.entries()].map(([dong, count]) => ({ dong, count })).sort((a, b) => b.count - a.count || a.dong.localeCompare(b.dong, 'ko'))
}

/** 최근 계약부터 */
export function recentDeals(deals: FlowDeal[], limit: number): FlowDeal[] {
  return [...deals]
    .sort((a, b) => (b.month + String(b.day ?? 0).padStart(2, '0')).localeCompare(a.month + String(a.day ?? 0).padStart(2, '0')))
    .slice(0, limit)
}

/* ───────────────────────── 내보내기 ───────────────────────── */

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/**
 * CSV — 엑셀에서 한글이 깨지지 않도록 BOM 을 붙이고, 머리에 조회 조건과 출처를 적는다.
 * 원자료 그대로의 거래 목록이며, 집계값이 아니다.
 */
export function toCsv(deals: FlowDeal[], kind: DealKind, meta: string[]): string {
  const head =
    kind === 'trade'
      ? ['계약일', '법정동', '단지', '전용면적(㎡)', '층', '건축년도', '거래금액(만원)', '전용3.3㎡당(만원)', '거래유형']
      : ['계약일', '법정동', '단지', '전용면적(㎡)', '층', '건축년도', '보증금(만원)', '월임대료(만원)', '계약구분']
  const lines = [
    ...meta.map(m => `# ${m}`),
    head.join(','),
    ...deals.map(d => {
      const date = `${d.month}${d.day ? `-${String(d.day).padStart(2, '0')}` : ''}`
      const cells =
        kind === 'trade'
          ? [date, d.dong, d.name, d.area, d.floor, d.builtYear, d.amount, d.amount ? Math.round(d.amount / (d.area / PYEONG)) : '', d.dealing]
          : [date, d.dong, d.name, d.area, d.floor, d.builtYear, d.deposit, d.rent, d.contract]
      return cells.map(csvCell).join(',')
    }),
  ]
  return '﻿' + lines.join('\r\n') + '\r\n'
}
