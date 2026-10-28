import { NextRequest } from 'next/server'
import { odcloudAll } from '@/lib/adapters/odcloud'

/** 연령대별 신청·당첨 통계 — 기간이 길어져도 앞머리만 읽지 않게 끝까지 받는다 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const cond: Record<string, string> = {}
  const from = sp.get('monthFrom') ?? ''
  const to = sp.get('monthTo') ?? ''
  if (from) cond['cond[STAT_DE::GTE]'] = from
  if (to) cond['cond[STAT_DE::LTE]'] = to

  const [applicants, winners] = await Promise.all([
    odcloudAll('ApplyhomeStatSvc/v1/getAPTReqstAgeStat', cond),
    odcloudAll('ApplyhomeStatSvc/v1/getAPTPrzwnerAgeStat', cond),
  ])
  return Response.json({ applicants: applicants.data, winners: winners.data })
}
