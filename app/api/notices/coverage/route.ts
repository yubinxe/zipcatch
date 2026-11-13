import { listOfficialProperties, OfficialReadError } from '@/lib/consumer/official'
import { verifiedForNotice } from '@/lib/consumer/complex-visualization'
import { resolveNoticeLocation, type LocationProvenance } from '@/lib/consumer/location'

/**
 * 공간 범위 집계 — 실제 저장된 공고로만 센다. 읽기 전용, 개인 정보 없음(건수만).
 *
 *  위치 등급별 건수(필지·주소·공고명·시군구·시도·모름) — 저장된 좌표를 검사한 뒤의 등급
 *  검사에서 내린 좌표의 사유별 건수
 *  동네 단계를 열 수 있는 공고(한 점 또는 범위) · 원문 대조 매스가 있는 공고 · 허락받은 실제 모델(0)
 *
 * '공개 건물 맥락이 실제로 있는가'는 그 자리의 지도 자료를 받아 봐야 안다 — 여기서는 받지 않는다.
 * 그래서 그 칸은 '받을 수 있는 자리'의 수로만 적는다(neighborhoodEligible).
 */
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const all = await listOfficialProperties({ limit: 1000 })
    const byProvenance: Record<LocationProvenance, number> = {
      PARCEL_CONFIRMED: 0,
      ADDRESS_GEOCODED: 0,
      NAME_GEOCODED: 0,
      DISTRICT_APPROXIMATE: 0,
      PROVINCE_APPROXIMATE: 0,
      UNKNOWN: 0,
    }
    const rejected: Record<string, number> = {}
    let storedCoords = 0
    let storedByAddress = 0
    let storedByName = 0
    let verifiedMassing = 0
    const today = new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10)
    let open = 0
    for (const p of all) {
      if (p.lat !== null && p.lng !== null && p.geoSource !== 'REGION') {
        storedCoords++
        if (p.geoSource === 'ADDRESS') storedByAddress++
        else storedByName++
      }
      const hit = verifiedForNotice({ id: p.id, name: p.name, announcementId: p.announcementId })
      if (hit?.src.siteKey) verifiedMassing++
      const loc = resolveNoticeLocation(p)
      byProvenance[loc.provenance]++
      if (loc.rejectCode) rejected[loc.rejectCode] = (rejected[loc.rejectCode] ?? 0) + 1
      if (!p.applicationEnd || p.applicationEnd >= today) open++
    }
    return Response.json({
      total: all.length,
      openOrUndated: open,
      stored: { withCoordinates: storedCoords, byAddress: storedByAddress, byName: storedByName, without: all.length - storedCoords },
      byProvenance,
      rejected,
      neighborhoodEligible: byProvenance.PARCEL_CONFIRMED + byProvenance.ADDRESS_GEOCODED + byProvenance.NAME_GEOCODED,
      verifiedMassing,
      licensedModels: 0,
      countedAt: new Date().toISOString(),
    })
  } catch (err) {
    const readFailed = err instanceof OfficialReadError
    return Response.json({ error: '공고 저장소를 읽지 못했습니다.', readStatus: readFailed ? 'READ_FAILED' : 'ERROR' }, { status: readFailed ? 503 : 500 })
  }
}
