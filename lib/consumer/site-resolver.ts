import type { VerifiedSource } from './complex-visualization'
import { loadSite } from './sites'

/**
 * 공고마다 새 현장 파일을 손으로 쓰지 않아도 되게 — 형상 자료를 찾는 하나의 길.
 *
 * 등록부(VERIFIED)에 현장 열쇠(siteKey)가 있으면 그 자료를 읽고, 없으면 'NONE' 이다. 공고가 새로
 * 들어오면 이 함수가 그대로 NONE 을 돌려주고, 탐험은 위치 등급만큼(동네·지역·전국) 열린다.
 * 원문 대조 현장 자료가 생기면 등록부에 한 줄을 더하는 것만으로 단지 단계가 열린다.
 *
 * 고덕강일 3단지는 그렇게 등록된 사례 하나일 뿐, 기본값이 아니다.
 *
 *   AUTHORIZED_MODEL    사용 허락을 받은 실제 3D 모델 — 아직 어느 공고에도 없다
 *   VERIFIED_MASSING    원문의 동·층·주택형을 세운 매스 모형(외관 아님)
 *   VERIFIED_FOOTPRINTS 확인된 동 윤곽·높이만(주택형 자료 없음)
 *   NONE                현장 형상 자료 없음 — 부르는 쪽이 동네/지역/알 수 없음으로 고른다
 */
export type SiteGeometryKind =
  | 'AUTHORIZED_MODEL'
  | 'VERIFIED_MASSING'
  | 'VERIFIED_FOOTPRINTS'
  | 'PUBLIC_FOOTPRINTS'
  | 'NEIGHBORHOOD_ONLY'
  | 'REGION_ONLY'
  | 'UNKNOWN'
  | 'NONE'

export interface SiteResolution {
  kind: SiteGeometryKind
  /** 원문 대조 현장의 기준점 — 필지 확인 좌표로 쓴다 */
  parcel: { lat: number; lng: number } | null
}

export async function resolveSiteGeometry(hit: { id: string; src: VerifiedSource } | null): Promise<SiteResolution> {
  if (!hit?.src.siteKey) return { kind: 'NONE', parcel: null }
  const site = await loadSite(hit.src.siteKey).catch(() => null)
  if (!site) return { kind: 'NONE', parcel: null }
  const hasTypes = site.types.length > 0 && site.units.length > 0
  return { kind: hasTypes ? 'VERIFIED_MASSING' : 'VERIFIED_FOOTPRINTS', parcel: site.origin }
}
