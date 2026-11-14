import { dataPortalKey, hasDataPortalKey } from '@/lib/config/data-portal-key'
import type { OpportunityRow } from '@/lib/db/types'

/**
 * 청약홈 OpenAPI (공공데이터포털) 어댑터.
 *
 * 이 어댑터는 "모집공고" 정보를 가져온다.
 * 개별 호실의 실시간 공실 정보는 공개 API 범위 밖이므로 만들어내지 않는다.
 *
 * 인증키가 없거나 거부되면 빈 배열과 사유를 반환하고,
 * 상위 레이어가 예시 데이터로 폴백한다. 실패를 조용히 숨기지 않는다.
 */

const BASE = 'https://api.odcloud.kr/api'

export interface FetchResult {
  rows: Partial<OpportunityRow>[]
  ok: boolean
  reason: string | null
  fetchedAt: string
}

interface ApplyhomeItem {
  HOUSE_MANAGE_NO?: string
  PBLANC_NO?: string
  HOUSE_NM?: string
  HOUSE_SECD_NM?: string
  HOUSE_DTL_SECD_NM?: string
  SUBSCRPT_AREA_CODE_NM?: string
  HSSPLY_ADRES?: string
  TOT_SUPLY_HSHLDCO?: string
  RCEPT_BGNDE?: string
  RCEPT_ENDDE?: string
  PRZWNER_PRESNATN_DE?: string
  CNTRCT_CNCLS_BGNDE?: string
  PBLANC_URL?: string
}

function isoDate(raw: string | undefined): string | null {
  if (!raw) return null
  const d = raw.replace(/[^\d]/g, '')
  if (d.length !== 8) return null
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`
}

function statusOf(start: string | null, end: string | null, today = new Date()): OpportunityRow['status'] {
  if (!start || !end) return 'UPCOMING'
  const t = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(
    today.getDate(),
  ).padStart(2, '0')}`
  if (t < start) return 'UPCOMING'
  if (t > end) return 'CLOSED'
  return 'OPEN'
}

/**
 * "서울특별시 관악구 ..." → "관악구", "충청남도 천안시 서북구 ..." → "서북구".
 *
 * 주소 뒤쪽에는 '회천지구'·'평택고덕국제화계획지구' 같은 지구명이 붙는데
 * 이것도 '구' 로 끝나서 지역으로 잘못 잡힌다. 지역이 아닌 말은 먼저 걸러낸다.
 */
const NOT_A_REGION = /(지구|단지|택지|블록|블럭|권역|지역)$/

function regionFromAddress(address: string | undefined, fallback: string | undefined): string {
  if (address) {
    const m = (address.match(/([가-힣]+[시군구])(?:\s|$)/g) ?? [])
      .map(t => t.trim())
      .filter(t => t.length >= 2 && !NOT_A_REGION.test(t))
    // 광역시·도 다음에 오는 기초자치단체를 쓴다 (없으면 유일한 값)
    if (m.length >= 2) return m[1]
    if (m.length === 1) return m[0]
  }
  return (fallback ?? '').trim()
}

export function normalizeApplyhome(items: ApplyhomeItem[], fetchedAt: string): Partial<OpportunityRow>[] {
  return items
    .filter(it => it.HOUSE_NM && it.PBLANC_NO)
    .map(it => {
      const start = isoDate(it.RCEPT_BGNDE)
      const end = isoDate(it.RCEPT_ENDDE)
      return {
        source: 'APPLYHOME',
        external_id: `${it.HOUSE_MANAGE_NO ?? ''}-${it.PBLANC_NO ?? ''}`,
        opportunity_type: 'SUBSCRIPTION' as const,
        housing_type: (it.HOUSE_DTL_SECD_NM || it.HOUSE_SECD_NM || '분양').trim(),
        title: (it.HOUSE_NM ?? '').trim(),
        region: regionFromAddress(it.HSSPLY_ADRES, it.SUBSCRPT_AREA_CODE_NM),
        district: (it.SUBSCRPT_AREA_CODE_NM ?? '').trim() || null,
        address: (it.HSSPLY_ADRES ?? '').trim() || null,
        // 분양 공고는 전용면적·보증금·월세가 이 엔드포인트에 없다. 만들어내지 않는다.
        area: null,
        deposit: null,
        monthly_rent: null,
        supply_count: it.TOT_SUPLY_HSHLDCO ? Number(it.TOT_SUPLY_HSHLDCO) || null : null,
        vacancy_count: null,
        application_start: start,
        application_end: end,
        // 서류 마감은 이 엔드포인트가 제공하지 않는다
        document_deadline: null,
        result_date: isoDate(it.PRZWNER_PRESNATN_DE),
        contract_start: isoDate(it.CNTRCT_CNCLS_BGNDE),
        status: statusOf(start, end),
        source_url: (it.PBLANC_URL ?? '').trim() || null,
        competition_rate: null,
        is_demo: false,
        updated_at: fetchedAt,
      }
    })
    .filter(r => r.region)
}

export function isApplyhomeConfigured() {
  return hasDataPortalKey()
}

export async function fetchApplyhome(opts: { perPage?: number; monthsBack?: number } = {}): Promise<FetchResult> {
  const fetchedAt = new Date().toISOString()
  const key = dataPortalKey()

  if (!key) {
    return {
      rows: [],
      ok: false,
      reason: 'DATA_GO_KR_API_KEY 가 설정되지 않았습니다.',
      fetchedAt,
    }
  }

  const { perPage = 100, monthsBack = 2 } = opts
  const from = new Date()
  from.setMonth(from.getMonth() - monthsBack)
  const dateFrom = `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, '0')}-${String(
    from.getDate(),
  ).padStart(2, '0')}`

  const params = new URLSearchParams({
    serviceKey: key,
    page: '1',
    perPage: String(perPage),
    returnType: 'JSON',
    'cond[RCRIT_PBLANC_DE::GTE]': dateFrom,
  })

  try {
    const res = await fetch(`${BASE}/ApplyhomeInfoDetailSvc/v1/getAPTLttotPblancDetail?${params}`, {
      next: { revalidate: 300 },
      // 원천이 멈추면 수집 함수 전체가 시간 초과로 죽고 기록도 못 남긴다 — 출처마다 25초에서 끊는다
      signal: AbortSignal.timeout(25_000),
    })
    const json = await res.json()

    // 공공데이터포털은 200 으로 오류 본문을 주기도 한다
    if (json?.code !== undefined && json.code < 0) {
      return { rows: [], ok: false, reason: `공공데이터포털 응답: ${json.msg ?? json.code}`, fetchedAt }
    }
    if (!Array.isArray(json?.data)) {
      return { rows: [], ok: false, reason: '예상과 다른 응답 형식입니다.', fetchedAt }
    }

    return { rows: normalizeApplyhome(json.data as ApplyhomeItem[], fetchedAt), ok: true, reason: null, fetchedAt }
  } catch (err) {
    return {
      rows: [],
      ok: false,
      reason: `호출 실패: ${err instanceof Error ? err.message : String(err)}`,
      fetchedAt,
    }
  }
}
