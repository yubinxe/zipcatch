import { NextRequest } from 'next/server'
import { monthCond, odcloudAll } from '@/lib/adapters/odcloud'

/** 지역별 신청·당첨자 통계 — 조건에 맞는 마지막 쪽까지 */
export async function GET(req: NextRequest) {
  const month = req.nextUrl.searchParams.get('month') ?? ''
  const [applicants, winners] = await Promise.all([
    odcloudAll('ApplyhomeStatSvc/v1/getAPTReqstAreaStat', monthCond(month)),
    odcloudAll('ApplyhomeStatSvc/v1/getAPTPrzwnerAreaStat', monthCond(month)),
  ])
  return Response.json({ applicants: applicants.data, winners: winners.data })
}
