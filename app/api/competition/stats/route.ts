import { NextRequest } from 'next/server'
import { monthCond, odcloudAll } from '@/lib/adapters/odcloud'

/** 지역별 청약 경쟁률 통계 — 조건에 맞는 건을 마지막 쪽까지 받는다(lib/adapters/odcloud) */
export async function GET(req: NextRequest) {
  const month = req.nextUrl.searchParams.get('month') ?? ''
  const data = await odcloudAll('ApplyhomeStatSvc/v1/getAPTCmpetrtAreaStat', monthCond(month))
  return Response.json(data)
}
