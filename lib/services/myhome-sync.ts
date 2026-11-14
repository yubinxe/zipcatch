import { fetchMyhomeNotices, lhPatches, normalizeMyhome } from '@/lib/adapters/myhome'
import * as repo from '@/lib/db/repo'

/**
 * 마이홈 동기화 — LH 수집 뒤에 돈다.
 *
 *  1. LH 공고 보강: panId 로 짝지은 LH 행의 **빈 칸만** 채운다(updateOpportunity, 한 행씩).
 *     일괄 upsert 는 행마다 칸이 다르면 빠진 칸을 빈 값으로 덮을 수 있어 쓰지 않는다.
 *  2. LH 밖 공급기관 공고: 출처 MYHOME 으로 upsert 한다(칸이 모두 같은 모양).
 * 마이홈이 실패해도 기존 자료는 지우지 않는다.
 */
export async function syncMyhome(): Promise<{
  ok: boolean
  reason?: string | null
  fetched: number
  enriched: number
  inserted: number
  updated: number
  enrichFailed?: number
  failed?: number
  newKeys: { source: string; externalId: string }[]
}> {
  const res = await fetchMyhomeNotices({ pages: 5, rows: 100 })
  if (!res.ok) return { ok: false, reason: res.reason, fetched: 0, enriched: 0, inserted: 0, updated: 0, newKeys: [] }

  const fetchedAt = new Date().toISOString()
  const existing = await repo.listOpportunities({ includeDemo: false, limit: 2000 })

  // 1. LH 보강 — 빈 칸만
  const patches = lhPatches(res.items)
  let enriched = 0
  let enrichFailed = 0
  let firstError: string | null = null
  for (const o of existing) {
    if (o.source !== 'LH' || !o.external_id) continue
    const p = patches.get(o.external_id)
    if (!p) continue
    const only: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(p)) {
      const cur = (o as unknown as Record<string, unknown>)[k]
      // LH 가 준 값은 덮지 않는다. 지역은 광역만 있을 때(시·군·구가 비었을 때)만 바꾼다
      if (k === 'region' || k === 'district') {
        if (!o.district && p.region && p.district) only[k] = v
        continue
      }
      if (cur === null || cur === undefined || cur === '') only[k] = v
    }
    if (Object.keys(only).length) {
      // 한 행이 실패해도 나머지는 계속 — 실패는 세어 남긴다
      try {
        await repo.updateOpportunity(o.id, only)
        enriched++
      } catch (err) {
        enrichFailed++
        if (!firstError) firstError = err instanceof Error ? err.message : String(err)
      }
    }
  }

  // 2. LH 밖 공급기관
  const rows = normalizeMyhome(res.items, fetchedAt)
  const before = new Set(existing.map(o => `${o.source}|${o.external_id}`))
  const up = rows.length ? await repo.upsertOpportunities(rows) : { inserted: 0, updated: 0, failed: 0, errors: [] as string[] }
  const newKeys = rows
    .filter(r => r.external_id && !before.has(`${r.source}|${r.external_id}`))
    .map(r => ({ source: r.source!, externalId: r.external_id! }))

  // 저장 실패를 성공으로 적지 않는다 — 보강·적재 어느 쪽이든 실패가 있으면 이 출처는 실패(나머지 출처는 그대로)
  const failed = (up.failed ?? 0) + enrichFailed
  const reason = failed ? `저장 실패 ${failed}건 — ${up.errors?.[0] ?? firstError ?? ''}`.slice(0, 200) : null
  return { ok: failed === 0, reason, fetched: res.items.length, enriched, enrichFailed, inserted: up.inserted, updated: up.updated, failed, newKeys }
}
