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

## B~H — 현황과 계획 (미착수)

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
