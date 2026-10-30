import { NextRequest } from 'next/server'
import { isGuardedDeploy } from '@/lib/runtime/deploy-guard'
import { FIXTURE_COOKIE } from '@/lib/runtime/preview-fixture'

export const dynamic = 'force-dynamic'

/**
 * 미리보기 검증용 가상 공고 켜기·끄기. 운영 배포에서는 없는 길(404)이다.
 *   /api/preview/fixture?on=1&next=/map
 */
export async function GET(req: NextRequest) {
  if (!isGuardedDeploy()) return new Response('Not Found', { status: 404 })
  const on = req.nextUrl.searchParams.get('on') === '1'
  const next = req.nextUrl.searchParams.get('next') ?? '/'
  const to = next.startsWith('/') && !next.startsWith('//') ? next : '/'
  const res = new Response(null, { status: 303, headers: { Location: to } })
  res.headers.append(
    'Set-Cookie',
    on
      ? `${FIXTURE_COOKIE}=1; Path=/; Max-Age=86400; SameSite=Lax; Secure`
      : `${FIXTURE_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax; Secure`,
  )
  return res
}
