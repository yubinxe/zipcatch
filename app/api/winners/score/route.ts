import { NextRequest } from 'next/server'
import { monthCond, odcloudAll } from '@/lib/adapters/odcloud'

/** 지역별 당첨 가점 통계 — 한 쪽 50건만 받던 것을 조건에 맞는 마지막 쪽까지 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const month = sp.get('month') ?? ''
  const region = sp.get('region') ?? ''
  const cond = monthCond(month)
  if (region) cond['cond[SUBSCRPT_AREA_CODE::EQ]'] = region
  const data = await odcloudAll('ApplyhomeStatSvc/v1/getAPTApsPrzwnerStat', cond)
  return Response.json(data)
}
