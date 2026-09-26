import type { Property, PropertyStatus } from '@/lib/crm/types'
import type { OpportunityRow } from '@/lib/db/types'
import * as repo from '@/lib/db/repo'

/**
 * CRM 저장소(opportunities)의 **실제 공고**를 소비자 화면 모델로 옮긴다.
 *
 * 두 가지를 섞지 않는다.
 *  - `is_demo = false` — 청약홈 등에서 수집한 실제 공고. 여기서만 가져온다.
 *  - `is_demo = true`  — 운영 시연용. 소비자 화면에 내보내지 않는다.
 *
 * 원본이 주지 않는 값(면적·보증금·월 임대료)은 null 로 남긴다.
 * 0 으로 채우면 무료 임대처럼 읽히고, 예산 판정까지 틀어진다.
 */

const SOURCE_LABEL: Record<string, string> = {
  APPLYHOME: '청약홈 (공공데이터포털)',
  LH: 'LH 청약플러스 (공공데이터포털)',
}

/**
 * 접수 상태는 **읽는 날** 기준으로 다시 센다.
 *
 * 저장된 status 는 수집하던 순간의 값이다. 공고는 가만히 있어도 날짜가 지나면
 * 상태가 바뀌는데 저장값은 그대로 남아, 오늘 마감인 공고가 며칠 전에 찍힌
 * '접수 예정'을 계속 달고 있었다. 운영 화면의 '접수 중 / 접수 예정' 집계가
 * 매일 조금씩 틀어지고, 끝난 공고가 목록에 남는다.
 *
 * 날짜가 없으면 저장값을 그대로 둔다 — 모르는 것을 지어내지 않는다.
 * 취소(CANCELLED)도 그대로 둔다. 그건 날짜로는 알 수 없는 사실이다.
 */
function statusToday(row: OpportunityRow, today: Date): PropertyStatus {
  if (row.status === 'CANCELLED') return 'CANCELLED'
  const { application_start: start, application_end: end } = row
  if (!start || !end) return row.status
  const t = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(
    today.getDate(),
  ).padStart(2, '0')}`
  if (t < start) return 'UPCOMING'
  if (t > end) return 'CLOSED'
  return 'OPEN'
}

/** 공고가 '민영'·'국민' 처럼 자체 표기를 쓰면 그대로 둔다 */
function displayType(row: OpportunityRow): string {
  const t = (row.housing_type ?? '').trim()
  if (t) return t
  return row.opportunity_type === 'SUBSCRIPTION' ? '분양' : '임대'
}

function toProperty(row: OpportunityRow, today = new Date()): Property {
  return {
    id: row.id,
    source: SOURCE_LABEL[row.source] ?? row.source,
    announcementId: row.external_id ?? row.id,
    name: row.title,
    housingType: displayType(row),
    region: row.region,
    // 광역명이 없으면 만들지 않는다. 지역명을 두 번 찍게 된다 ("전북 전북").
    district: row.district ?? '',
    address: row.address ?? '',
    area: row.area,
    deposit: row.deposit,
    monthlyRent: row.monthly_rent,
    supplyCount: row.supply_count ?? 0,
    vacancyCount: row.vacancy_count ?? 0,
    applicationStart: row.application_start,
    applicationEnd: row.application_end,
    documentDeadline: row.document_deadline,
    resultDate: row.result_date,
    contractStart: row.contract_start,
    sourceUrl: row.source_url,
    status: statusToday(row, today),
    competitionRate: row.competition_rate,
    // 수집 뒤에 미리 찾아 둔 좌표. 없으면 지도가 지역 기준점으로 물러선다
    lat: row.lat,
    lng: row.lng,
    geoSource: row.geo_source,
    dataOrigin: 'OFFICIAL',
  }
}

export interface OfficialQuery {
  region?: string
  /** 공고 표기 기준. 선택지 이름과 정확히 같지 않을 수 있어 부분일치로 본다 */
  housingType?: string
  limit?: number
}

/**
 * 실제 공고 목록. 저장소 오류로 화면 전체가 죽지 않게 빈 배열로 떨어진다.
 * 실패를 예시 데이터로 덮지 않는다 — 호출부가 개수로 구분한다.
 */
export async function listOfficialProperties(q: OfficialQuery = {}): Promise<Property[]> {
  try {
    const rows = await repo.listOpportunities({
      region: q.region,
      includeDemo: false,
      limit: q.limit ?? 100,
    })
    const today = new Date()
    const out = rows.map(row => toProperty(row, today))
    if (!q.housingType) return out
    return out.filter(p => p.housingType.includes(q.housingType!) || q.housingType!.includes(p.housingType))
  } catch {
    return []
  }
}

/** 실제 공고 1건. 없으면 null (예시 공고 조회는 호출부가 따로 한다) */
export async function findOfficialProperty(id: string): Promise<Property | null> {
  try {
    const row = await repo.getOpportunity(id)
    if (!row || row.is_demo) return null
    return toProperty(row)
  } catch {
    return null
  }
}
