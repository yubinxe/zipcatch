-- Migration: 2026-11-17
-- 목적:
--   1) notifications 중복 발송 방지를 위한 공고·고객 조회 인덱스 및 선택적 idempotency 준비
--   2) opportunities 에 LH 공고 게시일(PAN_NT_ST_DT) 보관용 notice_published_at 컬럼 추가
--   3) routines / routine_runs 테이블 스키마 동기화 (이미 운영 DB에 있으면 if not exists 로 무해)
-- 주의: 운영 DB 적용 전 반드시 검토/승인 후 실행할 것.

alter table opportunities
  add column if not exists notice_published_at date;

create index if not exists notif_opp_customer_idx
  on notifications (opportunity_id, customer_id)
  where opportunity_id is not null;

create table if not exists routines (
  id             uuid primary key default gen_random_uuid(),
  key            text not null unique,
  name           text not null,
  purpose        text not null,
  instruction    text not null,
  schedule_cron  text not null,
  schedule_label text not null,
  enabled        boolean not null default true,
  last_run_at    timestamptz,
  next_run_at    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table if not exists routine_runs (
  id          uuid primary key default gen_random_uuid(),
  routine_id  uuid not null references routines(id) on delete cascade,
  routine_key text not null,
  trigger     text not null check (trigger in ('SCHEDULE','MANUAL')),
  status      text not null check (status in ('RUNNING','SUCCESS','FAILED','SKIPPED')),
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  duration_ms integer,
  summary     text,
  detail      jsonb not null default '{}'::jsonb
);
create index if not exists routine_runs_key_idx on routine_runs (routine_key, started_at desc);

alter table routines     enable row level security;
alter table routine_runs enable row level security;
