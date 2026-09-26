import * as repo from '@/lib/db/repo'
import { fetchApplyhome } from '@/lib/adapters/applyhome'
import { fetchLh } from '@/lib/adapters/lh'
import { runMatchingForEvent } from '@/lib/services/pipeline'
import { daysUntil } from '@/lib/services/matching'
import { STAGE_LABEL } from '@/lib/services/lead-scoring'
import { fillCoordinates } from '@/lib/services/geocode-fill'

/**
 * 루틴 — 사람이 매일 손으로 하던 확인을 고정된 시각에 대신 돌린다.
 *
 * 원칙 세 가지.
 *  1) 루틴은 **판단을 대신하지 않는다.** 확인해야 할 건을 골라 올려줄 뿐이고,
 *     자격 판정·당첨 예측은 여기서도 하지 않는다.
 *  2) **성공만 남기지 않는다.** 실패와 사유를 같은 자리에 적는다.
 *     실패가 안 보이는 자동화는 안 도는 자동화보다 위험하다.
 *  3) **0건도 결과다.** 건드릴 게 없었다는 사실이 기록돼야 어제와 비교할 수 있다.
 */

export interface RoutineResult {
  summary: string
  detail: Record<string, unknown>
  /** 사람이 볼 필요가 있는 건이 나왔는지 */
  actionable: boolean
}

export interface RoutineDef {
  key: string
  name: string
  purpose: string
  instruction: string
  scheduleCron: string
  scheduleLabel: string
  run: () => Promise<RoutineResult>
}

// ── 1. 공고 동기화 ───────────────────────────────────────────
const syncNotices: RoutineDef = {
  key: 'sync-notices',
  name: '공고 동기화 · 신규 매칭',
  purpose:
    '매일 아침 청약홈과 LH 청약플러스를 열어 새 공고를 확인하고, 담당 고객 조건과 대조하던 일.',
  instruction: `1. 청약홈 분양공고와 LH 임대공고를 가져온다.
2. (출처, 공고번호) 기준으로 upsert 한다 — 같은 공고를 두 번 쌓지 않는다.
3. 이번에 **새로 들어온** 공고만 NEW_ANNOUNCEMENT 이벤트로 올린다.
   이미 있던 공고를 다시 알리지 않는다.
4. 각 신규 공고에 대해 알림 수신에 동의한 고객의 조건과 대조하고,
   임계치를 넘은 건만 알림 초안을 만든다.
5. 한 출처가 실패해도 다른 출처는 저장하고, 실패 사유를 결과에 남긴다.
   실패를 예시 데이터로 덮지 않는다.`,
  scheduleCron: '0 0 * * *',
  scheduleLabel: '매일 오전 9:00 (GMT+9)',

  async run() {
    const [applyhome, lh] = await Promise.all([
      fetchApplyhome({ perPage: 100, monthsBack: 2 }),
      fetchLh({ perPage: 200 }),
    ])

    const sources: Record<string, unknown>[] = []
    const failures: string[] = []
    let inserted = 0
    const newKeys: { source: string; externalId: string }[] = []

    for (const [source, label, res] of [
      ['APPLYHOME', '청약홈', applyhome],
      ['LH', 'LH', lh],
    ] as const) {
      if (!res.ok) {
        sources.push({ source, label, ok: false, reason: res.reason })
        failures.push(`${label}: ${res.reason}`)
        continue
      }
      const before = new Set(
        (await repo.listOpportunities({ includeDemo: false, limit: 1000 })).map(
          o => `${o.source}|${o.external_id}`,
        ),
      )
      const up = await repo.upsertOpportunities(res.rows)
      inserted += up.inserted
      for (const r of res.rows) {
        const k = `${r.source}|${r.external_id}`
        if (!before.has(k) && r.external_id) newKeys.push({ source: r.source!, externalId: r.external_id })
      }
      sources.push({ source, label, ok: true, fetched: res.rows.length, inserted: up.inserted, updated: up.updated })
    }

    // 신규 공고만 이벤트로 올린다. 매칭·알림 폭주를 막기 위해 상한을 둔다.
    const all = await repo.listOpportunities({ includeDemo: false, limit: 1000 })
    const byKey = new Map(all.map(o => [`${o.source}|${o.external_id}`, o]))
    const fresh = newKeys
      .map(k => byKey.get(`${k.source}|${k.externalId}`))
      .filter((o): o is NonNullable<typeof o> => Boolean(o))
      .slice(0, 20)

    let matched = 0
    let notified = 0
    for (const opp of fresh) {
      const out = await runMatchingForEvent(opp, 'NEW_ANNOUNCEMENT', { isDemo: false })
      matched += out.matches.length
      notified += out.notified.length
    }

    const summary = failures.length
      ? `신규 ${inserted}건 · 알림 ${notified}건 — ${failures.join(' / ')}`
      : `신규 ${inserted}건 · 매칭 ${matched}건 · 알림 ${notified}건`

    return {
      summary,
      detail: { sources, newAnnouncements: fresh.length, matched, notified, failures },
      actionable: notified > 0 || failures.length > 0,
    }
  },
}

