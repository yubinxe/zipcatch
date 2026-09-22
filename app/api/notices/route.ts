import { NextRequest } from 'next/server'
import { getState } from '@/lib/crm/store'
import { checkUrgency, type UrgencyInfo } from '@/lib/crm/services/scoring'
import { listOfficialProperties } from '@/lib/consumer/official'
import { kindRank, provinceOf } from '@/lib/consumer/classify'
import type { Property } from '@/lib/crm/types'
import {
  fetchSpecialSupply,
  briefOf,
  type SpecialBrief,
} from '@/lib/adapters/applyhome-special'

export const dynamic = 'force-dynamic'

interface Row {
  property: Property
  urgency: UrgencyInfo
  /** 특별공급이 이미 어떻게 끝났는지. 청약홈 분양에만 있고 없으면 생략된다 */
  special?: SpecialBrief
}

/** 필터 선택지는 건수를 함께 준다 — 어디에 공고가 몰려 있는지 골라보기 전에 보이게 */
export interface FilterOption {
  name: string
  count: number
}

function tally(rows: Row[], pick: (r: Row) => string, limit?: number): FilterOption[] {
  const n = new Map<string, number>()
  for (const r of rows) {
    const key = pick(r)
    if (!key) continue
    n.set(key, (n.get(key) ?? 0) + 1)
  }
  const sorted = [...n.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ko'))
    .map(([name, count]) => ({ name, count }))
  return limit ? sorted.slice(0, limit) : sorted
}

/** 분양을 앞에 두고, 그 안에서는 건수 많은 순 */
function tallyByKind(rows: Row[]): FilterOption[] {
  const n = new Map<string, number>()
  for (const r of rows) {
    const key = r.property.housingType
    if (!key) continue
    n.set(key, (n.get(key) ?? 0) + 1)
  }
  return [...n.entries()]
    .sort(
      (a, b) =>
        kindRank(a[0]) - kindRank(b[0]) || b[1] - a[1] || a[0].localeCompare(b[0], 'ko'),
    )
    .map(([name, count]) => ({ name, count }))
}

/**
 * 공개 공고 목록 — 개인 조건 없이 둘러보기용.
 *
 * 기본은 **실제 공고만** 내보낸다. 예시 공고는 화면 구성을 보여주려고 만든
 * 것이지 둘러볼 대상이 아니다. 목록에 섞이면 분류표에 없는 지역·유형이
 * 생기고("마포구" 여덟 건), 고른 뒤에야 예시였다는 걸 알게 된다.
 * 실제 공고가 하나도 없으면 화면이 그 사실을 말한다(`SampleOnlyNotice`).
 *
 * `includeSample=1` 로 예시를 다시 불러올 수 있다 — 시연·점검용 뒷문이다.
 */
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams
    const region = sp.get('region') ?? ''
    const housingType = sp.get('housingType') ?? ''
    const includeSample = sp.get('includeSample') === '1'
    const limit = Math.min(60, Number(sp.get('limit') ?? 24) || 24)
    const now = new Date()

    const decorate = (property: Property): Row => ({ property, urgency: checkUrgency(property, now) })
    const open = (row: Row) => row.urgency.level !== 'CLOSED'

    const officialAll = (await listOfficialProperties({ limit: 200 })).map(decorate).filter(open)
    const sampleAll = includeSample
      ? getState()
          .properties.filter(p => p.status !== 'CLOSED' && p.status !== 'CANCELLED')
          .map(decorate)
          .filter(open)
      : []

    const all = [...officialAll, ...sampleAll]

    // 지역은 광역으로 묶는다. 자치구를 그대로 쓰면 서울 공고가 성북구·중구로
    // 흩어져 "서울"이라는 선택지 자체가 만들어지지 않는다.
    const byRegion = (row: Row) => !region || provinceOf(row.property) === region
    const byType = (row: Row) => !housingType || row.property.housingType === housingType

    // 선택지는 **다른 축의 필터만 적용한** 목록에서 만든다.
    // 지역을 고르면 그 지역에 실제로 있는 유형만 남고, 지역 목록 자체는 줄지 않는다.
    const regions = tally(all.filter(byType), r => provinceOf(r.property), 12)
    const housingTypes = tallyByKind(all.filter(byRegion))

    // 분양을 먼저 세우고, 그 안에서 마감이 가까운 순. 임대 공고는 상시로
    // 쏟아져서 마감순으로만 두면 드물게 열리는 분양이 화면 밖으로 밀린다.
    const notices = all
      .filter(byRegion)
      .filter(byType)
      .sort(
        (a, b) =>
          kindRank(a.property.housingType) - kindRank(b.property.housingType) ||
          (a.urgency.daysLeft ?? 9999) - (b.urgency.daysLeft ?? 9999),
      )
      .slice(0, limit)

    /*
     * 목록에 오른 청약홈 공고만 특별공급 결과를 붙인다.
     *
     * 상세를 열어야만 보이는 신호는 없는 것과 크게 다르지 않다. 어느 공고를
     * 열지 고르는 자리가 바로 여기다.
     *
     * 자르고 나서 부르므로 한 화면 분량(24건) 안쪽이고, 그중 청약홈은 보통
     * 열 건이 되지 않는다. 응답은 30분 캐시라 대개 다시 나가지도 않는다.
     * 그래도 상한을 둔다 — 분양 공고가 몰리는 주에 목록 한 번이 바깥 호출
     * 수십 건으로 불어나면 안 된다.
     */
    const SPECIAL_LOOKUP_MAX = 12
    const applyhome = notices
      .filter(r => r.property.dataOrigin === 'OFFICIAL' && r.property.source.includes('청약홈'))
      .slice(0, SPECIAL_LOOKUP_MAX)

    await Promise.all(
      applyhome.map(async row => {
        // 하나가 실패해도 목록은 그대로 나간다
        const read = await fetchSpecialSupply(row.property.announcementId).catch(() => null)
        const brief = read ? briefOf(read) : null
        if (brief) row.special = brief
      }),
    )

    const officialCount = notices.filter(r => r.property.dataOrigin === 'OFFICIAL').length

    return Response.json({
      notices,
      regions,
      housingTypes,
      /** 필터를 적용한 전체 건수. limit 으로 자르기 전 값이다 */
      matched: all.filter(byRegion).filter(byType).length,
      officialCount,
      sampleCount: notices.length - officialCount,
      // 실제 공고와 예시가 함께 있을 수 있다. 하나로 뭉뚱그리지 않는다.
      dataOrigin: officialCount > 0 ? ('MIXED' as const) : ('SYNTHETIC' as const),
    })
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : '공고를 불러오지 못했습니다.' },
      { status: 500 },
    )
  }
}
