import { listOfficialProperties } from '@/lib/consumer/official'
import { isRental, provinceOf } from '@/lib/consumer/classify'
import { resolveCoord } from '@/lib/consumer/geo'
import { checkUrgency } from '@/lib/crm/services/scoring'

export const dynamic = 'force-dynamic'

/**
 * 지도에 올릴 공고.
 *
 * ── 여기서는 좌표를 찾지 않는다 ──
 *
 * 예전에는 이 길에서 주소와 공고명을 카카오에 물어 좌표로 바꿨다. 한 인스턴스가
 * 사는 동안은 메모리에 남지만 서버리스에서는 인스턴스가 수시로 새로 뜨고,
 * 그때마다 공고 예순 건에 백스무 번을 묻느라 첫 화면이 스무 초 넘게 비었다.
 * 발표 도중에 그 한 번이 걸리면 지도가 없는 것과 같다.
 *
 * 좌표는 공고가 뜬 뒤 바뀌지 않으므로 읽을 때 찾을 이유가 없다. 수집 뒤에
 * 따로 채워 두고(lib/services/geocode-fill.ts) 여기서는 저장된 값만 읽는다.
 * 바깥으로 나가는 호출이 없으니 저장소를 읽는 시간이 전부다.
 *
 * 아직 못 찾은 공고는 버리지 않는다. 지역 기준점으로 물러서서 찍고, 그 수를
 * 함께 넘긴다 — 지도에 안 보이는 공고가 없는 공고처럼 읽히면 지도를 믿고
 * 목록을 안 보게 된다.
 */
export async function GET() {
  try {
    const now = new Date()
    const all = await listOfficialProperties({ limit: 400 })

    const pins = []
    let noCoord = 0
    let exact = 0
    const byProvince = new Map<string, number>()

    for (const p of all) {
      const urgency = checkUrgency(p, now)
      if (urgency.level === 'CLOSED') continue

      const province = provinceOf(p)
      byProvince.set(province, (byProvince.get(province) ?? 0) + 1)

      // 저장해 둔 좌표가 있으면 그것이 가장 정확하다. 없으면 지역 기준점.
      const stored = p.lat !== null && p.lng !== null ? { lat: p.lat, lng: p.lng } : null
      const coord = resolveCoord({
        geocoded: stored,
        address: p.address,
        region: p.region,
        province,
      })
      if (!coord) {
        noCoord++
        continue
      }
      if (stored) exact++

      pins.push({
        id: p.id,
        name: p.name,
        province,
        region: p.region,
        housingType: p.housingType,
        address: p.address || null,
        kind: isRental(p.housingType) ? ('RENT' as const) : ('SALE' as const),
        deposit: p.deposit,
        monthlyRent: p.monthlyRent,
        applicationEnd: p.applicationEnd,
        daysLeft: urgency.daysLeft,
        urgencyLabel: urgency.label,
        lat: coord.lat,
        lng: coord.lng,
        coordSource: coord.source,
      })
    }

    return Response.json({
      pins,
      total: pins.length + noCoord,
      noCoord,
      /** 주소가 아예 없는 건 — LH 목록에는 주소 칸이 없다 */
      noAddress: pins.filter(p => !p.address).length,
      /** 미리 찾아 둔 좌표로 정확히 찍은 건. 나머지는 지역 기준점이다 */
      geocoded: exact,
      provinces: [...byProvince.entries()]
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count),
    })
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : '지도를 불러오지 못했습니다.' },
      { status: 500 },
    )
  }
}
