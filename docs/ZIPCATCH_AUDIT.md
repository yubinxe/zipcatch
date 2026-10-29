# ZIPCATCH 4.0 — Phase 0 감사

기준일 2026-10-29 · 브랜치 `claude/optimistic-pasteur-r1p0h2` (main `a484e1b` 기준)
근거: 코드 정독, 운영 DB(Supabase `zipcatch`) 읽기 전용 SQL, 프로덕션 HTTP 응답. 쓰기·배포 없음.

상태 표기: WORKING / PARTIAL / BROKEN / MISSING / UNVERIFIED

## 1. 빌드 위생

| 항목 | 결과 |
|---|---|
| `npm test` | 26/26 통과 |
| `tsc --noEmit` | 0 오류 |
| `npm run lint` | 0 오류 |
| `npm run build` | 미실행 (Phase 1 첫 작업에서 실행) |

## 2. 운영 DB 실측 (2026-10-29)

| 대상 | 건수 | 마지막 갱신 |
|---|---|---|
| opportunities LH | 200 | 10-21 03:17 |
| opportunities APPLYHOME | 80 | 10-21 03:17 |
| opportunities DEMO | 60 | 09-16 |
| opportunity_events | 11 | **09-16** |
| matches | 1,046 | **09-16** |
| notifications (전부 PREVIEW) | 26 | **09-16** |
| customers | 116 | 10-27 |
| routine_runs 최종 | — | **09-17** |

- `routines` 13행 중 `sync-notices`, `fill-geo` 는 **실행 이력 0회**.
- 코드에 없는 루틴 9개가 DB에만 남음: `morning-brief`, `opportunity-change-watch`, `notification-retry`, `high-intent-watch`, `weekly-kpi`, `data-quality-watch`, `funnel-check`, `application-followup`, `automation-health`. 전부 `enabled=true`.
- 고유 제약: `opportunities(source, external_id)` ✓ · `matches(customer, opp, event)` ✓ · **notifications 없음**.
- RLS: 13개 테이블 모두 활성, 정책 0개 → anon 전면 차단(서버는 service role). 의도된 구조로 판단, 위험 아님.
- `supabase/schema.sql` 에 `routines`, `routine_runs` DDL 없음 → 저장소 스키마와 운영 DB 불일치.

## 3. 기능 상태

### 데이터 수집
| 연동 | 상태 | 근거 |
|---|---|---|
| 청약홈 분양공고 | PARTIAL | DB 80건, 그러나 10-21 이후 정지. 공개 목록 노출 2건뿐 |
| LH 임대공고 | PARTIAL | DB 200건, 10-21 이후 정지 |
| 마이홈 공고 보강 | UNVERIFIED | DB에 `MYHOME` source 0건. `/api/myhome/wait` 는 `province` 파라미터 형식 불일치로 `UNSUPPORTED` 응답(서울특별시 입력 시) |
| HUG 서울 분양 기본현황 | WORKING | `/api/hug/seoul-supply` 1,432건 OK |
| HUG 공정률 | UNVERIFIED | 키 존재 여부 미확인 |
| 국토부 매매 실거래 | WORKING | `/api/market/flow?lawd=11680` 12개월 응답 |
| 청약홈 경쟁률 통계 | WORKING | `/api/competition/stats` 응답 |

### 예약 작업
| 작업 | 상태 | 근거 |
|---|---|---|
| Vercel Cron → `/api/cron/routines` | **BROKEN** | 9/17 이후 `routine_runs` 0건. 엔드포인트는 401 정상 응답 → `CRON_SECRET` 미설정·불일치 또는 크론 비활성 추정(Vercel 커넥터에서 프로젝트 조회 불가 — 원인 UNVERIFIED) |
| sync-notices | BROKEN (한 번도 안 돎) | 10-21 갱신은 수동 `/api/admin/sync` 경로로 추정 |
| deadline-watch | BROKEN + 결함 | 아래 R2 |
| 실행 결과 등급 | PARTIAL | `SUCCESS/FAILED/SKIPPED` 만 존재. 출처 일부 실패도 `SUCCESS` 기록 |
| 중첩 실행 방지 | MISSING | `RUNNING` 상태 조회·잠금 없음 |
| 재시도 | MISSING | `notification-retry` 는 DB 스텁만 |

### 소비자 화면 (프로덕션 HTTP)
`/ /notices /map /flow /stats /score /compare /analyze /saved /pricing /pro /news /guide /sources /results /biz /insights` 전부 200. 렌더 품질·내부 링크·모바일은 **UNVERIFIED** (브라우저 검수는 Phase 4).
`/admin/*` 는 접속 코드 화면으로 잠김 — WORKING.

### 참조 사이트 (realdeal-s1-flow)
200 응답, 첫 화면 "동네 흐름"(시도·시군구 선택). 하위 기능(단지 서랍·브리핑 등)은 클라이언트 렌더라 **UNVERIFIED**. Phase 2 착수 시 브라우저로 증거 수집.

