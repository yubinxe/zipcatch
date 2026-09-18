import { molitKey, hasMolitKey } from '@/lib/config/data-portal-key'

/**
 * 국토교통부 전월세 실거래.
 *
 * 접수 중인 공고 아흔두 건 가운데 여든다섯 건이 임대인데, 그 전부가 금액을
 * 내놓지 않는다 — LH 는 조건을 공고문 PDF 에만 적기 때문이다. 우리 화면은
 * 그 자리에 '공고문 확인'만 적어 왔다. 재고의 아홉 할이 값을 못 보이는 셈이다.
 *
 * 공고의 금액을 알아낼 수 없다면, 적어도 그 동네 전월세가 얼마인지는 말해 줄
 * 수 있다. LH 가 "시세의 60~80%"라고 할 때 그 시세가 얼마인지를 보여주는 것이
 * 이 자료의 몫이다.
 *
 * ── 종류를 가려 쓴다 ──
 *
 * 매입임대는 LH 가 빌라·오피스텔을 사들여 빌려주는 것이다. 그것을 아파트
 * 시세와 견주면 늘 "싸다"가 나오지만 견줌자가 틀린 것이다. 공고 유형에 따라
 * 아파트를 볼지 연립다세대·오피스텔을 볼지 나눈다.
 */

const BASE = 'https://apis.data.go.kr/1613000'

/** 국토부가 종류마다 다른 서비스로 낸다 */
const SERVICE = {
  APT: 'RTMSDataSvcAptRent/getRTMSDataSvcAptRent',
  ROW: 'RTMSDataSvcRHRent/getRTMSDataSvcRHRent',
  OFFI: 'RTMSDataSvcOffiRent/getRTMSDataSvcOffiRent',
} as const

export type RentKind = keyof typeof SERVICE

/** 면적 구간. 임대 공고는 면적조차 안 밝히는 일이 많아 구간으로 늘어놓는다 */
const BANDS = [
  { key: '~40㎡', min: 0, max: 40 },
  { key: '40~60㎡', min: 40, max: 60 },
  { key: '60~85㎡', min: 60, max: 85 },
  { key: '85㎡~', min: 85, max: Infinity },
] as const

/** 한 구간에 이보다 적으면 대푯값을 내지 않는다 */
const MIN_SAMPLE = 3

interface Deal {
  dong: string
  area: number
  /** 만원 */
  deposit: number
  /** 만원. 0 이면 전세 */
  monthlyRent: number
  builtYear: number | null
}

export interface RentBand {
  key: string
  /** 전세 */
  jeonse: { count: number; deposit: number | null }
  /** 월세 — 보증금과 월세를 따로 센다. 둘은 서로 맞바꿀 수 있어 한 숫자로 못 묶는다 */
  wolse: { count: number; deposit: number | null; rent: number | null }
}

export interface RentStat {
  kinds: RentKind[]
  scope: string
  months: number
  total: number
  bands: RentBand[]
  ok: boolean
  reason: string | null
}

const EMPTY: RentStat = { kinds: [], scope: '', months: 0, total: 0, bands: [], ok: false, reason: null }

function median(ns: number[]): number | null {
  if (ns.length === 0) return null
  const s = [...ns].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2)
}

function num(v: string | undefined): number {
  const n = Number(String(v ?? '').replace(/[^\d.-]/g, ''))
  return Number.isFinite(n) ? n : 0
}

