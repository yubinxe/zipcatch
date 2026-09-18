import { listOfficialProperties } from '@/lib/consumer/official'
import { isRental, provinceOf } from '@/lib/consumer/classify'
import { resolveCoord } from '@/lib/consumer/geo'
import { geocodeMany, geocodeByName, isGeocodingConfigured } from '@/lib/consumer/geocode'
import { checkUrgency } from '@/lib/crm/services/scoring'

export const dynamic = 'force-dynamic'
/** 캐시가 빈 첫 호출은 지오코딩을 한 바퀴 돌아야 한다. 중간에 끊기면 지도가 빈다 */
export const maxDuration = 60

/**
 * 지도에 올릴 공고.
 *
 * 좌표는 서버가 정할 수 있는 데까지 정해서 내보낸다. 주소가 있으면 브라우저가
 * 지오코딩해 더 정확한 점으로 바꿔 놓는다 — 서버는 지오코딩 키를 쓰지 않는다.
 *
 * 좌표를 못 정한 건은 버리지 않고 수를 세어 넘긴다. 지도에 안 보이는 공고가
 * 없는 공고처럼 읽히면, 지도를 믿고 목록을 안 보게 된다.
 */
export async function GET() {
  try {
    const now = new Date()
    const all = await listOfficialProperties({ limit: 400 })

    // 주소가 있는 건은 먼저 좌표로 바꿔둔다. 지오코딩 키가 없거나 못 찾으면
    // 아래에서 지역 기준으로 물러선다 — 지도가 비는 일은 없다.
    const geocoded = isGeocodingConfigured()
      ? await geocodeMany(all.map(p => p.address)).catch(() => new Map())
      : new Map()

    /**
     * 주소가 없는 공고는 이름으로 찾는다.
     *
     * LH 공고에는 주소 칸이 아예 없어, 지금까지 광역 기준점으로 물러서 도청
     * 한 점에 수십 건이 겹쳤다. 지도가 "경기에 공고가 있다"까지만 말하고
     * "어디"를 말하지 못했다.
     *
     * 이름에는 자리가 적혀 있다 — '평택고덕 A57-2블록'. 한 건마다 두 번씩
     * 물어야 하므로 한꺼번에 몰아 보내지 않고 끊어 보낸다.
     *
     * 끊는 폭이 여섯일 때 첫 호출이 33초 걸렸다. 하루 캐시가 걸려 있어 그
     * 뒤로는 2초지만, 그 한 번이 발표 중일 수 있다. 폭을 넓혀 줄인다 —
     * 카카오 쪽 하루 한도에 견주면 이 정도 호출은 크지 않다.
     */
    const byName = new Map<string, { lat: number; lng: number }>()
    if (isGeocodingConfigured()) {
      const needy = all.filter(p => !(p.address ?? '').trim())
      for (let i = 0; i < needy.length; i += 16) {
        const slice = needy.slice(i, i + 16)
        const hits = await Promise.all(
          slice.map(p => geocodeByName(p.name, provinceOf(p)).catch(() => null)),
        )
        slice.forEach((p, n) => {
          const hit = hits[n]
          if (hit) byName.set(p.id, { lat: hit.lat, lng: hit.lng })
        })
      }
    }

    const pins = []
    let noCoord = 0
    const byProvince = new Map<string, number>()

    for (const p of all) {
      const urgency = checkUrgency(p, now)
      if (urgency.level === 'CLOSED') continue

      const province = provinceOf(p)
      byProvince.set(province, (byProvince.get(province) ?? 0) + 1)

      const coord = resolveCoord({
        geocoded: geocoded.get((p.address ?? '').trim()) ?? byName.get(p.id) ?? null,
        address: p.address,
        region: p.region,
        province,
      })
      if (!coord) {
        noCoord++
        continue
      }

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
      /** 주소를 좌표로 바꿔 정확히 찍은 건 */
      geocoded: pins.filter(p => p.coordSource === 'GEOCODED').length,
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
