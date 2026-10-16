@AGENTS.md

# zipcatch (집캐치)

## 세션 시작 시 할 일

1. `docs/WORKLOG.md` 를 먼저 읽고 '진행 중'부터 이어간다.
2. `git status` · `git log --oneline -5` · `gh pr list` 로 현재 위치를 확인한다.
3. 작업을 마치면 `docs/WORKLOG.md` 의 현재 상태·진행 중·다음 행동을 갱신해 같은 PR 에 커밋한다.

## 프로젝트 개요

청약·공공임대 공고를 찾는 일반 소비자용 서비스(README). 조건을 입력하면 지원 가능한 후보를 정리하고 관심공고·일정·알림을 관리한다.
운영 화면(`/admin/*`, 접속 코드 필요)은 사업자 내부용 CRM 이다. 상세 정책은 `README.md` 가 기준이다.

## 저장소 간 관계

- 이 저장소는 `yubinxe/ch_insight`(옛 이름 `yubinxe/myhomeplz`, 그 전 `yubinxe/260601_dashboard`)와 **같은 히스토리**를 잇는다(루트 커밋 `4f234d0` 동일).
- ch_insight 의 `main`·`feat/housing-opportunity-crm`(`9d469bb`)·`claude/jibcatch-presentation-scenario-ppt-ynlm1c`(`84babb4`) 커밋이 모두 이 저장소 `main` 에 들어 있다. 이 저장소는 그 뒤 27개 커밋(`2abbd62` 까지)과 PR #2(`4658e20`)를 더 가진 **최신 기준 저장소**다.
- 운영 사이트 `https://zipcatch.vercel.app` 을 코드 기본 도메인으로 쓴다(`app/layout.tsx`·`app/sitemap.ts`·`app/robots.ts`). PR #2 본문: "운영(zipcatch.vercel.app)은 CLI 배포본 86139f2 이고 main 은 그보다 9커밋 앞서 있습니다."
- 운영 Vercel 프로젝트 이름·Git 연동 여부: 확인 필요(`docs/setup/deploy.md` 는 CLI 배포 절차를 적고 있다).

## 기술 스택

- Next.js 16.2.6 (App Router, `proxy.ts`) · React 19.2.4 · TypeScript 5
- Supabase(`@supabase/supabase-js`, 스키마 `supabase/schema.sql`) — 자격증명이 없으면 메모리 폴백
- Tailwind CSS 4 + `app/consumer.css`(소비자) · `app/crm.css`(운영)
- recharts 3 · date-fns 4 · 카카오맵 · puppeteer-core(보고서 PDF 캡처, dev)
- Vercel Cron(`vercel.json` → `/api/cron/routines`)

## 구조

| 경로 | 역할 |
|------|------|
| `app/(consumer)/` | 소비자 화면(analyze·results·notices·saved·guide·map·news·score·stats·biz·pro·login) |
| `app/admin/` | 운영 화면(dashboard·customers·properties·matches·applications·routines), `layout.tsx` 에서 인증 |
| `app/api/` | me·search·notices·saved·alerts·auth·crm·cron·news·market 등 |
| `lib/crm/services/` | scoring · matching · scheduling · analytics |
| `lib/services/` | matching · pipeline · lead-scoring · chat · routines · market-read 등 |
| `lib/adapters/` | applyhome(분양) · lh(임대) · molit(실거래·전월세) · csv |
| `lib/consumer/official.ts` | 실제 공고 → 소비자 화면 단일 통로 |
| `lib/db/repo.ts` | Supabase 저장소(메모리 폴백) |
| `docs/strategy/` | 제품 리뷰·디자인 방향·구현 브리프(2026-09-14) |
| `docs/setup/` | deploy · supabase 설정 |
| `scripts/` | db-check · audit · capture-pdf · build-report.py · fetch-region-emblems |

## 명령 (package.json)

```bash
npm run dev        # next dev
npm run build      # next build
npm run start      # next start
npm run lint       # eslint
npm run db:check   # node scripts/db-check.mjs
```

테스트 스크립트는 없다.

## 클라우드 환경 변수(이름만)

빌드는 키 없이 통과한다(2026-10-16 확인). 기능별로 필요한 이름(`.env.example`·코드 기준):
`DATA_GO_KR_API_KEY` · `PUBLIC_DATA_API_KEY` · `MOLIT_API_KEY` · `SUPABASE_URL` · `SUPABASE_SERVICE_ROLE_KEY` · `NEXT_PUBLIC_SUPABASE_URL` · `ADMIN_PASSCODE` · `NEXT_PUBLIC_SITE_URL` · `RESEND_API_KEY` · `NOTIFICATION_FROM` · `TELEGRAM_BOT_TOKEN` · `KAKAO_ACCESS_TOKEN` · `KAKAO_REST_API_KEY` · `NEXT_PUBLIC_KAKAO_MAP_JS_KEY` · `CRON_SECRET` · `MATCH_NOTIFY_THRESHOLD` · `MATCH_CANDIDATE_THRESHOLD` · `MATCH_MAX_NOTIFY` · `CONSUMER_DATA_DIR`

secret 키에 `NEXT_PUBLIC_` 을 붙이지 않는다(README).

## 작업 규칙

- 모든 변경은 브랜치 → PR. `main` 병합·운영 배포는 사용자 승인 후에만.
- `.cursor/rules/post-work-deploy.mdc` 의 "작업 후 `git push origin main`" 지침은 Claude 세션에서는 따르지 않는다(위 규칙 우선).
- API 키·`.env`·개인정보 커밋 금지. 키는 `~/.config/supabase/`·Vercel 환경 변수에만 둔다.
- 지어낸 수치·실적 금지. 값이 없으면 `null`·"확인 필요"로 두고 예시 데이터는 `예시 공고`로 표시한다(README 데이터 정책).
- 사용자 보고는 한국어로 간결하게(결론 → 검증 → 문제 → 결정 필요).

## 디자인 기준

`docs/strategy/2026-09-14-consumer-design-direction.md` 가 기준(README 요약).
지면 `#F4F1EB` · 제목 `#14110C` · 본문 `#3B352C` · 괘선 `#E2DBCF` · 채색은 주묵 `#A83A20` 하나(섹션 번호·히어로 강조·마감).
제목 Gmarket Sans, 본문 Pretendard, 핵심 정보 16px 미만 금지, 상호작용 영역 44×44px 이상.

## 테스트·배포 정책

- 변경 후 `npm run lint` · `npm run build` 통과를 확인한다(2026-10-16 기준 둘 다 통과).
- 배포 절차는 `docs/setup/deploy.md`. 운영 배포는 사용자 승인 후에만.
