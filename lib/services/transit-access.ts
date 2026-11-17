import { FEATURES } from '@/lib/features'
import { resolveNoticeLocation } from '@/lib/consumer/location'
import { verifiedForNotice } from '@/lib/consumer/complex-visualization'
import { resolveSiteGeometry } from '@/lib/consumer/site-resolver'
import type { Property } from '@/lib/crm/types'
import {
  buildStationIndex,
  mergeStationRecords,
  transitAccessibility,
  type StationIndex,
  type StationRecord,
  type TransitAccessibility,
} from '@/lib/geo/transit-accessibility'

/**
 * 공고 기준 역세권·교통 입지 조회 서비스.
 *
 * - `FEATURES.transitAccess` 스위치가 꺼져 있거나 공식 역 데이터가 아직 적재되지 않은 경우
 *   지어낸 수치 없이 `NOT_AVAILABLE` 상태와 사유를 돌려준다.
 * - `docs/domain/transit-premium-hypothesis-v0.md` 원칙에 따라 공고명 좌표·시군구·시도 기준점은
 *   거리를 산출하지 않는다.
 */

let cachedIndex: StationIndex | null = null

export function setStationRecords(records: StationRecord[], version: string): StationIndex {
  const merged = mergeStationRecords(records)
  cachedIndex = buildStationIndex(merged, version)
  return cachedIndex
}

export function getStationIndex(): StationIndex | null {
  return cachedIndex
}

export async function evaluateNoticeTransitAccess(
  property: Pick<Property, 'id' | 'name' | 'announcementId' | 'lat' | 'lng' | 'geoSource' | 'address' | 'district' | 'region'>,
  opts: { index?: StationIndex | null; forceEnabled?: boolean } = {},
): Promise<TransitAccessibility & { enabled: boolean }> {
  const enabled = opts.forceEnabled ?? FEATURES.transitAccess
  const hit = verifiedForNotice({ id: property.id, name: property.name, announcementId: property.announcementId })
  const site = hit ? await resolveSiteGeometry(hit) : null
  const loc = resolveNoticeLocation(property, { parcel: site?.parcel ?? null })

  if (!enabled) {
    return {
      enabled: false,
      status: 'NOT_AVAILABLE',
      provenance: loc.provenance,
      method: 'NOT_AVAILABLE',
      nearest: null,
      alternatives: [],
      searchRadiusM: 1500,
      stationDataVersion: null,
      walkNetwork: null,
      reason: '역세권 입지 분석 기능이 아직 활성화되지 않았습니다.',
    }
  }

  const index = opts.index !== undefined ? opts.index : getStationIndex()
  const access = await transitAccessibility({ provenance: loc.provenance, point: loc.point }, index)
  return { enabled: true, ...access }
}
