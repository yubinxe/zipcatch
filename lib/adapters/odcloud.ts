import { dataPortalKey } from '@/lib/config/data-portal-key'

/**
 * 공공데이터포털 odcloud(청약홈 통계 등) — 조건에 맞는 건을 끝까지 받는다.
 *
 * 통계 API 들은 page=1 한 쪽만 받고 있었다(perPage 50~500). 한 달로 좁힌 지금은
 * 7~11건이라 빠지는 것이 없지만, 기간을 넓히거나 월 조건이 빠지면 앞머리만 받는다 —
 * 가점 통계 전체는 977건인데 50건만 읽게 된다. matchCount 를 보고 마지막 쪽까지 받는다.
 *
 * 돌려주는 모양은 odcloud 응답과 같다({ data, matchCount, totalCount, currentCount }).
 * 부르는 쪽 화면 코드는 그대로 둔다. currentCount 만 '모은 건수'로 바뀐다.
 */
const BASE = 'https://api.odcloud.kr/api'

export interface OdcloudPage<T> {
  data: T[]
  matchCount: number
  totalCount: number
  currentCount: number
  page: number
  perPage: number
  /** 쪽 수 상한에 걸려 다 받지 못했으면 true — 화면이 '표본 일부'라고 말할 수 있게 */
  truncated?: boolean
}

export async function odcloudAll<T = Record<string, unknown>>(
  path: string,
  cond: Record<string, string>,
  opts: { perPage?: number; maxPages?: number; revalidate?: number } = {},
): Promise<OdcloudPage<T>> {
  const perPage = opts.perPage ?? 500
  const maxPages = opts.maxPages ?? 20
  const key = dataPortalKey()
  const rows: T[] = []
  let matchCount = 0
  let totalCount = 0
  let page = 1
  for (; page <= maxPages; page++) {
    const params = new URLSearchParams({ serviceKey: key, page: String(page), perPage: String(perPage), returnType: 'JSON' })
    for (const [k, v] of Object.entries(cond)) if (v) params.set(k, v)
    const res = await fetch(`${BASE}/${path}?${params}`, { next: { revalidate: opts.revalidate ?? 600 } })
    const json = (await res.json().catch(() => null)) as Partial<OdcloudPage<T>> | null
    if (!json || !Array.isArray(json.data)) {
      // 첫 쪽부터 실패면 원래 응답을 그대로 넘긴다(인증키 오류 문구 등을 화면이 읽게)
      if (page === 1) return { data: [], matchCount: 0, totalCount: 0, currentCount: 0, page: 1, perPage, ...(json ?? {}) } as OdcloudPage<T>
      break
    }
    rows.push(...json.data)
    matchCount = Number(json.matchCount ?? rows.length)
    totalCount = Number(json.totalCount ?? 0)
    if (json.data.length < perPage || rows.length >= matchCount) break
  }
  return {
    data: rows,
    matchCount,
    totalCount,
    currentCount: rows.length,
    page: 1,
    perPage,
    truncated: rows.length < matchCount || undefined,
  }
}

/** 한 달(YYYYMM) 또는 기간 조건 */
export function monthCond(from: string, to = from): Record<string, string> {
  const c: Record<string, string> = {}
  if (from) c['cond[STAT_DE::GTE]'] = from
  if (to) c['cond[STAT_DE::LTE]'] = to
  return c
}
