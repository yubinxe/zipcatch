import { dataPortalKey, hasDataPortalKey } from '@/lib/config/data-portal-key'

/**
 * 청약홈 표를 **통째로** 받아 온다.
 *
 * 공고 한 건씩 묻는 화면과 달리, 시장을 보려면 표 전체가 필요하다.
 * 공고 2,884건 · 주택형 14,746행 · 경쟁률 54,977행을 이어 받는다.
 *
 * ── 쪽 크기는 엔드포인트마다 다르다 ──
 *
 * 한 번에 몇 행까지 주는지가 표마다 다르고, **넘치면 오류가 아니라 빈 배열**이
 * 온다. 주택형 표는 perPage=3000 을 받는데 공고 표에 같은 값을 주면
 *
 *     { "code": 0, "msg": "정상", "data": [] }
 *
 * 가 돌아온다. 오류로 안 보이니 그냥 "공고가 없네" 하고 지나치게 된다.
 * 실제로 한 번 당했다. 그래서 쪽 크기를 표마다 따로 적고, 첫 쪽이 비면
 * 이유를 붙여 실패로 돌려준다 — 빈 결과를 성공인 척하지 않는다.
 *
 * ── 캐시 ──
 *
 * 지난 공고는 바뀌지 않는다. 오래 잡아 둔다. Next 의 데이터 캐시는 항목마다
 * 크기 상한이 있어서, 쪽을 너무 크게 잡으면 캐시에 들어가지 못하고 매번
 * 바깥으로 나간다. 쪽 크기는 그 선도 함께 본 값이다.
 */

const BASE = 'https://api.odcloud.kr/api'

export interface BulkResult<T> {
  rows: T[]
  ok: boolean
  reason: string | null
  /** 실제로 받은 쪽 수 — 표본을 숨기지 않는다 */
  pages: number
}

export async function fetchAllPages<T>(
  path: string,
  opts: { perPage: number; maxPages?: number; revalidate?: number },
): Promise<BulkResult<T>> {
  const key = dataPortalKey()
  if (!hasDataPortalKey()) {
    return { rows: [], ok: false, reason: 'DATA_GO_KR_API_KEY 가 설정되지 않았습니다.', pages: 0 }
  }

  const { perPage, maxPages = 40, revalidate = 21600 } = opts
  const rows: T[] = []
  let pages = 0

  try {
    for (let page = 1; page <= maxPages; page++) {
      const params = new URLSearchParams({
        serviceKey: key,
        page: String(page),
        perPage: String(perPage),
        returnType: 'JSON',
      })
      const res = await fetch(`${BASE}${path}?${params}`, { next: { revalidate } })
      if (!res.ok) {
        return { rows, ok: false, reason: `응답 ${res.status} (${page}쪽)`, pages }
      }
      const json = await res.json()
      if (json?.code !== undefined && json.code < 0) {
        return { rows, ok: false, reason: `공공데이터포털 응답: ${json.msg ?? json.code}`, pages }
      }
      const data: T[] = Array.isArray(json?.data) ? json.data : []
      pages = page

      // 첫 쪽이 비면 쪽 크기를 넘겼다는 뜻일 가능성이 크다. 조용히 넘어가면
      // "자료가 없다"로 읽히므로 여기서 멈추고 이유를 적는다.
      if (page === 1 && data.length === 0) {
        return {
          rows,
          ok: false,
          reason: `첫 쪽이 비어 있습니다 (perPage=${perPage}). 쪽 크기가 이 표의 상한을 넘었을 수 있습니다.`,
          pages,
        }
      }

      rows.push(...data)
      if (data.length < perPage) break
    }
    return { rows, ok: true, reason: null, pages }
  } catch (err) {
    return {
      rows,
      ok: false,
      reason: `호출 실패: ${err instanceof Error ? err.message : String(err)}`,
      pages,
    }
  }
}

/** 표마다 확인한 쪽 크기. 넘기면 빈 배열이 오므로 짐작하지 않는다 */
export const APPLYHOME_TABLES = {
  /** 분양 공고 — 시행사·시공사·지역·일정·규제 */
  announcements: { path: '/ApplyhomeInfoDetailSvc/v1/getAPTLttotPblancDetail', perPage: 500 },
  /** 주택형별 공급 — 공급면적과 분양 최고금액. 평당가는 여기서 나온다 */
  models: { path: '/ApplyhomeInfoDetailSvc/v1/getAPTLttotPblancMdl', perPage: 3000 },
  /** 접수 경쟁률 — 미달 여부 */
  competition: { path: '/ApplyhomeInfoCmpetRtSvc/v1/getAPTLttotPblancCmpet', perPage: 3000 },
} as const
