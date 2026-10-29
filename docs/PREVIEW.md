# Preview 배포 — `preview/zipcatch-4-0`

PR #17(`claude/optimistic-pasteur-r1p0h2`)을 실제 Vercel 미리보기에서 확인하기 위한 브랜치다.
`vercel.json` 의 `claude/*` 자동 배포 차단은 운영 정책이라 건드리지 않고, 이 브랜치만 미리보기로 올린다.

미리보기에서 막히는 것 (`lib/runtime/deploy-guard.ts`, VERCEL_ENV ≠ production):
- Supabase 쓰기(insert·update·upsert·delete·rpc) — 읽기만 한다
- 이메일·텔레그램·카카오 실발송 — 원문만 남긴다
- Vercel Cron 은 운영 배포에서만 돈다

이 브랜치는 PR #17 과 같은 코드를 담는다. 병합 대상은 PR #17 이고, 이 브랜치는 병합하지 않는다.
