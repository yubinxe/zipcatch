# ZIPCATCH 4.0 — THE NEXT DIMENSION · 기능 감사와 구현 계획

기준일 2026-10-29. 원칙: 기존 화면·메뉴·데이터 보존, 기능마다 `lib/features.ts` 스위치, 없는 데이터는 만들지 않음.
Phase 0 감사(`docs/ZIPCATCH_AUDIT.md`)의 P0(수집 정지·알림 중복)는 별개로 남아 있다 — 타임머신의 '최신성'도 이 수집에 달려 있다.

## A. TIME MACHINE — 최소 동작판 구현 완료

| 항목 | 내용 |
|---|---|
| 기존 코드 | `/api/notices/map`·`/api/notices/calendar`(둘 다 접수 중만), `HeroAtlas` SVG 시도 경로, `lib/korea-map-data`, `classify.mapProvince` |
| 사용자 경험 | `/map` 아래 독립 조각. 날짜 슬라이더(키보드 ←→·Home/End), 재생/일시정지, 하루 앞뒤, 오늘로. 날짜별 시도 지도 채색·건수, 지역 순위, 그날 시작/마감 공고, 일자별 막대(오늘 표시) |
| 신규 | `lib/features.ts`, `lib/consumer/timeline-core.ts`(순수 함수), `app/api/notices/timeline/route.ts`(읽기 전용), `components/consumer/TimeMachine.tsx`, `app/consumer-timemachine.css`(`.tm` 범위), `tests/timeline.test.mjs` |
| 변경 | `app/(consumer)/map/page.tsx`(조각 1줄 추가), `lib/crm/types.ts`·`lib/consumer/official.ts`(`firstSeenAt` 선택 필드 추가) |
| 데이터 한계 | LH 목록 API는 접수 시작일이 없다(280건 중 200건). 이런 공고는 '집캐치가 처음 저장한 날'부터 마감까지만 '시작일 미기재'로 센다 — 그 전 날짜엔 존재 여부도 모르므로 세지 않는다. 수집 후 일정 변경 이력은 보관하지 않아 '지난 날'도 현재 원문으로 되짚은 상태 — 화면 각주에 명시 |
| 영향 | 위 카카오 지도·목록 무변경. 새 API 1개(읽기). `NEXT_PUBLIC_FEATURE_TIME_MACHINE=0`이면 조각이 빠짐 |
| 검증 | 단위 테스트 4건, tsc·lint·build 통과. Playwright로 1440/390 렌더, 가로 넘침 0, 콘솔 오류 0, 키보드 40회 되감기·재생·트랙 클릭 시 일시정지·오늘로 확인. 로컬엔 DB 키가 없어 운영 DB의 실제 공고 280건 일정으로 응답을 대체해 검수(수집일은 updated_at으로 근사, 검수 전용) |
| 다음 | ① LH `PAN_NT_ST_DT`(공고 게시일)를 별도 컬럼에 저장 → '공고 전/후' 구분 정확화(migration 필요, 승인 대상) ② 위 카카오 지도와 날짜 연동(`NoticeMap`에 선택 날짜 전달) ③ 변경 이력은 Phase 3 '공고 원문 변경 추적'과 함께 |

## 구현 현황 (2026-10-29 · 실행 지시 반영)

| 기능 | 상태 | 커밋 | 무엇이 실제로 동작하나 | 한계 |
|---|---|---|---|---|
| A 타임머신 ↔ 지도 | 완료 | 8c57aeb | 날짜를 옮기면 위 지도의 표시·범위 건수·옆 목록이 그날 기준으로 바뀜(접수 예정은 점선 '예정'), '오늘로' 양방향 | 카카오 지도 위 표시는 로컬에 키가 없어 대체 벡터 지도로 검수(같은 데이터 경로). 변경 이력 미보관 |
| B 탐험 모드 | 완료 | de3fe77 | 입체 지도 전체 화면, 유형·마감·금액 조건→기둥·목록 동기, 지역 선택 시 카메라 줌, 모바일 바텀시트 | 금액 미기재(LH) 공고는 금액 조건에서 빠짐(수 표시) |
| C 비교 담기 | 완료 | 5b97bb6 | 카드·상세 '비교 담기'(3건), 하단 트레이, 비교 화면 전환, 차이 막대 | 화면 전환 애니메이션은 View Transitions 지원 브라우저만 |
| D 세 갈래 주거비 | 완료 | d8fbc1f | 3 시나리오, 기간 누적 그래프 드래그 탐색, 현금/기회비용 분리, 기존 계산식 공유 | 금리는 사용자 가정값 |
| E 빠른 검색 | 완료 | e5d0886 | ⌘K/Ctrl+K, 화면·지역·열린 공고, 키보드 탐색·즉시 이동 | 761–1399px 폭은 머리 단추 없이 단축키만(메뉴 폭 보존) |
| F 내 조건의 지도 | 완료 | 4ddaaa5 | 결과 화면, 지역·상한 '만약에' → 실제 매칭 재계산 → 점 이동 | 금액 미기재 공고가 많아 상한 변화 효과가 작음(데이터 사실) |
| G 업무지구까지 | 부분 | 3621e0d | 상세·비교에서 직선거리(주소 좌표만), 가까운 업무지구 | **경로 시간 미연동** — 운영 ODsay `AUTH_FAILED`(실측). 키 복구 시 자동 표시 |
| H 공유 이미지 | 완료 | eec435b | 비교·주거비·타임머신 → 16:9/4:5/9:16 PNG(1920×1080, 1080×1350, 1080×1920), 출처·기준일·가정값 포함 | — |