// ── 2. 마감 임박 점검 ────────────────────────────────────────
const deadlineWatch: RoutineDef = {
  key: 'deadline-watch',
  name: '마감 임박 점검',
  purpose:
    '접수 마감이 3일 안으로 들어온 공고를 추려, 관심 고객에게 놓치지 않게 알리던 일.',
  instruction: `1. 접수 중인 공고 가운데 마감이 **3일 이내**인 건을 고른다.
2. 마감일이 공고에 없는 건은 대상에서 제외한다 — 날짜를 만들어 알리지 않는다.
3. 같은 공고로 이미 알림을 보낸 고객에게 다시 보내지 않는다.
4. 대상이 없으면 "대상 없음"으로 실행 결과를 남긴다. 0건도 결과다.`,
  scheduleCron: '0 23 * * *',
  scheduleLabel: '매일 오전 8:00 (GMT+9)',

  async run() {
    const now = new Date()
    const opportunities = await repo.listOpportunities({ onlyOpen: true, limit: 500 })

    const closing = opportunities.filter(o => {
      if (!o.application_end) return false // 날짜가 없으면 만들지 않는다
      const d = daysUntil(o.application_end, now)
      return d !== null && d >= 0 && d <= 3
    })

    if (closing.length === 0) {
      return {
        summary: '마감 3일 이내 공고 없음',
        detail: { checked: opportunities.length, closing: 0 },
        actionable: false,
      }
    }

    // 이미 알린 (고객, 공고) 조합은 건너뛴다
    const sent = new Set(
      (await repo.listNotifications(500)).map(n => `${n.customer_id}|${n.opportunity_id}`),
    )

    let notified = 0
    const touched: string[] = []
    for (const opp of closing.slice(0, 10)) {
      const out = await runMatchingForEvent(opp, 'DEADLINE_APPROACHING', { isDemo: opp.is_demo })
      const fresh = out.notified.filter(n => !sent.has(`${n.customer_id}|${n.opportunity_id}`))
      notified += fresh.length
      if (fresh.length) touched.push(opp.title)
    }

    return {
      summary: `마감 임박 ${closing.length}건 · 알림 ${notified}건`,
      detail: { closing: closing.length, notified, titles: touched.slice(0, 5) },
      actionable: notified > 0,
    }
  },
}