## 4. 중복·불필요 구현

| 중복 | 위치 | 판단 |
|---|---|---|
| CRM 두 벌 | `lib/crm/*`(합성 시드·메모리) ↔ `lib/db/repo` + `lib/services/*`(Supabase) | 매칭·스코어링·스케줄링이 각각 두 벌. 메모리판은 데모 전용으로 격리 후 단계적 퇴역 |
| 공고 동기화 두 경로 | `/api/admin/sync` ↔ 루틴 `sync-notices` | admin 경로를 `runRoutine('sync-notices','MANUAL')` 호출로 통합 |
| 루틴 정의 | DB 13개 ↔ 코드 4개 | 미구현 9개 비활성화. `morning-brief`·`opportunity-change-watch`·`notification-retry` 는 Phase 2 재사용 슬롯 |
| `dataOrigin` | `/api/notices`, `/api/search` | 공식 데이터만 있어도 `MIXED` 표기 → 오표기 |

## 5. 고장·위험 (우선순위순)

- **R1 · 수집 정지 (P0)** — 8일째 공고 갱신 없음. 사용자는 낡은 공고를 보고 있음.
- **R2 · 알림 중복 발송 (P0)** — `deadline-watch` 가 `runMatchingForEvent` 로 **이미 발송한 뒤** `sent` 집합으로 거르고 있어 집계만 줄고 발송은 중복. 마감 3일 창 동안 매일 재발송. DB 고유 제약도 없음. 현재는 발송 키 미설정이라 PREVIEW 로만 쌓여 실피해 없음 → 키를 넣는 순간 터짐.
- **R3 · 발송 가드 부재 (P0)** — dry-run 기본값 없음. `RESEND_API_KEY` 등이 설정되면 즉시 실발송.
- **R4 · 부분 실패가 SUCCESS (P1)** — 인증 실패·장애와 "0건"이 같은 성공으로 기록.
- **R5 · 중첩 실행 (P1)** — 4개 크론이 같은 경로. 수동 실행과 겹치면 동시 upsert·중복 매칭.
- **R6 · 스키마 드리프트 (P1)** — `routines` DDL 미보관 → 재구축 불가.
- **R7 · 신선도 미노출 (P1)** — 마지막 성공 수집 시각이 화면에 없음.
- **R8 · 마이홈 미연동 (P2)** — source 0건, 파라미터 불일치.

## 6. P0 해결 계획 (승인 대기)

1. **크론 복구 진단** — Vercel 대시보드에서 `CRON_SECRET`(Production) 존재, Cron Jobs 활성, 실행 로그 확인. 커넥터 권한이 없어 사용자 확인 필요.
2. **알림 멱등화**
   - `pipeline.runMatchingForEvent` 에서 발송 **전** `(customer_id, opportunity_id, kind)` 기존 알림 조회 후 건너뜀.
   - migration: `notifications` 에 `kind` 컬럼 + 부분 고유 인덱스 `(customer_id, opportunity_id, kind)`. rollback 스크립트 동봉.
3. **발송 dry-run 기본** — `NOTIFY_LIVE=1` 일 때만 provider 실발송, 그 외 PREVIEW 저장.
4. **실행 등급 PARTIAL 추가 + 잠금** — `RunStatus` 에 `PARTIAL`; 시작 시 같은 key 의 15분 내 `RUNNING` 있으면 `SKIPPED`.
5. **admin/sync 통합** — 루틴 실행기로 위임.
6. **회귀 테스트** — 중복 발송 0건, PARTIAL 판정, 잠금, `nextRunAt` 케이스.

## 7. 예상 수정 파일

- `lib/services/pipeline.ts`, `lib/services/routines.ts`, `lib/services/routine-runner.ts`
- `lib/db/routines-repo.ts`, `lib/db/repo.ts`, `lib/db/types.ts`
- `lib/adapters/notification.ts`, `lib/notifications/provider.ts`
- `app/api/admin/sync/route.ts`
- `supabase/schema.sql` + `supabase/migrations/2026xxxx_notification_idempotency.sql` (+ `_rollback.sql`)
- `tests/routines.test.mjs`, `tests/notification-dedupe.test.mjs` (신규)
- `.env.example` (`NOTIFY_LIVE`)

## 8. 검증 방법

- `npm test`, `tsc --noEmit`, `npm run lint`, `npm run build`
- 메모리 저장소 모드로 `deadline-watch` 연속 2회 실행 → 두 번째 알림 0건
- 출처 하나를 강제 실패시켜 `PARTIAL` 기록 확인
- 동시 2회 호출 → 하나 `SKIPPED`
- migration 은 Supabase 브랜치에서 적용·롤백 검증 후 운영 승인 요청

## 9. 승인 후 첫 작업

**P0-2 + P0-3**: 알림 멱등화 + dry-run 기본값. 코드·테스트만, DB migration 은 파일로 준비하고 적용은 별도 승인.