검증: 단위 테스트 32, tsc·lint·`next build` 통과. Playwright 18쪽 × 1440/768/390 가로 넘침·확대축소·콘솔 오류 0(로컬 키 부재로 나는 /api/progress 503 · /api/stores 502 제외 — 기존 동작). 탐험 모드 5회 개폐 후 캔버스 0(WebGL 정리 확인).
검수 데이터: 로컬엔 DB 키가 없어 공고 API 를 운영 실데이터(읽기)로 대체, 매칭은 앱 함수를 그대로 돌림. 운영 DB 쓰기·배포 없음.

### 3장 '기존 화면 고도화' 중 미착수
- TradeFlow / StatsView 그래프 구간 탐색·수치 애니메이션 — 미착수
- 공고 카드 기울기 — 의도적으로 안 함: NoticeCard 주석에 '기울기·반사광이 금액 읽기를 흔들어 제거'한 결정이 있어 되돌리지 않음
- HeroAtlas 조명 — 손대지 않음(첫 화면 성능·기존 디자인 보존). 카메라 이동만 탐험 모드에 추가

### 다음 체크포인트
1. ODsay 키 재발급·도메인 등록 → G 경로 시간 자동 활성 확인
2. LH 공고 게시일 컬럼(migration, 승인 필요) → 타임머신 '공고 전' 정확화
3. TradeFlow·StatsView 포인터 추적
4. Phase 0 P0(수집 정지·알림 중복)는 여전히 미해결 — 타임머신 최신성이 여기에 달림

## (초기 계획 — 참고용)

| 기능 | 재사용할 기존 코드 | 새로 할 것 | 데이터·한계 |
|---|---|---|---|
| B. Spatial Explorer | `three/Atlas3D`, `atlas-scene`, `HeroAtlas` 지역 선택, `hotmap/BottomSheet` | 지도 화면의 탐험 모드(지역 클릭→카메라 이동), 유형·마감·가격 필터 연동, 측면 패널/바텀시트 | 가격은 공고 원문에 있는 것만(LH 목록엔 없음). WebGL 정리(`stage.ts` dispose) 점검 필수 |
| C. Housing Battle | `CompareView`, `/compare`, `SaveButton`, `consumer/store` | 카드의 '비교 담기', 하단 트레이, 차이 시각화 | 공급 규모·가격 결측 공고는 '원문 미기재'로 표기 |
| D. Financial Playground | `CostSimulator`(계산식) | 시나리오 3개 동시 비교, 누적비용 그래프, 현금지출/기회비용 분리 | 금리·수익률은 사용자 가정값으로 명시 |
| E. Spotlight | `/api/search`, `ConsumerShell` 메뉴 | ⌘K/Ctrl+K 팔레트, 메뉴·지역·공고 검색 | 검색 API 재사용, 신규 백엔드 없음 |
| F. My Housing Universe | `SearchWizard`, `ResultsView`, `lib/services/matching` | 조건 시각화, 조건 변화→분포 변화 | '조건 일치'와 '자격 판정' 분리 표기 |
| G. Commute Explorer | `TransitRoutes`, `/api/transit` | 업무지구 비교, 지도·상세 연결 | 호출량 제한·지역 기준점 좌표 정확도 표기 |
| H. Share Studio | `notices/[id]/opengraph-image.tsx`(next/og) | 통계·비교·계산 결과 이미지, 16:9·4:5·9:16 | 출처·기준일·가정값 필수 삽입 |

권장 순서: E(작고 전 화면 효용) → C → D → B → F → G → H.
