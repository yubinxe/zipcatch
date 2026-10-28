import { dataPortalKey, hasDataPortalKey } from '@/lib/config/data-portal-key'
import type { OpportunityRow } from '@/lib/db/types'
import type { FetchResult } from './applyhome'

/**
 * LH 청약플러스 임대공고 어댑터 (공공데이터포털 B552555).
 *
 * 청약홈 분양정보와 달리 **임대** 공고를 준다. 이 제품의 본류다.
 * 다만 목록 API 에는 보증금·월 임대료·전용면적이 없다 — 공고문(PDF) 안에 있다.
 * 없는 값은 null 로 두고 화면에서 "모집공고문 확인"으로 적는다.
 *
 * 공공데이터포털 인증키를 청약홈과 공유해서 쓴다. 키가 없으면 빈 배열과 사유를 돌려주고,
 * 실패를 예시 데이터로 덮지 않는다.
 */

const ENDPOINT = 'https://apis.data.go.kr/B552555/lhLeaseNoticeInfo1/lhLeaseNoticeInfo1'

interface LhItem {
  PAN_ID?: string
  PAN_NM?: string
  /** 국민임대 · 행복주택 · 매입임대 … */
  AIS_TP_CD_NM?: string
  /** 상위 유형 — 임대주택 / 분양주택 */
  UPP_AIS_TP_NM?: string
  /** 광역시·도 */
  CNP_CD_NM?: string
  /** 공고 게시일 "2026.09.15" */
  PAN_NT_ST_DT?: string
  /** 마감일 "2026.09.30" */
  CLSG_DT?: string
  /** 공고중 / 마감 */
  PAN_SS?: string
  DTL_URL?: string
}

