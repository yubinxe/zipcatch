import { randomUUID } from 'crypto'
import { getSupabase, isSupabaseConfigured } from './supabase'
import type {
  ApplicationRow,
  ApplicationTaskRow,
  BehaviorEventRow,
  CustomerRow,
  InquiryRow,
  MatchRow,
  NotificationRow,
  OpportunityEventRow,
  OpportunityRow,
  PreferenceRow,
} from './types'

/**
 * 저장소.
 *
 * Supabase 자격증명이 있으면 Supabase 를, 없으면 프로세스 메모리를 쓴다.
 * 어느 쪽이든 호출부는 같은 인터페이스를 본다.
 *
 * 메모리 모드는 시연용이며 서버가 재시작하면 사라진다.
 * 화면에서 "영구 저장된다"고 표시하지 않는다.
 */

interface MemoryState {
  customers: CustomerRow[]
  preferences: PreferenceRow[]
  opportunities: OpportunityRow[]
  events: OpportunityEventRow[]
  matches: MatchRow[]
  notifications: NotificationRow[]
  behaviors: BehaviorEventRow[]
  applications: ApplicationRow[]
  tasks: ApplicationTaskRow[]
  inquiries: InquiryRow[]
  seeded: boolean
}

const g = globalThis as unknown as { __jipcatchMem?: MemoryState }

function mem(): MemoryState {
  if (!g.__jipcatchMem) {
    g.__jipcatchMem = {
      customers: [],
      preferences: [],
      opportunities: [],
      events: [],
      matches: [],
      notifications: [],
      behaviors: [],
      applications: [],
      tasks: [],
      inquiries: [],
      seeded: false,
    }
  }
  return g.__jipcatchMem
}

export function memoryState() {
  return mem()
}

export function storageMode(): 'supabase' | 'memory' {
  return isSupabaseConfigured() ? 'supabase' : 'memory'
}

const now = () => new Date().toISOString()

