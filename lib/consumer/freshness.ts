import { getSupabase } from '@/lib/db/supabase'
import { fixtureActive } from '@/lib/runtime/preview-fixture'
import { ingestStatusOf, judgeFreshness, STALE_AFTER_HOURS, type IngestMeta } from './data-mode'

/**
 * 공고 목록의 실제 수집 시각 — 읽기만 한다(쓰기·수집 재개 없음).
 *
 *  - lastIngestedAt: routine_runs 에서 'ingest-notices'·'sync-notices' 실행 가운데 한 출처라도 받아 저장한 마지막 실행의 종료 시각
 *  - latestRowAt:    opportunities.updated_at 의 최댓값(예시 제외). 좌표·보강 쓰기도 이 값을 올리므로 참고값
 *  - requestedAt:    이 응답을 만든 서버 시각
 *
 * 원문 게시 시각은 저장하지 않으므로 null 로 둔다. 어느 하나라도 읽지 못하면 그 칸은 null — 판정이 '미확인'으로 물러선다.
 * 서버 인스턴스 안에서 60초 동안 재사용한다(지도 응답에 질의 두 개를 매번 얹지 않게).
 */
let memo: { at: number; v: Pick<IngestMeta, 'lastIngestedAt' | 'latestRowAt' | 'ingest'> & { lastRunOkAt: string | null } } | null = null

interface RunRow {
  status: string
  started_at: string
  finished_at: string | null
  summary: string | null
  detail: { sources?: { source?: string; label?: string; ok?: boolean; fetched?: number; inserted?: number; updated?: number }[]; partial?: boolean; inserted?: number } | null
}

async function read() {
  const sb = getSupabase()
  if (!sb) return { lastRunOkAt: null, latestRowAt: null, ingest: undefined }
  const [runs, rows] = await Promise.all([
    sb
      .from('routine_runs')
      .select('status, started_at, finished_at, summary, detail')
      .in('routine_key', ['ingest-notices', 'sync-notices'])
      .order('started_at', { ascending: false })
      .limit(20),
    sb.from('opportunities').select('updated_at').eq('is_demo', false).order('updated_at', { ascending: false }).limit(1),
  ])
  const ok = runs.error
    ? null
    : ((runs.data ?? []) as RunRow[]).find(
        r =>
          r.status === 'SUCCESS' &&
          r.finished_at &&
          (r.detail?.sources ?? []).some(s => s.ok && ((s.fetched ?? 0) > 0 || (s.inserted ?? 0) > 0 || (s.updated ?? 0) > 0)),
      )
  const latest = rows.error ? null : ((rows.data?.[0] as { updated_at?: string } | undefined)?.updated_at ?? null)
  return { lastRunOkAt: ok?.finished_at ?? null, latestRowAt: latest, ingest: runs.error ? undefined : ingestStatusOf((runs.data ?? []) as RunRow[]) }
}

export async function ingestMeta(now = new Date()): Promise<IngestMeta> {
  const requestedAt = now.toISOString()
  const base = { requestedAt, sourcePublishedAt: null, staleAfterHours: STALE_AFTER_HOURS } as const
  if (await fixtureActive()) return { ...base, state: 'FIXTURE', basis: 'FIXTURE', lastIngestedAt: null, latestRowAt: null }
  let v = memo && now.getTime() - memo.at < 60_000 ? memo.v : null
  if (!v) {
    try {
      const r = await read()
      v = { ...r, lastIngestedAt: r.lastRunOkAt }
      memo = { at: now.getTime(), v }
    } catch {
      v = { lastRunOkAt: null, latestRowAt: null, lastIngestedAt: null, ingest: undefined }
    }
  }
  const j = judgeFreshness({ now, lastRunOkAt: v.lastRunOkAt, latestRowAt: v.latestRowAt })
  return { ...base, ...j, latestRowAt: v.latestRowAt, ...(v.ingest ? { ingest: v.ingest } : {}) }
}
