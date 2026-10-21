import { NextRequest } from 'next/server'
import { listOfficialProperties } from '@/lib/consumer/official'
import { isRental, provinceOf } from '@/lib/consumer/classify'
import { checkUrgency } from '@/lib/crm/services/scoring'
import type { Property } from '@/lib/crm/types'

export const dynamic = 'force-dynamic'

/**
 * 마감 달력 — 앞으로 몇 주 동안 어느 날에 접수가 몰리는지.
 *
 * 목록은 "무엇이 있는지"를 답하고, 이 달력은 "언제 움직여야 하는지"를 답한다.
 * 마감이 한 날에 스물세 건씩 몰리는 것은 목록을 아무리 내려도 보이지 않는다.
 *
 * 날짜를 만들어내지 않는다. 마감일이 공고에 없으면 달력에 올리지 않고
 * 그 수를 따로 세어 넘긴다 — 빈 날처럼 보이면 그날 마감이 없는 줄로 읽힌다.
 */

export interface CalendarDay {
  /** YYYY-MM-DD */
  date: string
  sale: number
  rent: number
  total: number
}

export interface CalendarNotice {
  id: string
  name: string
  region: string
  housingType: string
  date: string
  kind: 'SALE' | 'RENT'
  daysLeft: number | null
}

/** 로컬(한국) 기준 날짜 문자열. UTC 로 자르면 밤 아홉 시 이후가 다음 날이 된다 */
function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`
}

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams
    const weeks = Math.min(8, Math.max(1, Number(sp.get('weeks') ?? 4) || 4))
    const region = sp.get('region') ?? ''
    const days = weeks * 7

    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const last = new Date(today)
    last.setDate(last.getDate() + days - 1)

    const startKey = ymd(today)
    const endKey = ymd(last)

    const all = await listOfficialProperties({ openOnly: true, limit: 400 })
    const inRegion = (p: Property) => !region || provinceOf(p) === region

    // 달력 칸을 먼저 전부 만든다. 공고가 없는 날도 자리를 지켜야
    // "그날은 비었다"가 보인다.
    const byDate = new Map<string, CalendarDay>()
    for (let i = 0; i < days; i++) {
      const d = new Date(today)
      d.setDate(d.getDate() + i)
      byDate.set(ymd(d), { date: ymd(d), sale: 0, rent: 0, total: 0 })
    }

    const notices: CalendarNotice[] = []
    let beyond = 0
    let undated = 0

    for (const p of all) {
      if (!inRegion(p)) continue
      const end = (p.applicationEnd ?? '').slice(0, 10)
      if (!end) {
        undated++
        continue
      }
      if (end < startKey) continue
      if (end > endKey) {
        beyond++
        continue
      }

      const slot = byDate.get(end)
      if (!slot) continue

      const rent = isRental(p.housingType)
      if (rent) slot.rent++
      else slot.sale++
      slot.total++

      notices.push({
        id: p.id,
        name: p.name,
        region: provinceOf(p),
        housingType: p.housingType,
        date: end,
        kind: rent ? 'RENT' : 'SALE',
        daysLeft: checkUrgency(p, now).daysLeft,
      })
    }

    const calendar = [...byDate.values()]
    const within = calendar.reduce((t, d) => t + d.total, 0)

    return Response.json({
      today: startKey,
      weeks,
      days: calendar,
      notices: notices.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name, 'ko')),
      /** 이 기간 안에 마감하는 수 */
      within,
      /** 기간 뒤에 마감하는 수 — 화면 구석에 함께 적어 전체를 가늠하게 한다 */
      beyond,
      /** 마감일이 공고에 없어 달력에 올리지 못한 수. 숨기면 빈 날로 읽힌다 */
      undated,
    })
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : '마감 일정을 불러오지 못했습니다.' },
      { status: 500 },
    )
  }
}