/** Supabase 호출 실패 시 메모리로 조용히 폴백하지 않는다 — 에러를 드러낸다 */
function must<T>(res: { data: T | null; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`)
  return res.data as T
}

// ── 고객 ────────────────────────────────────────────────────

export async function findCustomerBySession(sessionId: string): Promise<CustomerRow | null> {
  const sb = getSupabase()
  if (!sb) return mem().customers.find(c => c.session_id === sessionId) ?? null

  const { data, error } = await sb.from('customers').select('*').eq('session_id', sessionId).maybeSingle()
  if (error) throw new Error(`findCustomerBySession: ${error.message}`)
  return data
}

export async function findCustomerByEmail(email: string): Promise<CustomerRow | null> {
  const key = email.trim().toLowerCase()
  const sb = getSupabase()
  if (!sb) return mem().customers.find(c => c.email === key) ?? null

  const { data, error } = await sb.from('customers').select('*').eq('email', key).maybeSingle()
  if (error) throw new Error(`findCustomerByEmail: ${error.message}`)
  return data
}

export async function getCustomer(id: string): Promise<CustomerRow | null> {
  const sb = getSupabase()
  if (!sb) return mem().customers.find(c => c.id === id) ?? null
  const { data, error } = await sb.from('customers').select('*').eq('id', id).maybeSingle()
  if (error) throw new Error(`getCustomer: ${error.message}`)
  return data
}

export async function upsertCustomer(input: Partial<CustomerRow> & { session_id?: string | null }) {
  const sb = getSupabase()
  const stamp = now()

  if (!sb) {
    const s = mem()
    const existing =
      (input.id && s.customers.find(c => c.id === input.id)) ||
      (input.email && s.customers.find(c => c.email === input.email)) ||
      (input.session_id && s.customers.find(c => c.session_id === input.session_id)) ||
      null

    if (existing) {
      Object.assign(existing, input, { updated_at: stamp })
      return existing
    }
    const row: CustomerRow = {
      id: input.id ?? randomUUID(),
      name: input.name ?? null,
      email: input.email ?? null,
      phone: input.phone ?? null,
      telegram_chat_id: input.telegram_chat_id ?? null,
      lifecycle_stage: input.lifecycle_stage ?? 'COLD',
      lead_score: input.lead_score ?? 0,
      session_id: input.session_id ?? null,
      created_at: stamp,
      updated_at: stamp,
    }
    s.customers.push(row)
    return row
  }

  if (input.id) {
    const { data, error } = await sb
      .from('customers')
      .update({ ...input, updated_at: stamp })
      .eq('id', input.id)
      .select()
      .single()
    if (error) throw new Error(`upsertCustomer: ${error.message}`)
    return data as CustomerRow
  }

  const { data, error } = await sb.from('customers').insert({ ...input }).select().single()
  if (error) throw new Error(`upsertCustomer: ${error.message}`)
  return data as CustomerRow
}

export async function listCustomers(limit = 200): Promise<CustomerRow[]> {
  const sb = getSupabase()
  if (!sb) return [...mem().customers].sort((a, b) => b.lead_score - a.lead_score).slice(0, limit)
  return must(
    await sb.from('customers').select('*').order('lead_score', { ascending: false }).limit(limit),
    'listCustomers',
  )
}

// ── 관심조건 ────────────────────────────────────────────────

export async function getPreference(customerId: string): Promise<PreferenceRow | null> {
  const sb = getSupabase()
  if (!sb) return mem().preferences.find(p => p.customer_id === customerId) ?? null
  const { data, error } = await sb
    .from('customer_preferences')
    .select('*')
    .eq('customer_id', customerId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(`getPreference: ${error.message}`)
  return data
}

export async function savePreference(
  customerId: string,
  input: Omit<PreferenceRow, 'id' | 'customer_id' | 'created_at' | 'updated_at'>,
): Promise<PreferenceRow> {
  const sb = getSupabase()
  const stamp = now()

  if (!sb) {
    const s = mem()
    const existing = s.preferences.find(p => p.customer_id === customerId)
    if (existing) {
      Object.assign(existing, input, { updated_at: stamp })
      return existing
    }
    const row: PreferenceRow = { id: randomUUID(), customer_id: customerId, ...input, created_at: stamp, updated_at: stamp }
    s.preferences.push(row)
    return row
  }

  const existing = await getPreference(customerId)
  if (existing) {
    const { data, error } = await sb
      .from('customer_preferences')
      .update({ ...input, updated_at: stamp })
      .eq('id', existing.id)
      .select()
      .single()
    if (error) throw new Error(`savePreference: ${error.message}`)
    return data as PreferenceRow
  }

  const { data, error } = await sb
    .from('customer_preferences')
    .insert({ customer_id: customerId, ...input })
    .select()
    .single()
  if (error) throw new Error(`savePreference: ${error.message}`)
  return data as PreferenceRow
}

/** 알림을 받기로 한, 조건이 등록된 고객 전부 */
export async function listNotifiablePreferences(): Promise<
  { preference: PreferenceRow; customer: CustomerRow }[]
> {
  const sb = getSupabase()
  if (!sb) {
    const s = mem()
    return s.preferences
      .filter(p => p.notification_enabled)
      .map(p => ({ preference: p, customer: s.customers.find(c => c.id === p.customer_id)! }))
      .filter(r => r.customer)
  }

  // 단일 쿼리로 조인해 N+1 을 피한다
  const { data, error } = await sb
    .from('customer_preferences')
    .select('*, customers!inner(*)')
    .eq('notification_enabled', true)
  if (error) throw new Error(`listNotifiablePreferences: ${error.message}`)

  return (data ?? []).map((row: PreferenceRow & { customers: CustomerRow }) => {
    const { customers, ...preference } = row
    return { preference: preference as PreferenceRow, customer: customers }
  })
}

// ── 주거기회 ────────────────────────────────────────────────

export interface OpportunityFilter {
  region?: string
  housingType?: string
  includeDemo?: boolean
  onlyOpen?: boolean
  limit?: number
}

export async function listOpportunities(f: OpportunityFilter = {}): Promise<OpportunityRow[]> {
  const { region, housingType, includeDemo = true, onlyOpen = false, limit = 100 } = f
  const sb = getSupabase()

  if (!sb) {
    return mem()
      .opportunities.filter(o => (region ? o.region === region : true))
      .filter(o => (housingType ? o.housing_type === housingType : true))
      .filter(o => (includeDemo ? true : !o.is_demo))
      .filter(o => (onlyOpen ? o.status === 'OPEN' || o.status === 'UPCOMING' : true))
      .sort((a, b) => (a.application_end ?? '9999').localeCompare(b.application_end ?? '9999'))
      .slice(0, limit)
  }

  let q = sb.from('opportunities').select('*')
  if (region) q = q.eq('region', region)
  if (housingType) q = q.eq('housing_type', housingType)
  if (!includeDemo) q = q.eq('is_demo', false)
  if (onlyOpen) q = q.in('status', ['OPEN', 'UPCOMING'])
  return must(
    await q.order('application_end', { ascending: true, nullsFirst: false }).limit(limit),
    'listOpportunities',
  )
}

export async function getOpportunity(id: string): Promise<OpportunityRow | null> {
  const sb = getSupabase()
  if (!sb) return mem().opportunities.find(o => o.id === id) ?? null
  const { data, error } = await sb.from('opportunities').select('*').eq('id', id).maybeSingle()
  if (error) throw new Error(`getOpportunity: ${error.message}`)
  return data
}

export interface UpsertResult {
  inserted: number
  updated: number
  failed: number
  errors: string[]
}

/** (source, external_id) 기준 중복 방지 upsert */
export async function upsertOpportunities(rows: Partial<OpportunityRow>[]): Promise<UpsertResult> {
  const out: UpsertResult = { inserted: 0, updated: 0, failed: 0, errors: [] }
  const sb = getSupabase()
  const stamp = now()

  if (!sb) {
    const s = mem()
    for (const r of rows) {
      const key = `${r.source}|${r.external_id}`
      const existing = s.opportunities.find(o => `${o.source}|${o.external_id}` === key)
      if (existing) {
        Object.assign(existing, r, { updated_at: stamp })
        out.updated++
      } else {
        s.opportunities.push({
          id: r.id ?? randomUUID(),
          source: r.source ?? 'CSV',
          external_id: r.external_id ?? null,
          opportunity_type: r.opportunity_type ?? 'RENTAL',
          housing_type: r.housing_type ?? '기타',
          title: r.title ?? '',
          region: r.region ?? '',
          district: r.district ?? null,
          address: r.address ?? null,
          area: r.area ?? null,
          deposit: r.deposit ?? null,
          monthly_rent: r.monthly_rent ?? null,
          supply_count: r.supply_count ?? null,
          vacancy_count: r.vacancy_count ?? null,
          application_start: r.application_start ?? null,
          application_end: r.application_end ?? null,
          document_deadline: r.document_deadline ?? null,
          result_date: r.result_date ?? null,
          contract_start: r.contract_start ?? null,
          status: r.status ?? 'OPEN',
          source_url: r.source_url ?? null,
          competition_rate: r.competition_rate ?? null,
          is_demo: r.is_demo ?? false,
          // 좌표는 수집 뒤에 따로 채운다 (lib/services/geocode-fill.ts)
          lat: r.lat ?? null,
          lng: r.lng ?? null,
          geo_source: r.geo_source ?? null,
          geo_at: r.geo_at ?? null,
          created_at: stamp,
          updated_at: stamp,
        })
        out.inserted++
      }
    }
    return out
  }

  // 기존 키를 한 번에 조회해 insert/update 수를 정확히 센다 (N+1 방지)
  const keys = rows.map(r => r.external_id).filter(Boolean) as string[]
  const existingKeys = new Set<string>()
  if (keys.length) {
    const { data } = await sb.from('opportunities').select('source, external_id').in('external_id', keys)
    for (const d of data ?? []) existingKeys.add(`${d.source}|${d.external_id}`)
  }

  const { error } = await sb
    .from('opportunities')
    .upsert(rows.map(r => ({ ...r, updated_at: stamp })), { onConflict: 'source,external_id' })
  if (error) {
    out.failed = rows.length
    out.errors.push(error.message)
    return out
  }

  for (const r of rows) {
    if (existingKeys.has(`${r.source}|${r.external_id}`)) out.updated++
    else out.inserted++
  }
  return out
}

export async function updateOpportunity(id: string, patch: Partial<OpportunityRow>) {
  const sb = getSupabase()
  if (!sb) {
    const row = mem().opportunities.find(o => o.id === id)
    if (row) Object.assign(row, patch, { updated_at: now() })
    return row ?? null
  }
  const { data, error } = await sb
    .from('opportunities')
    .update({ ...patch, updated_at: now() })
    .eq('id', id)
    .select()
    .single()
  if (error) throw new Error(`updateOpportunity: ${error.message}`)
  return data as OpportunityRow
}

// ── 이벤트 ──────────────────────────────────────────────────

export async function insertEvent(
  row: Omit<OpportunityEventRow, 'id' | 'occurred_at'> & { occurred_at?: string },
): Promise<OpportunityEventRow> {
  const sb = getSupabase()
  const full = { ...row, occurred_at: row.occurred_at ?? now() }

  if (!sb) {
    const created: OpportunityEventRow = { id: randomUUID(), ...full }
    mem().events.unshift(created)
    return created
  }
  const { data, error } = await sb.from('opportunity_events').insert(full).select().single()
  if (error) throw new Error(`insertEvent: ${error.message}`)
  return data as OpportunityEventRow
}

export async function listEvents(limit = 60): Promise<OpportunityEventRow[]> {
  const sb = getSupabase()
  if (!sb) return mem().events.slice(0, limit)
  return must(
    await sb.from('opportunity_events').select('*').order('occurred_at', { ascending: false }).limit(limit),
    'listEvents',
  )
}

// ── 매칭 ────────────────────────────────────────────────────

export async function insertMatches(rows: Omit<MatchRow, 'id' | 'created_at'>[]): Promise<MatchRow[]> {
  if (!rows.length) return []
  const sb = getSupabase()
  const stamp = now()

  if (!sb) {
    const created = rows.map(r => ({ id: randomUUID(), created_at: stamp, ...r }))
    mem().matches.unshift(...created)
    return created
  }
  const { data, error } = await sb.from('matches').insert(rows).select()
  if (error) throw new Error(`insertMatches: ${error.message}`)
  return (data ?? []) as MatchRow[]
}

export async function listMatches(opts: { customerId?: string; limit?: number } = {}) {
  const { customerId, limit = 120 } = opts
  const sb = getSupabase()
  if (!sb) {
    return mem()
      .matches.filter(m => (customerId ? m.customer_id === customerId : true))
      .slice(0, limit)
  }
  let q = sb.from('matches').select('*')
  if (customerId) q = q.eq('customer_id', customerId)
  return must(await q.order('created_at', { ascending: false }).limit(limit), 'listMatches')
}

export async function updateMatchStatus(id: string, status: MatchRow['status']) {
  const sb = getSupabase()
  if (!sb) {
    const m = mem().matches.find(x => x.id === id)
    if (m) m.status = status
    return m ?? null
  }
  const { data, error } = await sb.from('matches').update({ status }).eq('id', id).select().single()
  if (error) throw new Error(`updateMatchStatus: ${error.message}`)
  return data as MatchRow
}

// ── 알림 ────────────────────────────────────────────────────

export async function insertNotification(
  row: Omit<NotificationRow, 'id' | 'created_at'>,
): Promise<NotificationRow> {
  const sb = getSupabase()
  if (!sb) {
    const created: NotificationRow = { id: randomUUID(), created_at: now(), ...row }
    mem().notifications.unshift(created)
    return created
  }
  const { data, error } = await sb.from('notifications').insert(row).select().single()
  if (error) throw new Error(`insertNotification: ${error.message}`)
  return data as NotificationRow
}

export async function getNotification(id: string): Promise<NotificationRow | null> {
  const sb = getSupabase()
  if (!sb) return mem().notifications.find(n => n.id === id) ?? null
  const { data, error } = await sb.from('notifications').select('*').eq('id', id).maybeSingle()
  if (error) throw new Error(`getNotification: ${error.message}`)
  return data
}

export async function markNotificationClicked(id: string) {
  const sb = getSupabase()
  const stamp = now()
  if (!sb) {
    const n = mem().notifications.find(x => x.id === id)
    // 첫 클릭 시각만 보존한다
    if (n && !n.clicked_at) n.clicked_at = stamp
    return n ?? null
  }
  const { data, error } = await sb
    .from('notifications')
    .update({ clicked_at: stamp })
    .eq('id', id)
    .is('clicked_at', null)
    .select()
    .maybeSingle()
  if (error) throw new Error(`markNotificationClicked: ${error.message}`)
  return data
}

export async function listNotifications(limit = 50): Promise<NotificationRow[]> {
  const sb = getSupabase()
  if (!sb) return mem().notifications.slice(0, limit)
  return must(
    await sb.from('notifications').select('*').order('created_at', { ascending: false }).limit(limit),
    'listNotifications',
  )
}

// ── 행동 이벤트 ─────────────────────────────────────────────

export async function insertBehavior(
  row: Omit<BehaviorEventRow, 'id' | 'created_at'>,
): Promise<BehaviorEventRow> {
  const sb = getSupabase()
  if (!sb) {
    const created: BehaviorEventRow = { id: randomUUID(), created_at: now(), ...row }
    mem().behaviors.unshift(created)
    return created
  }
  const { data, error } = await sb.from('behavior_events').insert(row).select().single()
  if (error) throw new Error(`insertBehavior: ${error.message}`)
  return data as BehaviorEventRow
}

export async function listBehaviors(opts: { customerId?: string; limit?: number } = {}) {
  const { customerId, limit = 100 } = opts
  const sb = getSupabase()
  if (!sb) {
    return mem()
      .behaviors.filter(b => (customerId ? b.customer_id === customerId : true))
      .slice(0, limit)
  }
  let q = sb.from('behavior_events').select('*')
  if (customerId) q = q.eq('customer_id', customerId)
  return must(await q.order('created_at', { ascending: false }).limit(limit), 'listBehaviors')
}

// ── 지원 ────────────────────────────────────────────────────

export async function findApplication(customerId: string, opportunityId: string) {
  const sb = getSupabase()
  if (!sb) {
    return (
      mem().applications.find(a => a.customer_id === customerId && a.opportunity_id === opportunityId) ?? null
    )
  }
  const { data, error } = await sb
    .from('applications')
    .select('*')
    .eq('customer_id', customerId)
    .eq('opportunity_id', opportunityId)
    .maybeSingle()
  if (error) throw new Error(`findApplication: ${error.message}`)
  return data
}

export async function insertApplication(
  row: Omit<ApplicationRow, 'id' | 'created_at' | 'updated_at'>,
): Promise<ApplicationRow> {
  const sb = getSupabase()
  const stamp = now()
  if (!sb) {
    const created: ApplicationRow = { id: randomUUID(), created_at: stamp, updated_at: stamp, ...row }
    mem().applications.push(created)
    return created
  }
  const { data, error } = await sb.from('applications').insert(row).select().single()
  if (error) throw new Error(`insertApplication: ${error.message}`)
  return data as ApplicationRow
}

export async function updateApplicationStage(id: string, stage: ApplicationRow['stage']) {
  const sb = getSupabase()
  if (!sb) {
    const a = mem().applications.find(x => x.id === id)
    if (a) {
      a.stage = stage
      a.updated_at = now()
    }
    return a ?? null
  }
  const { data, error } = await sb
    .from('applications')
    .update({ stage, updated_at: now() })
    .eq('id', id)
    .select()
    .single()
  if (error) throw new Error(`updateApplicationStage: ${error.message}`)
  return data as ApplicationRow
}

export async function listApplications(opts: { customerId?: string; limit?: number } = {}) {
  const { customerId, limit = 200 } = opts
  const sb = getSupabase()
  if (!sb) {
    return mem()
      .applications.filter(a => (customerId ? a.customer_id === customerId : true))
      .slice(0, limit)
  }
  let q = sb.from('applications').select('*')
  if (customerId) q = q.eq('customer_id', customerId)
  return must(await q.order('updated_at', { ascending: false }).limit(limit), 'listApplications')
}

export async function insertTasks(
  rows: Omit<ApplicationTaskRow, 'id' | 'created_at'>[],
): Promise<ApplicationTaskRow[]> {
  if (!rows.length) return []
  const sb = getSupabase()
  const stamp = now()
  if (!sb) {
    const created = rows.map(r => ({ id: randomUUID(), created_at: stamp, ...r }))
    mem().tasks.push(...created)
    return created
  }
  const { data, error } = await sb.from('application_tasks').insert(rows).select()
  if (error) throw new Error(`insertTasks: ${error.message}`)
  return (data ?? []) as ApplicationTaskRow[]
}

export async function listTasks(applicationIds: string[]): Promise<ApplicationTaskRow[]> {
  if (!applicationIds.length) return []
  const sb = getSupabase()
  if (!sb) return mem().tasks.filter(t => applicationIds.includes(t.application_id))
  return must(
    await sb.from('application_tasks').select('*').in('application_id', applicationIds).order('due_date'),
    'listTasks',
  )
}

// ── 문의 ────────────────────────────────────────────────────

export async function insertInquiry(row: Omit<InquiryRow, 'id' | 'created_at'>): Promise<InquiryRow> {
  const sb = getSupabase()
  if (!sb) {
    const created: InquiryRow = { id: randomUUID(), created_at: now(), ...row }
    mem().inquiries.push(created)
    return created
  }
  const { data, error } = await sb.from('inquiries').insert(row).select().single()
  if (error) throw new Error(`insertInquiry: ${error.message}`)
  return data as InquiryRow
}

export async function listInquiries(limit = 50): Promise<InquiryRow[]> {
  const sb = getSupabase()
  if (!sb) return mem().inquiries.slice(0, limit)
  return must(
    await sb.from('inquiries').select('*').order('created_at', { ascending: false }).limit(limit),
    'listInquiries',
  )
}
