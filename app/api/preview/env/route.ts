import { isGuardedDeploy } from '@/lib/runtime/deploy-guard'
import { fixtureActive } from '@/lib/runtime/preview-fixture'

export const dynamic = 'force-dynamic'

/** 이 배포가 어떤 설정으로 떠 있는지 — 이름별 '있음/없음'만. 값은 내보내지 않는다 */
const NAMES = [
  'SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'NEXT_PUBLIC_KAKAO_MAP_JS_KEY',
  'KAKAO_REST_API_KEY',
  'DATA_GO_KR_API_KEY',
  'PUBLIC_DATA_API_KEY',
  'MYHOME_API_KEY',
  'HUG_API_KEY',
  'HUG_SEOUL_API_KEY',
  'SBIZ_API_KEY',
  'ODSAY_API_KEY',
  'RESEND_API_KEY',
  'TELEGRAM_BOT_TOKEN',
  'KAKAO_ACCESS_TOKEN',
  'CRON_SECRET',
  'ADMIN_PASSCODE',
  'ALLOW_PREVIEW_WRITES',
]

/** 운영 배포에서는 없는 길(404)이다 */
export async function GET() {
  if (!isGuardedDeploy()) return new Response('Not Found', { status: 404 })
  const present: Record<string, boolean> = {}
  for (const n of NAMES) present[n] = (process.env[n] ?? '').trim() !== ''
  return Response.json({
    vercelEnv: process.env.VERCEL_ENV ?? null,
    commit: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    branch: process.env.VERCEL_GIT_COMMIT_REF ?? null,
    guarded: true,
    fixture: await fixtureActive(),
    present,
  })
}