// ── 3. 오늘의 응대 대상 ──────────────────────────────────────
const leadDigest: RoutineDef = {
  key: 'lead-digest',
  name: '오늘 연락할 고객',
  purpose:
    '어제 반응이 있었던 고객을 훑어 오늘 누구에게 먼저 연락할지 정하던 일. 담당자가 감으로 하던 판단.',
  instruction: `1. 최근 24시간의 행동 기록을 읽는다 (알림 클릭·상세 조회·관심 등록·문의).
2. 고객별로 묶어 Lead Score 순으로 세운다.
3. 상위 10명과 **무엇을 보고 움직였는지**를 함께 적는다.
   점수만 주면 왜 연락해야 하는지 알 수 없다.
4. 이름·연락처는 결과에 넣지 않는다. 화면에서 고객 카드로 들어가 확인한다.`,
  scheduleCron: '30 0 * * 1-5',
  scheduleLabel: '평일 오전 9:30 (GMT+9)',

  async run() {
    const since = Date.now() - 24 * 60 * 60 * 1000
    const behaviors = (await repo.listBehaviors({ limit: 400 })).filter(
      b => new Date(b.created_at).getTime() >= since,
    )

    const perCustomer = new Map<string, { events: string[] }>()
    for (const b of behaviors) {
      if (!b.customer_id) continue
      const cur = perCustomer.get(b.customer_id) ?? { events: [] as string[] }
      cur.events.push(b.event_type)
      perCustomer.set(b.customer_id, cur)
    }

    if (perCustomer.size === 0) {
      return {
        summary: '지난 24시간 반응 없음',
        detail: { window: '24h', customers: 0 },
        actionable: false,
      }
    }

    const customers = await repo.listCustomers(300)
    const byId = new Map(customers.map(c => [c.id, c]))

    const ranked = [...perCustomer.entries()]
      .map(([id, v]) => ({
        id,
        score: byId.get(id)?.lead_score ?? 0,
        stage: byId.get(id)?.lifecycle_stage ?? 'COLD',
        // 개인정보는 넣지 않는다. 무엇을 했는지만 남긴다.
        signals: [...new Set(v.events)],
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)

    const hot = ranked.filter(r => r.stage !== 'COLD').length

    return {
      summary: `반응 ${perCustomer.size}명 · 우선 응대 ${hot}명`,
      detail: {
        window: '24h',
        customers: perCustomer.size,
        top: ranked.map(r => ({
          customerId: r.id,
          score: r.score,
          stage: STAGE_LABEL[r.stage as keyof typeof STAGE_LABEL] ?? r.stage,
          signals: r.signals,
        })),
      },
      actionable: hot > 0,
    }
  },
}

// ── 4. 지도 좌표 채우기 ──────────────────────────────────────
const fillGeo: RoutineDef = {
  key: 'fill-geo',
  name: '지도 좌표 채우기',
  purpose:
    '지도를 열 때마다 공고 주소를 카카오에 물어 좌표로 바꾸던 일. 공고 예순 건이면 백스무 번을 묻느라 첫 화면이 20초 넘게 비었다.',
  instruction: `1. 좌표가 아직 없는 공고만 고른다. 이미 있는 건은 건드리지 않는다.
2. 주소가 있으면 주소로, 없으면 공고명으로 찾는다 — LH 공고에는 주소 칸이
   아예 없고 이름에 자리가 적혀 있다('평택고덕 A57-2블록').
3. 못 찾았어도 **찾아본 시각을 남긴다.** 안 남기면 다음 번에 또 묻게 되고,
   카카오가 모르는 자리는 몇 번을 물어도 결과가 같다. 2주 뒤에 한 번 더 본다.
4. 한 건 저장에 실패해도 나머지는 계속 채운다.

좌표는 공고가 뜬 뒤 바뀌지 않는다. 그래서 읽을 때가 아니라 여기서 찾는다.`,
  // 공고 동기화가 끝난 뒤에 돌아야 그날 들어온 것까지 덮는다
  scheduleCron: '20 0 * * *',
  scheduleLabel: '매일 오전 9:20 (GMT+9)',

  async run() {
    const r = await fillCoordinates({ limit: 80 })

    if (!r.ok) {
      return {
        summary: `좌표를 채우지 못했습니다 — ${r.reason}`,
        detail: { ok: false, reason: r.reason },
        actionable: true,
      }
    }

    const found = r.byAddress + r.byName
    return {
      // 0건도 결과다. 채울 게 없었다는 것도 적는다.
      summary:
        r.tried === 0
          ? `좌표가 빠진 공고가 없습니다 (보유 ${r.skipped}건)`
          : `${r.tried}건을 찾아 ${found}건 채웠습니다 (주소 ${r.byAddress} · 공고명 ${r.byName} · 못 찾음 ${r.missed})`,
      detail: {
        tried: r.tried,
        byAddress: r.byAddress,
        byName: r.byName,
        missed: r.missed,
        alreadyHad: r.skipped,
      },
      // 못 찾은 건이 절반을 넘으면 사람이 볼 일이다 — 키가 막혔을 수 있다
      actionable: r.tried > 0 && r.missed > found,
    }
  },
}

export const ROUTINES: RoutineDef[] = [syncNotices, deadlineWatch, leadDigest, fillGeo]

export function findRoutine(key: string): RoutineDef | undefined {
  return ROUTINES.find(r => r.key === key)
}
