-- ============================================================
-- 집캐치 — Housing Opportunity CRM 스키마
-- Supabase SQL Editor 에 그대로 붙여 실행한다.
-- ============================================================

create extension if not exists "pgcrypto";

-- ── 고객 ────────────────────────────────────────────────────
create table if not exists customers (
  id                uuid primary key default gen_random_uuid(),
  name              text,
  email             text unique,
  phone             text,
  telegram_chat_id  text,
  lifecycle_stage   text not null default 'COLD'
                      check (lifecycle_stage in ('COLD','WARM','HOT','APPLICATION_INTENT')),
  lead_score        integer not null default 0,
  -- 가입 전 탐색 세션을 가입 후 계정에 잇기 위한 식별자
  session_id        text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists customers_session_idx on customers (session_id);
create index if not exists customers_lead_idx on customers (lead_score desc);

-- ── 관심조건 ────────────────────────────────────────────────
create table if not exists customer_preferences (
  id                      uuid primary key default gen_random_uuid(),
  customer_id             uuid not null references customers(id) on delete cascade,
  preferred_regions       text[] not null default '{}',
  max_deposit             integer,          -- 만원. null = 미정
  max_monthly_rent        integer,          -- 만원. null = 미정
  min_area                numeric,          -- ㎡.  null = 미정
  preferred_housing_types text[] not null default '{}',
  move_in_period          text,
  notification_enabled    boolean not null default false,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);
create index if not exists prefs_customer_idx on customer_preferences (customer_id);
create index if not exists prefs_regions_idx on customer_preferences using gin (preferred_regions);

-- ── 주거기회 ────────────────────────────────────────────────
create table if not exists opportunities (
  id                uuid primary key default gen_random_uuid(),
  source            text not null,                    -- APPLYHOME | LH | SH | CSV | ADMIN | DEMO
  external_id       text,
  opportunity_type  text not null default 'RENTAL'
                      check (opportunity_type in ('SUBSCRIPTION','RENTAL','PUBLIC_SALE','VACANCY')),
  housing_type      text not null,
  title             text not null,
  region            text not null,
  district          text,
  address           text,
  area              numeric,
  deposit           integer,                           -- 만원
  monthly_rent      integer,                           -- 만원
  supply_count      integer,
  vacancy_count     integer,
  -- 공고 원문에 있는 날짜만 채운다. 없으면 null 로 두고 만들어내지 않는다.
  application_start date,
  application_end   date,
  document_deadline date,
  result_date       date,
  contract_start    date,
  status            text not null default 'OPEN'
                      check (status in ('OPEN','UPCOMING','CLOSED','CANCELLED')),
  source_url        text,
  competition_rate  numeric,                           -- 공개 통계가 있을 때만
  -- 시연용 합성 데이터 여부. 실데이터와 절대 섞지 않는다.
  is_demo           boolean not null default false,
  -- 지도에 찍을 자리. 요청마다 지오코딩하면 첫 화면이 20초 넘게 비므로
  -- 한 번 찾아 여기 적어 두고 지도는 읽기만 한다.
  lat               numeric,
  lng               numeric,
  geo_source        text,                              -- ADDRESS | NAME | REGION
  geo_at            timestamptz,                       -- 못 찾았어도 찍어 둔다
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (source, external_id)
);
create index if not exists opp_region_idx on opportunities (region);
create index if not exists opp_status_idx on opportunities (status, application_end);
create index if not exists opp_demo_idx on opportunities (is_demo);
create index if not exists opp_budget_idx on opportunities (deposit, monthly_rent);
-- 아직 좌표를 못 채운 것만 빠르게 고른다
create index if not exists opp_geo_missing_idx on opportunities (geo_at) where lat is null;

-- ── 기회 이벤트 ─────────────────────────────────────────────
create table if not exists opportunity_events (
  id              uuid primary key default gen_random_uuid(),
  opportunity_id  uuid not null references opportunities(id) on delete cascade,
  event_type      text not null check (event_type in (
                    'NEW_ANNOUNCEMENT','NEW_PROPERTY','VACANCY_CREATED','VACANCY_INCREASED',
                    'VACANCY_DECREASED','VACANCY_CLOSED','APPLICATION_OPEN',
                    'DEADLINE_APPROACHING','PRICE_CHANGED','STATUS_CHANGED')),
  previous_value  text,
  current_value   text,
  occurred_at     timestamptz not null default now(),
  is_demo         boolean not null default false,
  metadata        jsonb not null default '{}'::jsonb
);
create index if not exists evt_opp_idx on opportunity_events (opportunity_id, occurred_at desc);
create index if not exists evt_time_idx on opportunity_events (occurred_at desc);

-- ── 매칭 ────────────────────────────────────────────────────
create table if not exists matches (
  id                 uuid primary key default gen_random_uuid(),
  customer_id        uuid not null references customers(id) on delete cascade,
  opportunity_id     uuid not null references opportunities(id) on delete cascade,
  event_id           uuid references opportunity_events(id) on delete set null,
  region_score       integer not null,
  affordability_score integer not null,
  area_score         integer not null,
  housing_type_score integer not null,
  -- 공개 경쟁률 통계가 없으면 null. 임의로 만들지 않고 가중치를 재분배한다.
  competition_score  integer,
  urgency_score      integer not null,
  opportunity_score  integer not null,
  -- 예산 상한 충족 여부와 초과액
  within_budget      boolean not null default true,
  deposit_over       integer not null default 0,
  rent_over          integer not null default 0,
  reason             text not null,
  status             text not null default 'NEW'
                       check (status in ('NEW','NOTIFIED','VIEWED','FAVORITED','DISMISSED')),
  created_at         timestamptz not null default now(),
  unique (customer_id, opportunity_id, event_id)
);
create index if not exists match_customer_idx on matches (customer_id, created_at desc);
create index if not exists match_score_idx on matches (opportunity_score desc);

-- ── 알림 ────────────────────────────────────────────────────
create table if not exists notifications (
  id              uuid primary key default gen_random_uuid(),
  customer_id     uuid not null references customers(id) on delete cascade,
  opportunity_id  uuid references opportunities(id) on delete set null,
  match_id        uuid references matches(id) on delete set null,
  channel         text not null default 'EMAIL'
                    check (channel in ('EMAIL','TELEGRAM','KAKAO','PUSH','RCS')),
  -- PREVIEW: 자격증명이 없어 발송하지 않고 원문만 보관한 상태
  status          text not null default 'PREVIEW'
                    check (status in ('PREVIEW','QUEUED','SENT','FAILED')),
  message         text not null,
  detail          text,
  sent_at         timestamptz,
  clicked_at      timestamptz,
  created_at      timestamptz not null default now()
);
create index if not exists notif_customer_idx on notifications (customer_id, created_at desc);
create index if not exists notif_status_idx on notifications (status);

-- ── 행동 이벤트 ─────────────────────────────────────────────
create table if not exists behavior_events (
  id              uuid primary key default gen_random_uuid(),
  customer_id     uuid references customers(id) on delete cascade,
  session_id      text,
  opportunity_id  uuid references opportunities(id) on delete set null,
  notification_id uuid references notifications(id) on delete set null,
  event_type      text not null check (event_type in (
                    'NOTIFICATION_SENT','NOTIFICATION_CLICKED','DETAIL_VIEWED','FAVORITED',
                    'UNFAVORITED','APPLICATION_STARTED','APPLICATION_SUBMITTED',
                    'INQUIRY_CREATED','RETURN_VISIT','SEARCH_COMPLETED','PREFERENCE_SAVED')),
  source          text not null default 'WEB',
  -- 개인정보를 넣지 않는다. 식별자와 수치만.
  metadata        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);
create index if not exists beh_customer_idx on behavior_events (customer_id, created_at desc);
create index if not exists beh_type_idx on behavior_events (event_type, created_at desc);

-- ── 지원 ────────────────────────────────────────────────────
create table if not exists applications (
  id              uuid primary key default gen_random_uuid(),
  customer_id     uuid not null references customers(id) on delete cascade,
  opportunity_id  uuid not null references opportunities(id) on delete cascade,
  stage           text not null default 'DISCOVERED' check (stage in (
                    'DISCOVERED','REVIEWING','APPLYING','DOCUMENTS','SUBMITTED',
                    'RESULT_WAITING','WON','LOST','CONTRACT')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (customer_id, opportunity_id)
);
create index if not exists app_customer_idx on applications (customer_id);

create table if not exists application_tasks (
  id              uuid primary key default gen_random_uuid(),
  application_id  uuid not null references applications(id) on delete cascade,
  title           text not null,
  -- 공고 원문에 날짜가 없으면 null 로 두고 임의 생성하지 않는다.
  due_date        date,
  task_type       text not null default 'REVIEW'
                    check (task_type in ('REVIEW','APPLY','DOCUMENT','RESULT','CONTRACT')),
  -- OFFICIAL: 공고 기재 기한 / RECOMMENDED: 서비스가 제안하는 준비일
  date_source     text not null default 'RECOMMENDED'
                    check (date_source in ('OFFICIAL','RECOMMENDED')),
  status          text not null default 'TODO'
                    check (status in ('TODO','DONE','DATE_UNKNOWN','BLOCKED')),
  created_at      timestamptz not null default now()
);
create index if not exists task_app_idx on application_tasks (application_id, due_date);

-- ── 문의/상담 ───────────────────────────────────────────────
create table if not exists inquiries (
  id              uuid primary key default gen_random_uuid(),
  customer_id     uuid references customers(id) on delete set null,
  session_id      text,
  opportunity_id  uuid references opportunities(id) on delete set null,
  message         text not null,
  contact         text,
  status          text not null default 'OPEN' check (status in ('OPEN','IN_PROGRESS','CLOSED')),
  created_at      timestamptz not null default now()
);

-- ── 소비자 세션 스냅샷 ──────────────────────────────────────
-- 세션·관심공고·알림을 문서 한 건으로 보관한다.
-- 서버리스 파일시스템은 읽기 전용이라 파일로는 배포에서 동작하지 않는다.
-- 정규화된 테이블이 아니며 동시 쓰기는 마지막 쓰기가 이긴다 — 분리가 다음 단계다.
create table if not exists consumer_state (
  id         text primary key,
  doc        jsonb not null,
  updated_at timestamptz not null default now()
);

-- ── updated_at 자동 갱신 ────────────────────────────────────
-- search_path 를 비워 스키마 하이재킹을 막는다 (pg_catalog 은 항상 잡힌다)
create or replace function touch_updated_at() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['customers','customer_preferences','opportunities','applications'] loop
    execute format(
      'drop trigger if exists %I_touch on %I; create trigger %I_touch before update on %I
       for each row execute function touch_updated_at();', t, t, t, t);
  end loop;
end $$;

-- ============================================================
-- RLS
--
-- 이 앱의 모든 DB 접근은 서버 라우트에서 service role 키로 이뤄진다.
-- 브라우저에 anon 키를 노출하지 않으므로 기본 정책은 "전부 차단"으로 둔다.
-- service role 은 RLS 를 우회하므로 서버 동작에는 영향이 없다.
--
-- 추후 브라우저에서 직접 읽어야 한다면, 공개해도 되는 opportunities 만
-- 아래 주석 처리된 정책처럼 선택적으로 열 것.
-- ============================================================
alter table customers            enable row level security;
alter table customer_preferences enable row level security;
alter table opportunities        enable row level security;
alter table opportunity_events   enable row level security;
alter table matches              enable row level security;
alter table notifications        enable row level security;
alter table behavior_events      enable row level security;
alter table applications         enable row level security;
alter table application_tasks    enable row level security;
alter table inquiries            enable row level security;
alter table consumer_state       enable row level security;

-- 공고는 공개 정보이므로 읽기만 허용하고 싶을 때:
-- create policy "public read opportunities" on opportunities
--   for select using (true);
