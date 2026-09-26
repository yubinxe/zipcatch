import * as repo from '@/lib/db/repo'
import type { GeoSource, OpportunityRow } from '@/lib/db/types'
import { geocode, geocodeByName, isGeocodingConfigured } from '@/lib/consumer/geocode'
import { provinceOf } from '@/lib/consumer/classify'

/**
 * 공고의 좌표를 미리 찾아 저장해 둔다.
 *
 * ── 왜 미리 찾나 ──
 *
 * 지도는 요청이 올 때마다 주소·공고명을 카카오에 물어 좌표로 바꾸고 있었다.
 * 한 인스턴스가 사는 동안은 메모리에 남지만, 서버리스에서는 인스턴스가
 * 수시로 새로 뜬다. 그때마다 공고 예순 건에 백스무 번을 묻느라 첫 화면이
 * 스무 초 넘게 비어 있었다. 발표 도중에 그 한 번이 걸리면 지도가 없는 셈이다.
 *
 * 좌표는 공고가 뜬 뒤 바뀌지 않는다. 그러니 읽을 때 찾을 이유가 없다.
 * 수집할 때 한 번 찾아 저장하고, 지도는 읽기만 한다.
 *
 * ── 못 찾은 것도 기록한다 ──
 *
 * 못 찾았다고 비워 두면 다음 번에 또 묻는다. 주소가 아예 없거나 카카오가
 * 모르는 자리는 몇 번을 물어도 결과가 같다. 그래서 찾아본 시각(geo_at)을
 * 찍어 두고, 한동안은 다시 묻지 않는다.
 */

/** 이만큼 지나면 못 찾았던 것도 한 번 더 물어본다 */
const RETRY_AFTER_DAYS = 14

/** 한 번에 이 정도씩 묶어 보낸다. 카카오에 한꺼번에 쏟지 않으려고 끊는다 */
const BATCH = 12

export interface GeocodeFillResult {
  ok: boolean
  reason: string | null
  /** 좌표가 필요해서 물어본 건수 */
  tried: number
  /** 주소로 찾은 건수 */
  byAddress: number
  /** 공고명으로 찾은 건수 */
  byName: number
  /** 물어봤지만 못 찾은 건수 */
  missed: number
  /** 이미 좌표가 있어 건너뛴 건수 */
  skipped: number
}

const NONE: GeocodeFillResult = {
  ok: true,
  reason: null,
  tried: 0,
  byAddress: 0,
  byName: 0,
  missed: 0,
  skipped: 0,
}

/** 이 공고를 지금 물어봐야 하나 */
function needsGeo(row: OpportunityRow, now: Date): boolean {
  if (row.lat !== null && row.lng !== null) return false
  if (!row.geo_at) return true
  // 저번에 못 찾은 것. 너무 자주 되묻지 않는다
  const age = now.getTime() - new Date(row.geo_at).getTime()
  return age > RETRY_AFTER_DAYS * 24 * 60 * 60 * 1000
}

/**
 * 좌표가 없는 공고를 채운다.
 *
 * `limit` 은 한 번에 처리할 상한이다. 예약 실행은 작게 잡아 매일 조금씩
 * 채우고, 수집 직후에는 크게 잡아 그날 들어온 것을 바로 덮는다.
 */
export async function fillCoordinates(
  opts: { limit?: number } = {},
): Promise<GeocodeFillResult> {
  if (!isGeocodingConfigured()) {
    return { ...NONE, ok: false, reason: 'KAKAO_REST_API_KEY 가 설정되지 않았습니다.' }
  }

  const now = new Date()
  const limit = opts.limit ?? 60

  let rows: OpportunityRow[]
  try {
    rows = await repo.listOpportunities({ includeDemo: false, limit: 400 })
  } catch (err) {
    return {
      ...NONE,
      ok: false,
      reason: `저장소를 읽지 못했습니다: ${err instanceof Error ? err.message : String(err)}`,
    }
  }

  const todo = rows.filter(r => needsGeo(r, now)).slice(0, limit)
  const skipped = rows.length - todo.length

  let byAddress = 0
  let byName = 0
  let missed = 0

  for (let i = 0; i < todo.length; i += BATCH) {
    const slice = todo.slice(i, i + BATCH)
    await Promise.all(
      slice.map(async row => {
        const address = (row.address ?? '').trim()

        // 주소가 있으면 그것이 가장 정확하다.
        let hit = address ? await geocode(address).catch(() => null) : null
        let source: GeoSource = 'ADDRESS'

        /*
         * 주소가 없으면 공고명으로 찾는다.
         *
         * LH 공고에는 주소 칸이 아예 없고, 대신 이름에 자리가 적혀 있다 —
         * '평택고덕 A57-2블록'. 다만 이름으로 찾으면 엉뚱한 곳이 걸리기
         * 쉬워서, 광역이 맞는 것만 받는다(geocodeByName 이 확인한다).
         */
        if (!hit) {
          const province = provinceOf({ region: row.region, district: row.district ?? '' })
          hit = await geocodeByName(row.title, province).catch(() => null)
          source = 'NAME'
        }

        // 못 찾았어도 찾아본 시각은 남긴다. 안 남기면 매번 다시 묻게 된다.
        const patch = hit
          ? { lat: hit.lat, lng: hit.lng, geo_source: source, geo_at: now.toISOString() }
          : { geo_at: now.toISOString() }

        try {
          await repo.updateOpportunity(row.id, patch)
        } catch {
          // 한 건 저장에 실패해도 나머지는 계속 채운다
          return
        }
        if (hit) {
          if (source === 'ADDRESS') byAddress++
          else byName++
        } else {
          missed++
        }
      }),
    )
  }

  return {
    ok: true,
    reason: null,
    tried: todo.length,
    byAddress,
    byName,
    missed,
    skipped,
  }
}
