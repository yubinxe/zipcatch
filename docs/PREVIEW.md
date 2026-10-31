# Preview 배포 — `preview/zipcatch-4-0`

PR #17(`claude/optimistic-pasteur-r1p0h2`)을 실제 Vercel 미리보기에서 확인하기 위한 브랜치다.
`vercel.json` 의 `claude/*` 자동 배포 차단은 운영 정책이라 건드리지 않고, 이 브랜치만 미리보기로 올린다.

미리보기에서 막히는 것 (`lib/runtime/deploy-guard.ts`, VERCEL_ENV ≠ production):
- Supabase 쓰기(insert·update·upsert·delete·rpc) — 읽기만 한다
- 이메일·텔레그램·카카오 실발송 — 원문만 남긴다
- Vercel Cron 은 운영 배포에서만 돈다

이 브랜치는 PR #17 과 같은 코드를 담는다. 병합 대상은 PR #17 이고, 이 브랜치는 병합하지 않는다.

## 검증용 픽스처 · 설정 진단 (운영 404)
- `/api/preview/fixture?on=1&next=/map` — 가상 공고 16건([검증용 가상])으로 화면을 연다. `?on=0` 으로 끈다
- `/api/preview/env` — 이 배포의 설정 이름별 있음/없음과 배포 SHA. 값은 내보내지 않는다
- 운영 Supabase 관리자 키는 미리보기에 두지 않는다. 쓰기 차단(deploy-guard)은 앱의 Supabase 클라이언트 한 곳만 막는
  안전망이지 키의 권한을 줄이지 않는다
- `NEXT_PUBLIC_*` 는 빌드 때 박힌다 — 미리보기 범위에 값을 바꾸면 이 브랜치를 다시 빌드해야 반영된다
