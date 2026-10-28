import { myhomeKey } from '@/lib/config/data-portal-key'
import type { OpportunityRow } from '@/lib/db/types'
import { shortProvince } from './lh'

/**
 * 마이홈포털(국토교통부) 어댑터 — 공공주택 모집공고(15108420) · 예비입주자 대기현황(15108378).
 *
 * 게이트웨이: apis.data.go.kr/1613000/HWSPR02 · HWSPR03 (포털 Swagger 의 host).
 * 문서의 oprtinUrl(data.myhome.go.kr/…)로 부르면 키가 맞아도 999 를 돌려준다.
 *
 * 모집공고는 LH 청약플러스 목록이 주지 않는 칸을 준다 — 단지 주소, 시·군·구,
 * 최소 보증금·월 임대료, 공급 호수, 접수 시작·마감일. 그래서:
 *  · LH 공고(공급기관 LH)는 새로 만들지 않고, 링크의 panId(= LH PAN_ID)로 짝지어
 *    비어 있는 칸만 채운다(enrichLh). LH 가 준 값은 덮지 않는다
 *  · LH 가 아닌 공급기관(지방공사·자산관리공사 등)은 출처 MYHOME 으로 새로 싣는다
 * 원천 ID(pblancId·houseSn)와 원문 링크를 보존한다.
 *
 * 금액은 원 단위로 온다(rentGtn 2,801,000 = 280만 원). 저장소는 만 원 단위다.
 */

const NTC = 'https://apis.data.go.kr/1613000/HWSPR02/rsdtRcritNtcList'
const WAIT = 'https://apis.data.go.kr/1613000/HWSPR03/moveWaitStsList'

export interface MyhomeNotice {
  pblancId: string
  houseSn: number
  sttusNm: string
  pblancNm: string
  suplyInsttNm: string
  houseTyNm: string
  suplyTyNm: string
  rcritPblancDe: string
  przwnerPresnatnDe: string
  url: string
  pcUrl: string
  hsmpNm: string
  brtcNm: string
  signguNm: string
  fullAdres: string
  totHshldCo: number | null
  sumSuplyCo: number | null
  rentGtn: number | null
  mtRntchrg: number | null
  beginDe: string
  endDe: string
}

export interface MyhomeWait {
  rtsInsttNm: string
  brtcNm: string
  signguNm: string
  rnAdres: string
  hsmpSn: number
  hsmpNm: string
  houseTyNm: string
  suplyTyNm: string
  styleNm: string
  drwtUnit: string
  waitCo: number
  trmnatCo: number
}

type Result<T> = { ok: true; items: T[]; total: number } | { ok: false; reason: string; items: T[]; total: number }

async function call<T>(url: string, params: Record<string, string>, revalidate: number): Promise<Result<T>> {
  const key = myhomeKey()
  if (!key) return { ok: false, reason: '마이홈 인증키(MYHOME_API_KEY)가 설정되지 않았습니다.', items: [], total: 0 }
  const q = new URLSearchParams({ serviceKey: key, ...params })
  try {
    const res = await fetch(`${url}?${q}`, { next: { revalidate } })
    const json = (await res.json().catch(() => null)) as {
      response?: { header?: { resultCode?: string; resultMsg?: string }; body?: { totalCount?: string | number; item?: T[] | T } }
    } | null
    const head = json?.response?.header
    if (!json || head?.resultCode !== '00') {
      return { ok: false, reason: `마이홈 응답: ${head?.resultMsg ?? `HTTP ${res.status}`}`, items: [], total: 0 }
    }
    const raw = json.response?.body?.item
    const items = Array.isArray(raw) ? raw : raw ? [raw] : []
    return { ok: true, items, total: Number(json.response?.body?.totalCount ?? items.length) }
  } catch (err) {
    return { ok: false, reason: `호출 실패: ${err instanceof Error ? err.message : String(err)}`, items: [], total: 0 }
  }
}

/** 모집공고 — 조건 없이 최신부터. 쪽을 넘겨 끝까지(상한 pages) 받는다 */
export async function fetchMyhomeNotices(opts: { pages?: number; rows?: number } = {}): Promise<Result<MyhomeNotice>> {
  const rows = opts.rows ?? 100
  const out: MyhomeNotice[] = []
  let total = 0
  for (let page = 1; page <= (opts.pages ?? 5); page++) {
    const r = await call<MyhomeNotice>(NTC, { pageNo: String(page), numOfRows: String(rows) }, 1800)
    if (!r.ok) return page === 1 ? r : { ok: true, items: out, total }
    out.push(...r.items)
    total = r.total
    if (r.items.length < rows || out.length >= total) break
  }
  return { ok: true, items: out, total }
}

