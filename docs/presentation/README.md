# 집캐치 발표 자료

| 파일 | 내용 |
|---|---|
| `집캐치_IR.pptx` | IR 덱 19면 (16:9) |
| `build-ir.js` | 덱 생성 스크립트 |
| `집캐치_발표시나리오.md` | 면별 대사 · 동선 · Q&A |
| `assets/` | 오프닝 사진 6장 (assets/README.md 참조) |

## 재생성

```bash
cd docs/presentation
npm i pptxgenjs
node build-ir.js 집캐치_IR.pptx

# Pretendard 미설치 PC
DECK_FONT="맑은 고딕" node build-ir.js 집캐치_IR.pptx
```

## 구성

| 면 | 구간 | 내용 |
|---|---|---|
| 1~3 | OPENING | 「이 세 가지의 공통점은 무엇입니까」 — 사진 3장 순차 노출 |
| 4 | ANSWER | 청약 |
| 5~7 | WHY IT MATTERS | 제도(추첨제) · 시장(하락장) · 정책(공공임대) 순차 노출 |
| 8 | BUT | 그런데 청약은, 너무 복잡합니다 |
| 9 | FRICTION | 2개 출처 · 6개 축 · 84점 만점 — 공감 슬라이드 |
| 10 | SO WE BUILT IT | 그래서 저희는, 만들었습니다 |
| 11 | THE SERVICE | 집캐치 표지 |
| 12 | PROBLEM | 선별 기준의 부재 |
| 13 | SOLUTION | 조건 입력 1회 → 지원 가능 후보 |
| 14 | USER JOURNEY | 6단계 단일 흐름 |
| 15 | DATA INTEGRITY | 신뢰 훼손 요인 사전 차단 |
| 16 | DATA SOURCE | 분양 · 임대 통합 수집 |
| 17 | OPERATIONS | Claude Routines 12종 |
| 18 | BUSINESS MODEL | 3단계 수익화 |
| 19 | CLOSING | — |

## 디자인 규격

컨설팅 덱 규격 — 액션 타이틀 · 괘선 · 하단 결론 한 줄 · 출처 · 페이지 번호.

| 요소 | 값 |
|---|---|
| 배경 | `#FFFFFF` / 강조면 `#0B1F2A` |
| 제목 | `#111A22` · 27pt Bold · 자간 -0.4 |
| 본문 | `#3C4650` · 12.5pt · 행간 1.42 |
| 보조 · 출처 | `#7C8791` · 8.5~11.5pt |
| 괘선 | `#D3D9DE` / 면 분할 `#EEF1F3` |
| 강조 (단일) | `#A83A20` |
| 여백 | 좌우 0.78in · 제목 괘선 y=2.16 · 본문 2.42~6.28 |

강조색은 눈썹 라벨 · 숫자 · 결론 마커에만 사용한다. 그라디언트 · 그림자 · 라운드 코너는 쓰지 않는다.
