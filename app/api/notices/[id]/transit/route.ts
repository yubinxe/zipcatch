import { findOfficialProperty } from '@/lib/consumer/official'
import { evaluateNoticeTransitAccess } from '@/lib/services/transit-access'

export const dynamic = 'force-dynamic'

/**
 * 공고별 역세권 입지 접근성 조회 (읽기 전용).
 *
 * 공식 역 데이터가 적재되고 `NEXT_PUBLIC_FEATURE_TRANSIT_ACCESS=1` 이 켜진 경우에만
 * `PARCEL_CONFIRMED` / `ADDRESS_GEOCODED` 공고에 한해 역 접근성을 반환한다.
 * 가격 보정 경험칙 계수는 이 응답에 포함하지 않는다.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const property = await findOfficialProperty(id)
    if (!property) {
      return Response.json({ error: '공고를 찾을 수 없습니다.' }, { status: 404 })
    }
    const result = await evaluateNoticeTransitAccess(property)
    return Response.json(result)
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : '역세권 입지 정보를 불러오지 못했습니다.' },
      { status: 500 },
    )
  }
}