function recentMonths(n: number, now = new Date()): string[] {
  const out: string[] = []
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    out.push(`${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  return out
}

function parse(body: string): Deal[] {
  const out: Deal[] = []
  for (const m of body.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const row: Record<string, string> = {}
    for (const f of m[1].matchAll(/<([A-Za-z가-힣]+)>([\s\S]*?)<\/\1>/g)) row[f[1]] = f[2].trim()
    const area = num(row.excluUseAr)
    const deposit = num(row.deposit)
    if (area <= 0 || deposit <= 0) continue
    const built = num(row.buildYear)
    out.push({
      dong: row.umdNm ?? '',
      area,
      deposit,
      monthlyRent: num(row.monthlyRent),
      builtYear: built > 0 ? built : null,
    })
  }
  return out
}

/**
 * 공고 유형에 맞는 견줌자를 고른다.
 *
 * 매입임대·전세임대는 LH 가 기존 주택을 사거나 빌려 다시 내놓는 것이라
 * 빌라·오피스텔이 많다. 건설임대(국민·영구·행복주택 등)는 아파트 단지다.
 */
export function rentKindsFor(housingType: string): RentKind[] {
  const t = (housingType ?? '').trim()
  if (t.includes('매입') || t.includes('전세임대')) return ['ROW', 'OFFI']
  if (t.includes('오피스텔') || t.includes('도시형')) return ['OFFI']
  return ['APT']
}

async function pull(kind: RentKind, lawdCd: string, ym: string): Promise<Deal[]> {
  const params = new URLSearchParams({
    serviceKey: molitKey(),
    LAWD_CD: lawdCd,
    DEAL_YMD: ym,
    numOfRows: '800',
    pageNo: '1',
  })
  const res = await fetch(`${BASE}/${SERVICE[kind]}?${params}`, { next: { revalidate: 21600 } })
  if (!res.ok) throw new Error(`전월세 응답 ${res.status}`)
  const body = await res.text()
  if (body.includes('<returnAuthMsg>') && !body.includes('<item>')) {
    throw new Error('전월세 인증키가 거부되었습니다 (활용신청 확인 필요)')
  }
  return parse(body)
}

/**
 * 주변 전월세 시세.
 *
 * 실패해도 던지지 않는다. 견줌자가 없다고 공고 상세가 열리지 않으면
 * 곁들이는 정보 때문에 본문을 잃는 셈이다.
 */
export async function fetchRentStat(
  lawdCd: string | null,
  housingType: string,
  { months = 6, dong = null }: { months?: number; dong?: string | null } = {},
): Promise<RentStat> {
  const code = (lawdCd ?? '').trim().slice(0, 5)
  const kinds = rentKindsFor(housingType)
  if (code.length !== 5 || !hasMolitKey()) return { ...EMPTY, kinds, months }

  try {
    const yms = recentMonths(months)
    const batches = await Promise.all(
      kinds.flatMap(k => yms.map(ym => pull(k, code, ym).catch(() => [] as Deal[]))),
    )
    const all = batches.flat()
    if (all.length === 0) {
      return { ...EMPTY, kinds, months, ok: true, reason: '해당 기간에 신고된 전월세가 없습니다.' }
    }

    // 같은 동에 충분히 쌓였으면 동으로 좁힌다. 아니면 시군구 전체로 본다.
    const target = (dong ?? '').trim()
    const inDong = target ? all.filter(d => d.dong === target) : []
    const use = inDong.length >= 20 ? inDong : all
    const scope = use === inDong ? target : '같은 시·군·구'

    const bands = BANDS.map(b => {
      const rows = use.filter(d => d.area >= b.min && d.area < b.max)
      const j = rows.filter(d => d.monthlyRent === 0)
      const w = rows.filter(d => d.monthlyRent > 0)
      return {
        key: b.key,
        jeonse: {
          count: j.length,
          deposit: j.length >= MIN_SAMPLE ? median(j.map(d => d.deposit)) : null,
        },
        wolse: {
          count: w.length,
          deposit: w.length >= MIN_SAMPLE ? median(w.map(d => d.deposit)) : null,
          rent: w.length >= MIN_SAMPLE ? median(w.map(d => d.monthlyRent)) : null,
        },
      } satisfies RentBand
    }).filter(b => b.jeonse.deposit !== null || b.wolse.rent !== null)

    return { kinds, scope, months, total: use.length, bands, ok: true, reason: null }
  } catch (err) {
    return {
      ...EMPTY,
      kinds,
      months,
      reason: err instanceof Error ? err.message : '전월세를 불러오지 못했습니다.',
    }
  }
}
