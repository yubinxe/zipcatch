import { isAdminRequest } from '@/lib/admin/auth'
import { fetchApplyhome, isApplyhomeConfigured } from '@/lib/adapters/applyhome'
import { fetchLh, isLhConfigured } from '@/lib/adapters/lh'
import * as repo from '@/lib/db/repo'
import { fillCoordinates } from '@/lib/services/geocode-fill'

export const dynamic = 'force-dynamic'
/**
 * 수집한 김에 좌표까지 채우므로 기본 제한으로는 모자란다.
 * 지도 쪽에서 걷어낸 기다림이 여기로 옮겨 온 것이고, 그게 맞는 자리다 —
 * 운영자가 한 번 누르는 일이지 사용자가 화면을 여는 일이 아니다.
 */
export const maxDuration = 120

interface SourceReport {
  source: 'APPLYHOME' | 'LH'
  label: string
  ok: boolean
  reason: string | null
  fetched: number
  inserted: number
  updated: number
  failed: number
  errors: string[]
}

/**
 * 공공 API 에서 모집공고를 받아 Opportunity 로 정규화·저장한다.
 *
 *  - 청약홈(ApplyHome) — 분양 모집공고
 *  - LH 청약플러스      — 임대 모집공고
 *
 * 한쪽이 실패해도 다른 쪽은 저장한다. 실패는 그대로 보고하며 예시 데이터로 덮지 않는다.
 */
export async function POST() {
  if (!(await isAdminRequest())) {
    return Response.json({ error: '운영자 인증이 필요합니다.' }, { status: 401 })
  }

  const empty = { inserted: 0, updated: 0, failed: 0, errors: [] as string[] }

  const [applyhome, lh] = await Promise.all([
    fetchApplyhome({ perPage: 100, monthsBack: 2 }),
    fetchLh({ perPage: 200 }),
  ])

  const sources: SourceReport[] = []

  for (const [source, label, result] of [
    ['APPLYHOME', '청약홈 분양공고', applyhome],
    ['LH', 'LH 임대공고', lh],
  ] as const) {
    if (!result.ok) {
      sources.push({ source, label, ok: false, reason: result.reason, fetched: 0, ...empty })
      continue
    }
    const upsert = result.rows.length
      ? await repo.upsertOpportunities(result.rows)
      : { ...empty }
    sources.push({
      source,
      label,
      ok: true,
      reason: null,
      fetched: result.rows.length,
      inserted: upsert.inserted,
      updated: upsert.updated,
      failed: upsert.failed,
      errors: upsert.errors,
    })
  }

  /*
   * 새로 들어온 공고의 좌표를 여기서 찾아 둔다.
   *
   * 지도를 열 때 찾으면 공고 예순 건에 백스무 번을 물어야 해서 첫 화면이
   * 20초 넘게 빈다. 좌표는 공고가 뜬 뒤 바뀌지 않으니 수집한 김에 채운다.
   * 실패해도 수집 결과를 되돌리지 않는다 — 좌표는 곁들이는 값이다.
   */
  const geo = await fillCoordinates({ limit: 120 }).catch(err => ({
    ok: false as const,
    reason: err instanceof Error ? err.message : String(err),
    tried: 0,
    byAddress: 0,
    byName: 0,
    missed: 0,
    skipped: 0,
  }))

  const sum = (pick: (s: SourceReport) => number) => sources.reduce((n, s) => n + pick(s), 0)

  return Response.json({
    // 한 곳이라도 성공하면 ok. 실패한 출처는 sources 에서 그대로 보인다.
    ok: sources.some(s => s.ok),
    configured: isApplyhomeConfigured() || isLhConfigured(),
    fetchedAt: applyhome.fetchedAt,
    sources,
    fetched: sum(s => s.fetched),
    inserted: sum(s => s.inserted),
    updated: sum(s => s.updated),
    failed: sum(s => s.failed),
    errors: sources.flatMap(s => s.errors),
    /** 지도 좌표를 몇 건 채웠는지. 실패해도 수집 자체는 성공으로 둔다 */
    geo,
    storage: repo.storageMode(),
  })
}

export async function GET() {
  if (!(await isAdminRequest())) {
    return Response.json({ error: '운영자 인증이 필요합니다.' }, { status: 401 })
  }
  const [applyhome, lh] = await Promise.all([
    fetchApplyhome({ perPage: 1, monthsBack: 1 }),
    fetchLh({ perPage: 1 }),
  ])
  return Response.json({
    configured: isApplyhomeConfigured() || isLhConfigured(),
    ok: applyhome.ok || lh.ok,
    sources: [
      { source: 'APPLYHOME', ok: applyhome.ok, reason: applyhome.reason, sample: applyhome.rows.length },
      { source: 'LH', ok: lh.ok, reason: lh.reason, sample: lh.rows.length },
    ],
  })
}
