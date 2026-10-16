# WORKLOG — zipcatch (집캐치)

세션을 시작하면 이 파일을 먼저 읽고 '진행 중'부터 이어간다. 작업을 마치면 갱신한다.

## 현재 상태

- 기준일: 2026-10-16
- 기본 브랜치 `main` 최신: `4658e20` 제작자 표기 — 김유빈 포트폴리오 연결 (#2) (2026-10-11)
- 원격 브랜치: `main`, `feat/housing-opportunity-crm`(`2abbd62`, main 에 모두 포함), `chore/cloud-continuity`(이 문서)
- 운영 `https://zipcatch.vercel.app` = CLI 배포본 `86139f2`(PR #2 본문 기준). `main` 은 그보다 10커밋 앞서 있다(미배포). 현재 운영 배포 버전은 확인 필요.
- 검증(2026-10-16, `main` 기준 클린 클론, 환경 변수 없음): `npm ci` 성공 · `npm run lint` 통과 · `npm run build` 성공 · 테스트 스크립트 없음

## 완료

`main` 최신순
- 제작자 표기 — 포트폴리오 연결(author 메타·JSON-LD creator·화면 크레딧) (`4658e20`, PR #2, 2026-10-11)
- 검수·미감·a11y: 메뉴 터치 영역, 빈 카드, 중복 제목, 대비 부족 글자, 지자체 동음이의 (`3d8e6f2`, `cd07866`, `2abbd62`, 2026-09-26)
- 지도 카카오 조회를 한 번만 하도록 캐시 (`61ff697`, 2026-09-26)
- 사업성 화면(공급자 관점) (`5d53578`, 2026-09-23)
- 특공 신청현황, 일반구 상징 매핑, 미달 판독·건수 조건 수정 (`ef5cb83`, `9269f09`, `fc4024e`, 2026-09-23)
- 사이트를 떠서 사업보고 PDF 생성 (`33d7188`, 2026-09-22)
- 지도로 보기/목록 전환 버그 수정 — 현재 운영 배포본 (`86139f2`, 2026-09-22)
- 공고 카드 지자체 상징, 상징 목록을 공고에서 수집 (`0561d61`, `39ef36c`)
- 경쟁률 판·지역 마크·지도 분리·민간분양 가이드, 공급 판독 (`baf0dd8`, `2ba65af`)
- 발표자료(IR 덱·시나리오) 브랜치 병합 (`61e4687`)
- 지도 첫 호출 성능, 주소 없는 공고 이름 검색 배치 (`d886f43`, `0b60959`)
- 임대 공고 주변 전월세 시세·LH 공고 위치, 분양권 전매 비교 (`f204320`, `9d469bb`)
- 그 이전(2026-06-01 ~ 09-18): 청약 대시보드 초기 구현 → CRM·소비자 서비스 전환(ch_insight 와 공통 히스토리)

## 진행 중

- 클라우드(웹·iPhone) 작업 연속성 준비: CLAUDE.md · docs/WORKLOG.md · `.claude/settings.json` 세션 훅 (브랜치 `chore/cloud-continuity`, PR 검토 대기)

## 미해결 문제

- 운영본(`86139f2`)과 `main` 사이 미배포 10커밋. 배포 여부·시점은 사용자 결정 필요.
- 운영 Vercel 프로젝트 이름·GitHub 자동 배포 연동 여부: 확인 필요(`docs/setup/deploy.md` 는 CLI 배포 기준).
- `docs/presentation/jipcatch-발표자료.md` 의 서비스 URL 이 옛 주소(`cheongak-dashboard-opal.vercel.app`)다.
- `.cursor/rules/post-work-deploy.mdc` 가 옛 저장소명(`260601_dashboard`)과 main 직접 푸시를 지시한다. Claude 세션은 CLAUDE.md 규칙을 따른다.
- 같은 히스토리를 가진 `yubinxe/ch_insight` 와의 역할 정리(일원화 여부) 결정 필요.
- README '아직 안 된 것': 공고 금액·면적, LH 세부 지역, 경쟁률 연동 기준, 이메일 발송(`RESEND_API_KEY`), 자격 판정, 인증 강화.

## 열린 PR

| # | 브랜치 | 요약 | 리뷰 상태 |
|---|--------|------|-----------|
| 3 | `chore/cloud-continuity` → `main` | 클라우드 작업 연속성: CLAUDE.md · WORKLOG · 세션 훅 | Open · 검토 대기 |

(참고: #1 `credit/maker-attribution` 은 Closed — 운영본+제작자 표기 CLI 배포용, #2 는 Merged)

## 다음 행동

1. 이 PR(`chore/cloud-continuity`) 검토 후 병합 승인.
2. 미배포 10커밋의 운영 배포 여부 결정.
3. ch_insight 와 zipcatch 중 개발 기준 저장소 확정.
4. 클라우드 세션에 필요한 환경 변수(이름은 CLAUDE.md)를 클라우드 환경 설정에 등록할지 결정.