/** 예비입주자 대기현황 — 광역 코드(필수)·시군구 코드(선택) */
export async function fetchMyhomeWait(brtcCode: string, opts: { signguCode?: string; rows?: number; page?: number } = {}) {
  const params: Record<string, string> = { brtcCode, numOfRows: String(opts.rows ?? 200), pageNo: String(opts.page ?? 1) }
  if (opts.signguCode) params.signguCode = opts.signguCode
  return call<MyhomeWait>(WAIT, params, 21600)
}

const iso = (d: string | undefined) => (d && /^\d{8}$/.test(d) ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : null)
/** 원 → 만 원(소수 한 자리). 0·빈 값은 '모름'(null)이다 — 0 원으로 적지 않는다 */
const man = (won: number | null | undefined) => (won && won > 0 ? Math.round(won / 1000) / 10 : null)
export const panIdOf = (n: Pick<MyhomeNotice, 'url'>) => n.url?.match(/panId=(\d+)/)?.[1] ?? null

/**
 * 같은 LH 공고(panId)의 단지 여럿을 하나로 모아, LH 행에 채울 값을 만든다.
 * 금액은 단지 가운데 가장 낮은 값(공고가 '최소' 금액을 준다), 공급은 합,
 * 주소·시·군·구는 단지가 하나일 때만 — 여러 단지면 대표 주소를 지어내지 않는다.
 */
export function lhPatches(items: MyhomeNotice[]): Map<string, Partial<OpportunityRow>> {
  const groups = new Map<string, MyhomeNotice[]>()
  for (const n of items) {
    if (n.suplyInsttNm !== 'LH') continue
    const id = panIdOf(n)
    if (!id) continue
    groups.set(id, [...(groups.get(id) ?? []), n])
  }
  const out = new Map<string, Partial<OpportunityRow>>()
  for (const [id, g] of groups) {
    const deposits = g.map(n => man(n.rentGtn)).filter((v): v is number => v !== null)
    const rents = g.map(n => man(n.mtRntchrg)).filter((v): v is number => v !== null)
    const supply = g.reduce((s, n) => s + (Number(n.sumSuplyCo) || 0), 0)
    const sigungu = [...new Set(g.map(n => n.signguNm).filter(Boolean))]
    const one = g.length === 1 ? g[0] : null
    const patch: Partial<OpportunityRow> = {}
    if (deposits.length) patch.deposit = Math.min(...deposits)
    if (rents.length) patch.monthly_rent = Math.min(...rents)
    if (supply > 0) patch.supply_count = supply
    if (sigungu.length === 1) {
      patch.region = sigungu[0]
      patch.district = shortProvince(g[0].brtcNm)
    }
    if (one?.fullAdres?.trim()) patch.address = one.fullAdres.trim()
    const begin = iso(g[0].beginDe)
    const end = iso(g[0].endDe)
    if (begin) patch.application_start = begin
    if (end) patch.application_end = end
    out.set(id, patch)
  }
  return out
}

/** LH 가 아닌 공급기관의 공고 — 출처 MYHOME 으로 새로 싣는다 */
export function normalizeMyhome(items: MyhomeNotice[], fetchedAt: string): Partial<OpportunityRow>[] {
  const today = fetchedAt.slice(0, 10)
  return items
    .filter(n => n.suplyInsttNm !== 'LH' && n.pblancId)
    .map(n => {
      const end = iso(n.endDe)
      return {
        source: 'MYHOME',
        external_id: `${n.pblancId}-${n.houseSn}`,
        opportunity_type: 'RENTAL' as const,
        housing_type: (n.suplyTyNm || n.houseTyNm || '공공임대').trim(),
        title: `${n.pblancNm}`.trim() + (n.hsmpNm && !n.pblancNm.includes(n.hsmpNm) ? ` · ${n.hsmpNm}` : ''),
        region: n.signguNm || shortProvince(n.brtcNm),
        district: shortProvince(n.brtcNm),
        address: n.fullAdres?.trim() || null,
        area: null,
        deposit: man(n.rentGtn),
        monthly_rent: man(n.mtRntchrg),
        supply_count: Number(n.sumSuplyCo) || null,
        vacancy_count: null,
        application_start: iso(n.beginDe),
        application_end: end,
        document_deadline: null,
        result_date: iso(n.przwnerPresnatnDe),
        contract_start: null,
        status: end && today > end ? ('CLOSED' as const) : ('OPEN' as const),
        source_url: (n.url || n.pcUrl || '').trim() || null,
        competition_rate: null,
        is_demo: false,
        updated_at: fetchedAt,
      }
    })
}
