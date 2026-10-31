import { listOfficialProperties } from '@/lib/consumer/official'
import { isRental, mapProvince, provinceOf } from '@/lib/consumer/classify'
import { dayKey, timelineRange, type TimelineNotice } from '@/lib/consumer/timeline-core'

export const dynamic = 'force-dynamic'

/**
 * 타임머신에 올릴 공고 일정.
 *
 * 지도·달력 길은 '지금 넣을 수 있는 것'만 읽는다(openOnly). 되감기는 이미 끝난
 * 공고도 있어야 하므로 따로 읽는다. 새로 수집하지 않는다 — 저장된 공식 공고를
 * 그대로 읽어 날짜와 광역만 넘긴다.
 */
export async function GET() {
  try {
    const all = await listOfficialProperties({ limit: 1000 })

    const notices: TimelineNotice[] = []
    let undated = 0
    let latest: string | null = null
    for (const p of all) {
      const end = dayKey(p.applicationEnd)
      if (!end) {
        undated++
        continue
      }
      notices.push({
        id: p.id,
        name: p.name,
        province: mapProvince(provinceOf(p), p.region),
        kind: isRental(p.housingType) ? 'RENT' : 'SALE',
        start: dayKey(p.applicationStart),
        end,
        seen: dayKey(p.applicationStart) ? null : dayKey(p.firstSeenAt),
      })
      if (p.collectedAt && (!latest || p.collectedAt > latest)) latest = p.collectedAt
    }

    // 한국 날짜. 서버는 UTC 로 돈다
    const today = new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10)
    const range = timelineRange(notices, today)

    return Response.json({
      today,
      ...range,
      notices,
      /** 마감일이 원문에 없어 어느 날에도 세지 않은 건 */
      undated,
      /** 마지막으로 저장소에 반영된 시각 — 이후 바뀐 일정은 모른다 */
      collectedAt: latest,
    })
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : '일정을 불러오지 못했습니다.' },
      { status: 500 },
    )
  }
}