/** "2026.09.15" · "20260915" → "2026-09-15" */
function isoDate(raw: string | undefined): string | null {
  if (!raw) return null
  const d = raw.replace(/[^\d]/g, '')
  if (d.length !== 8) return null
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`
}

/**
 * LH 는 지역을 **지역본부 단위**로만 준다 ("전남광주통합", "강원특별자치도").
 * 아는 것만 짧은 이름으로 바꾸고, 모르는 값은 그대로 둔다.
 */
const PROVINCE: Record<string, string> = {
  서울특별시: '서울',
  서울지역본부: '서울',
  부산광역시: '부산',
  대구광역시: '대구',
  인천광역시: '인천',
  광주광역시: '광주',
  대전광역시: '대전',
  울산광역시: '울산',
  세종특별자치시: '세종',
  경기도: '경기',
  강원도: '강원',
  강원특별자치도: '강원',
  충청북도: '충북',
  충청남도: '충남',
  전라북도: '전북',
  전북특별자치도: '전북',
  전라남도: '전남',
  경상북도: '경북',
  경상남도: '경남',
  제주특별자치도: '제주',
  // LH 지역본부 표기 — 행정구역명이 아니라 본부 관할이다. 임의로 한 곳으로 줄이지 않는다.
  전남광주통합특별시: '전남·광주',
  '대구광역시 외': '대구 외',
  '대전광역시 외': '대전 외',
  '인천광역시 외': '인천 외',
  전국: '전국',
}

export function shortProvince(raw: string | undefined): string {
  const s = (raw ?? '').trim()
  return PROVINCE[s] ?? s
}

/**
 * 공고명에서 시·군·구를 뽑지 않는다.
 *
 * "무안 오룡마을 남악휴먼시아 …" 에서 '남악휴먼시' 를, "근린생활시설" 에서 '근린생활시' 를
 * 지역으로 잡는 사고가 난다. 지자체명 사전 없이 하는 추정은 틀릴 때 조용히 틀린다.
 * 목록 API 가 주는 지역본부 단위를 그대로 쓰고, 세부 지역은 공고문에서 확인하게 둔다.
 */

/** 주거가 아닌 공고 — 상가·토지·주차장은 이 서비스의 대상이 아니다 */
const NOT_HOUSING = /(상가|토지|주차장|창고|공장|사무|매점|자판기)/

function statusOf(item: LhItem, end: string | null, today: string): OpportunityRow['status'] {
  if ((item.PAN_SS ?? '').includes('마감')) return 'CLOSED'
  if (end && today > end) return 'CLOSED'
  return 'OPEN'
}

export function normalizeLh(items: LhItem[], fetchedAt: string): Partial<OpportunityRow>[] {
  const today = fetchedAt.slice(0, 10)

  return items
    .filter(it => it.PAN_ID && it.PAN_NM)
    .map(it => {
      const province = shortProvince(it.CNP_CD_NM)
      const title = (it.PAN_NM ?? '').trim()
      const end = isoDate(it.CLSG_DT)
      const type = (it.AIS_TP_CD_NM || it.UPP_AIS_TP_NM || '임대').trim()

      return {
        source: 'LH',
        external_id: it.PAN_ID!.trim(),
        opportunity_type: 'RENTAL' as const,
        housing_type: type,
        title,
        // 지역본부 단위다. 공고명에서 시·군·구를 추정하지 않는다.
        region: province,
        district: null,
        address: null,
        // 목록 API 에 없는 값이다. 공고문에서만 확인된다.
        area: null,
        deposit: null,
        monthly_rent: null,
        supply_count: null,
        vacancy_count: null,
        // 목록 API 는 접수 시작일을 주지 않는다. 공고 게시일을 접수일로 바꿔 쓰지 않는다.
        application_start: null,
        application_end: end,
        document_deadline: null,
        result_date: null,
        contract_start: null,
        status: statusOf(it, end, today),
        source_url: (it.DTL_URL ?? '').trim() || null,
        competition_rate: null,
        is_demo: false,
        updated_at: fetchedAt,
      }
    })
    .filter(r => r.region)
    // 주거 공고만 남긴다
    .filter(r => !NOT_HOUSING.test(r.housing_type ?? '') && !NOT_HOUSING.test(r.title ?? ''))
}

export function isLhConfigured() {
  return hasDataPortalKey()
}

export async function fetchLh(opts: { perPage?: number } = {}): Promise<FetchResult> {
  const fetchedAt = new Date().toISOString()
  const key = dataPortalKey()

  if (!key) {
    return { rows: [], ok: false, reason: 'DATA_GO_KR_API_KEY 가 설정되지 않았습니다.', fetchedAt }
  }

  const params = new URLSearchParams({
    serviceKey: key,
    PG_SZ: String(opts.perPage ?? 200),
    PAGE: '1',
  })

  try {
    const res = await fetch(`${ENDPOINT}?${params}`, { next: { revalidate: 300 } })
    const text = await res.text()

    // 인증 오류는 200 이 아니라 XML 로 돌아온다
    if (text.trimStart().startsWith('<')) {
      const msg = text.match(/<returnAuthMsg>(.*?)<\/returnAuthMsg>/)?.[1] ?? `HTTP ${res.status}`
      return { rows: [], ok: false, reason: `LH API 응답: ${msg}`, fetchedAt }
    }

    const json = JSON.parse(text) as unknown
    if (!Array.isArray(json)) {
      return { rows: [], ok: false, reason: '예상과 다른 응답 형식입니다.', fetchedAt }
    }

    const listBlock = json.find(
      (b): b is { dsList: LhItem[] } =>
        typeof b === 'object' && b !== null && Array.isArray((b as { dsList?: unknown }).dsList),
    )
    if (!listBlock) {
      // 조회 결과가 없을 때도 dsList 가 빠진다. 오류로 단정하지 않는다.
      return { rows: [], ok: true, reason: null, fetchedAt }
    }

    return { rows: normalizeLh(listBlock.dsList, fetchedAt), ok: true, reason: null, fetchedAt }
  } catch (err) {
    return {
      rows: [],
      ok: false,
      reason: `호출 실패: ${err instanceof Error ? err.message : String(err)}`,
      fetchedAt,
    }
  }
}
