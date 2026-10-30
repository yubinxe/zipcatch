import { resolveSession } from '@/lib/consumer/session'
import { getUser, listAlerts, listSaved } from '@/lib/consumer/store'
import { fixtureActive, fixtureProfile } from '@/lib/runtime/preview-fixture'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const session = await resolveSession()
    return Response.json({
      user: getUser(session.userId),
      // 미리보기 픽스처에서 조건을 아직 안 넣었으면 가상 조건으로 결과 화면을 열 수 있게 한다
      profile: session.profile ?? ((await fixtureActive()) ? fixtureProfile() : null),
      savedIds: listSaved(session).map(r => r.propertyId),
      alerts: listAlerts(session),
      pendingIntent: session.pendingIntent,
    })
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : '세션을 불러오지 못했습니다.' },
      { status: 500 },
    )
  }
}
