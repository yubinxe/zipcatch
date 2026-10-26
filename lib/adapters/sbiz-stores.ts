import { dataPortalKey } from '@/lib/config/data-portal-key'

/**
 * 소상공인시장진흥공단 상가(상권)정보 — 반경 안의 상가.
 *
 * 공공데이터포털 15012005 · `sdsc2/storeListInRadius`. 등록된 상가 업소를 반경으로
 * 돌려준다. 집 앞에 편의점·약국·세탁소가 있는지는 공고문이 말해 주지 않는 것이고,
 * 혼자 처음 사는 사람에게는 보증금 몇백만 원만큼 중요하다.
 *
 * 등록 정보 기준이라 문을 닫은 가게가 남아 있거나 새 가게가 빠져 있을 수 있다.
 * 화면은 그렇게 적는다. 점수를 매기지 않고 센 숫자만 보여 준다.
 *
 * 키는 서비스별 활용신청이 필요하다. 전용 키(SBIZ_API_KEY)가 있으면 그것을,
 * 없으면 공용 키로 물러선다. 서버에서만 읽는다.
 */

const ENDPOINT = 'https://apis.data.go.kr/B553077/api/open/sdsc2/storeListInRadius'
const PER_PAGE = 1000
const MAX_PAGES = 5

export function sbizKey(): string {
  return (process.env.SBIZ_API_KEY ?? '').trim() || dataPortalKey()
}

interface RawStore {
  bizesNm?: string
  indsLclsNm?: string
  indsMclsNm?: string
  indsSclsNm?: string
}

/** 생활에 바로 닿는 것만 따로 센다. 이름(소분류·중분류)으로 가른다 */
const ESSENTIALS: { key: string; label: string; test: (s: RawStore) => boolean }[] = [
  { key: 'convenience', label: '편의점', test: s => /편의점/.test(`${s.indsSclsNm}${s.indsMclsNm}`) },
  { key: 'pharmacy', label: '약국', test: s => /약국/.test(`${s.indsSclsNm}${s.indsMclsNm}`) },
  { key: 'clinic', label: '병·의원', test: s => /의원|병원/.test(`${s.indsSclsNm}${s.indsMclsNm}`) },
  { key: 'laundry', label: '세탁', test: s => /세탁/.test(`${s.indsSclsNm}${s.indsMclsNm}`) },
  { key: 'cafe', label: '카페', test: s => /카페|커피/.test(`${s.indsSclsNm}${s.indsMclsNm}`) },
  { key: 'gym', label: '운동시설', test: s => /헬스|피트니스|체력단련|요가|필라테스/.test(`${s.indsSclsNm}${s.indsMclsNm}`) },
]

export interface StoreRead {
  radius: number
  /** 원자료가 밝힌 전체 업소 수 */
  total: number
  /** 실제로 받아 센 업소 수. total 보다 작으면 일부만 센 것 */
  counted: number
  /** 대분류별 — 많은 순 */
  groups: { name: string; count: number }[]
  essentials: { key: string; label: string; count: number }[]
}

/** 응답 모양이 판에 따라 items 배열이거나 items.item 이다. 둘 다 받는다 */
function itemsOf(json: unknown): RawStore[] {
  const body = (json as { body?: { items?: unknown } })?.body
  const items = body?.items as unknown
  if (Array.isArray(items)) return items as RawStore[]
  const nested = (items as { item?: unknown })?.item
  if (Array.isArray(nested)) return nested as RawStore[]
  if (nested && typeof nested === 'object') return [nested as RawStore]
  return []
}

export function readStores(list: RawStore[], total: number, radius: number): StoreRead {
  const groups = new Map<string, number>()
  for (const s of list) {
    const g = (s.indsLclsNm ?? '').trim() || '기타'
    groups.set(g, (groups.get(g) ?? 0) + 1)
  }
  return {
    radius,
    total,
    counted: list.length,
    groups: [...groups.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
    essentials: ESSENTIALS.map(e => ({ key: e.key, label: e.label, count: list.filter(e.test).length })),
  }
}

export type StoreResult = { ok: true; read: StoreRead } | { ok: false; reason: string }

export async function fetchStoresInRadius(lat: number, lng: number, radius: number): Promise<StoreResult> {
  const key = sbizKey()
  if (!key) return { ok: false, reason: '상가(상권)정보 인증키가 설정되지 않았습니다.' }

  const all: RawStore[] = []
  let total = 0
  try {
    for (let page = 1; page <= MAX_PAGES; page++) {
      const params = new URLSearchParams({
        serviceKey: key,
        pageNo: String(page),
        numOfRows: String(PER_PAGE),
        radius: String(radius),
        cx: String(lng),
        cy: String(lat),
        type: 'json',
      })
      // 상가 등록 정보는 분기마다 갱신된다. 같은 자리를 일주일 동안 다시 묻지 않는다
      const res = await fetch(`${ENDPOINT}?${params}`, { next: { revalidate: 604800 } })
      const text = await res.text()
      let json: unknown
      try {
        json = JSON.parse(text)
      } catch {
        // 인증 실패는 JSON 이 아니라 XML 로 온다
        const msg = text.match(/<returnAuthMsg>([^<]+)/)?.[1] ?? text.match(/<resultMsg>([^<]+)/)?.[1]
        return { ok: false, reason: `공공데이터포털 응답: ${msg ?? `HTTP ${res.status}`}` }
      }
      const header = (json as { header?: { resultCode?: string; resultMsg?: string } })?.header
      // 03 은 '자료 없음' — 반경 안에 등록 업소가 없다는 뜻이지 실패가 아니다
      if (header?.resultCode === '03') break
      if (header?.resultCode && header.resultCode !== '00') {
        return { ok: false, reason: `공공데이터포털 응답: ${header.resultMsg ?? header.resultCode}` }
      }
      const items = itemsOf(json)
      total = Number((json as { body?: { totalCount?: number } })?.body?.totalCount ?? total) || total
      all.push(...items)
      if (items.length < PER_PAGE || all.length >= total) break
    }
  } catch (err) {
    return { ok: false, reason: `호출 실패: ${err instanceof Error ? err.message : String(err)}` }
  }
  return { ok: true, read: readStores(all, Math.max(total, all.length), radius) }
}
