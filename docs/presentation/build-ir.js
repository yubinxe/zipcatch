/* 집캐치 IR — 컨설팅 규격(액션 타이틀 · 괘선 · 출처 · 페이지) 덱 생성기
 * 실행: node build-ir.js 집캐치_IR.pptx
 * 폰트: DECK_FONT 환경변수로 대체 가능 (기본 Pretendard, 미설치 PC는 "맑은 고딕")
 */
const pptxgen = require('pptxgenjs')
const fs = require('fs')
const path = require('path')

const FONT = process.env.DECK_FONT || 'Pretendard'
const MONO = 'Consolas'
const p = new pptxgen()
p.layout = 'LAYOUT_WIDE'
p.author = 'ZipCatch'
p.title = '집캐치 IR'

/* ── 색 체계 : 무채 3단 + 단일 강조색 ─────────────────────────── */
const PAPER = 'FFFFFF'
const DEEP  = '0B1F2A'   // 표지 · 강조면
const INK   = '111A22'   // 제목
const BODY  = '3C4650'   // 본문
const SUB   = '7C8791'   // 보조 · 출처
const RULE  = 'D3D9DE'   // 괘선
const HAIR  = 'EEF1F3'   // 면 분할
const ACC   = 'A83A20'   // 강조 1색 (제품 주묵)
const ONW   = 'FFFFFF'

const W = 13.3, H = 7.5, M = 0.78, CW = W - M * 2
const Y_EYE = 0.44, Y_TTL = 0.74, Y_DECK = 1.66, Y_HAIR = 2.16
const Y_TOP = 2.42, Y_BOT = 6.28
const Y_TAKE = 6.40, Y_FOOT = 7.02

let page = 0

/* ── 기본 요소 ───────────────────────────────────────────────── */
const T = (s, t, o) => s.addText(t, Object.assign({ fontFace: FONT, isTextBox: true, margin: 0 }, o))
const line = (s, x, y, w, c, t) => s.addShape(p.ShapeType.line, { x, y, w, h: 0, line: { color: c || RULE, width: t || 0.75 } })
const rect = (s, x, y, w, h, fill, border) =>
  s.addShape(p.ShapeType.rect, { x, y, w, h, fill: { color: fill || PAPER }, line: border === null ? { color: fill || PAPER, width: 0 } : { color: border || RULE, width: 0.75 } })

function slide (dark) {
  const s = p.addSlide()
  s.background = { color: dark ? DEEP : PAPER }
  return s
}

/** 눈썹 라벨 + 액션 타이틀 + 부제 + 괘선 */
function head (s, eyebrow, title, deck) {
  T(s, eyebrow, { x: M, y: Y_EYE, w: 8, h: 0.26, fontSize: 9.5, bold: true, color: ACC, charSpacing: 2.6 })
  T(s, title, { x: M, y: Y_TTL, w: CW, h: 0.86, fontSize: 27, bold: true, color: INK, charSpacing: -0.4, lineSpacingMultiple: 1.16 })
  if (deck) T(s, deck, { x: M, y: Y_DECK, w: CW, h: 0.4, fontSize: 13.5, color: BODY })
  line(s, M, Y_HAIR, CW, RULE, 1)
}

/** 하단 결론 한 줄 (컨설팅 덱의 So-what) */
function take (s, text) {
  line(s, M, Y_TAKE, CW, RULE, 1)
  s.addShape(p.ShapeType.rect, { x: M, y: Y_TAKE + 0.16, w: 0.09, h: 0.24, fill: { color: ACC }, line: { width: 0 } })
  T(s, text, { x: M + 0.24, y: Y_TAKE + 0.1, w: CW - 0.3, h: 0.38, fontSize: 14, bold: true, color: INK, valign: 'middle' })
}

/** 출처 + 페이지 */
function foot (s, source) {
  page += 1
  T(s, source || '', { x: M, y: Y_FOOT, w: CW - 1.2, h: 0.28, fontSize: 8.5, color: SUB })
  T(s, String(page), { x: W - M - 1, y: Y_FOOT, w: 1, h: 0.28, fontSize: 9.5, color: SUB, align: 'right' })
}

/* ── 이미지 ──────────────────────────────────────────────────── */
const ASSET_DIR = path.join(__dirname, 'assets')
const ASSETS = fs.existsSync(ASSET_DIR) ? fs.readdirSync(ASSET_DIR) : []
function findAsset (key) {
  const f = ASSETS.find(n => n.toLowerCase().startsWith(key) && /\.(jpe?g|png|webp)$/i.test(n))
  return f ? path.join(ASSET_DIR, f) : null
}
/** 있으면 cover 크롭 삽입, 없으면 자리틀 */
function photo (s, key, x, y, w, h) {
  const f = findAsset(key)
  if (f) {
    s.addImage({ path: f, x, y, w, h, sizing: { type: 'cover', w, h } })
    s.addShape(p.ShapeType.rect, { x, y, w, h, fill: { type: 'none' }, line: { color: RULE, width: 0.75 } })
  } else {
    rect(s, x, y, w, h, 'F7F9FA')
    T(s, 'assets/' + key + '*.jpg', { x, y, w, h, fontSize: 10, color: SUB, align: 'center', valign: 'middle', fontFace: MONO })
  }
}
/** 미공개 패널 — 레이아웃 고정용 빈 틀 */
function ghost (s, x, y, w, h) {
  s.addShape(p.ShapeType.rect, { x, y, w, h, fill: { color: PAPER }, line: { color: HAIR, width: 0.75 } })
}

/* 3분할 그리드 */
const G = 0.34
const PW = (CW - G * 2) / 3
const px = i => M + i * (PW + G)

/* ══════════════════════════════════════════════════════════════
   OPENING — 후킹 3단 빌드
   ══════════════════════════════════════════════════════════════ */
const HOOK = [
  ['hook-01', '아이브 안유진', '가수 · 1990년대생 자산가'],
  ['hook-02', '올림픽파크 포레온', '서울 강동 · 12,032세대'],
  ['hook-03', '이재명 정부 주택정책', '공공임대 중심 공급 기조']
]

for (let step = 1; step <= 3; step++) {
  const s = slide()
  head(s, 'OPENING', '이 세 가지의 공통점은 무엇입니까',
    step < 3 ? null : '서로 다른 영역의 세 장면이 하나의 제도로 연결됩니다')
  HOOK.forEach(([key, cap, sub], i) => {
    const x = px(i)
    if (i < step) {
      photo(s, key, x, Y_TOP, PW, 2.72)
      T(s, cap, { x, y: Y_TOP + 2.88, w: PW, h: 0.34, fontSize: 16, bold: true, color: INK })
      T(s, sub, { x, y: Y_TOP + 3.24, w: PW, h: 0.3, fontSize: 11.5, color: SUB })
    } else {
      ghost(s, x, Y_TOP, PW, 2.72)
    }
  })
  if (step === 3) take(s, '잠시 생각해 보시기 바랍니다')
  foot(s, '이미지 출처 : 각 사 공개 자료 및 언론 보도')
  s.addNotes(step === 1
    ? '아무 설명 없이 사진 한 장만 띄운다. 3초 정지.'
    : step === 2
      ? '두 번째 사진. 여전히 설명하지 않는다.'
      : '"이 세 가지를 보고 무엇이 떠오르시나요?" 객석 답변을 2~3개 받는다. 틀린 답도 받아준다.')
}

/* ANSWER — 정답 공개 */
{
  const s = slide(true)
  T(s, 'ANSWER', { x: M, y: 2.5, w: 8, h: 0.3, fontSize: 9.5, bold: true, color: ACC, charSpacing: 2.6 })
  s.addShape(p.ShapeType.rect, { x: M, y: 2.96, w: 1.6, h: 0.05, fill: { color: ACC }, line: { width: 0 } })
  T(s, '청약', { x: M, y: 3.18, w: 9, h: 1.5, fontSize: 96, bold: true, color: ONW, charSpacing: -3 })
  T(s, '세 장면 모두 청약 제도가 만들어낸 결과입니다', { x: M, y: 4.86, w: 10.5, h: 0.5, fontSize: 21, color: 'C3CCD4' })
  foot(s, '')
  s.addNotes('답을 말할 때는 화면을 보지 않는다. "정답은, 청약입니다."')
}

/* ══════════════════════════════════════════════════════════════
   WHY — 왜 청약인가 3단 빌드
   ══════════════════════════════════════════════════════════════ */
const WHY = [
  ['01', '제도', '추첨제 할당은 규칙으로 고정',
    '투기과열지구 전용 85㎡ 이하 일반공급은\n가점제 40% · 추첨제 60%로 배정됩니다.\n가점이 낮아도 현금 여력으로 당첨 가능합니다.'],
  ['02', '시장', '하락장에서는 경쟁률이 붕괴',
    '올림픽파크 포레온은 2022년 고금리 국면에서\n계약 포기가 이어져 무순위 청약이 발생했고,\n당시 최저 당첨가점은 26점이었습니다.'],
  ['03', '정책', '공공임대 확대는 청약 수요를 키움',
    '임대주택 역시 청약 절차로만 공급됩니다.\n공공임대 중심 공급 기조는 곧 청약 대상\n인구의 확대를 의미합니다.']
]

for (let step = 1; step <= 3; step++) {
  const s = slide()
  head(s, 'WHY IT MATTERS', '청약의 당락은 가점이 아니라 제도 · 시장 · 정책의 함수',
    '세 변수는 상시 변동하며, 변동 시점에 준비된 지원자만 기회를 확보합니다')
  WHY.forEach(([no, tag, headline, bodytext], i) => {
    const x = px(i)
    if (i >= step) { ghost(s, x, Y_TOP, PW, 3.86); return }
    if (i < 2) {
      photo(s, 'hook-0' + (i + 4), x, Y_TOP, PW, 1.86)
    } else {
      photo(s, 'hook-03', x, Y_TOP, (PW - 0.1) / 2, 1.86)
      photo(s, 'hook-06', x + (PW + 0.1) / 2, Y_TOP, (PW - 0.1) / 2, 1.86)
    }
    T(s, no, { x, y: Y_TOP + 2.00, w: 0.5, h: 0.28, fontSize: 11, bold: true, color: ACC, charSpacing: 1 })
    T(s, tag, { x: x + 0.46, y: Y_TOP + 2.00, w: 2, h: 0.28, fontSize: 11, bold: true, color: SUB, charSpacing: 1 })
    line(s, x, Y_TOP + 2.34, PW, RULE, 1)
    T(s, headline, { x, y: Y_TOP + 2.44, w: PW, h: 0.42, fontSize: 16.5, bold: true, color: INK })
    T(s, bodytext, { x, y: Y_TOP + 2.94, w: PW, h: 0.95, fontSize: 11.5, color: BODY, lineSpacingMultiple: 1.32 })
  })
  if (step === 3) take(s, '기회는 시장을 예측한 사람이 아니라, 상시 대비해 둔 사람에게 귀속됩니다')
  foot(s, '자료 : 「주택공급에 관한 규칙」 제28조, 청약홈 공고, Richgo, 언론 보도')
  s.addNotes(step === 1
    ? '"투기과열지구 분양 물건은 추첨제 할당이 정해져 있습니다. 가점이 낮아도 현금만 있으면 로또 청약에 당첨될 수 있다는 뜻입니다."'
    : step === 2
      ? '"둔촌주공으로 알려진 올파포입니다. 2022년 우크라이나 전쟁과 고금리로 하락장이 시작되자 당첨되고도 포기하는 사례가 속출했고, 결국 줍줍 사태까지 벌어졌습니다."'
      : '"마지막은 공공임대 정책입니다. 임대주택도 결국 청약으로 공급됩니다. 그래서 지금 더 많은 사람이 청약에 관심을 갖고 있습니다."')
}

/* ══════════════════════════════════════════════════════════════
   FRICTION — 「그런데 청약은 너무 복잡합니다」 3단
   ══════════════════════════════════════════════════════════════ */

/* (1) 문제 제기 */
{
  const s = slide(true)
  T(s, 'BUT', { x: M, y: 2.6, w: 8, h: 0.3, fontSize: 9.5, bold: true, color: ACC, charSpacing: 2.6 })
  s.addShape(p.ShapeType.rect, { x: M, y: 3.06, w: 1.6, h: 0.05, fill: { color: ACC }, line: { width: 0 } })
  T(s, '그런데 청약은,\n너무 복잡합니다', { x: M, y: 3.3, w: 11, h: 2.0, fontSize: 52, bold: true, color: ONW, charSpacing: -1.6, lineSpacingMultiple: 1.24 })
  foot(s, '')
  s.addNotes('여기서 톤을 낮춘다. "그런데 문제가 있습니다." 한 박자 쉬고 다음 장.')
}

/* (2) 공감 — 실제 절차의 복잡도 */
{
  const s = slide()
  head(s, 'FRICTION', '공고 확인 · 조건 대조 · 가점 산정 — 어느 하나도 자동화되어 있지 않음',
    '지원 한 건을 넣기 위해 개인이 직접 처리해야 하는 작업입니다')
  const f = [
    ['공고를 살피고', '2', '개 출처', '청약홈(분양)과 LH청약플러스(임대)가\n분리되어 있고, 공급유형은\n특별공급 7종 · 공공임대 6종으로 나뉩니다'],
    ['조건을 맞추고', '6', '개 축', '무주택 여부 · 세대구성 · 소득 · 자산 ·\n거주기간 · 청약통장 — 기준이 공고마다\n다르고, 공고문 안에만 적혀 있습니다'],
    ['가점을 계산하고', '84', '점 만점', '무주택기간 32점 + 부양가족수 35점 +\n가입기간 17점. 가입월수와 무주택기간을\n직접 세어 본인이 산정해야 합니다']
  ]
  f.forEach(([label, num, unit, desc], i) => {
    const x = px(i)
    T(s, label, { x, y: Y_TOP, w: PW, h: 0.36, fontSize: 13, bold: true, color: SUB, charSpacing: 0.6 })
    line(s, x, Y_TOP + 0.42, PW, INK, 1.5)
    T(s, num, { x, y: Y_TOP + 0.56, w: 2.2, h: 1.0, fontSize: 60, bold: true, color: ACC, charSpacing: -2 })
    T(s, unit, { x: x + (num.length > 1 ? 1.72 : 0.96), y: Y_TOP + 1.16, w: 2, h: 0.36, fontSize: 15, bold: true, color: INK })
    T(s, desc, { x, y: Y_TOP + 1.76, w: PW, h: 1.3, fontSize: 12.5, color: BODY, lineSpacingMultiple: 1.42 })
  })
  rect(s, M, 5.6, CW, 0.66, DEEP, DEEP)
  T(s, '그리고 하나라도 틀리면 — 부적격 당첨 시 지역에 따라 6개월~1년간 청약이 제한됩니다',
    { x: M + 0.5, y: 5.6, w: CW - 1, h: 0.66, fontSize: 14.5, bold: true, color: ONW, valign: 'middle' })
  take(s, '떨어지는 이유의 상당수는 조건이 아니라 절차입니다')
  foot(s, '자료 : 「주택공급에 관한 규칙」 제23조 · 제28조 · 제58조, 청약홈 가점 산정 기준')
  s.addNotes('세 개를 손으로 하나씩 짚으며 말한다. "공고를 살피고, 조건을 맞추고, 가점 계산까지." 마지막 검은 띠에서 한 박자 쉰다.')
}

/* (3) 전환 */
{
  const s = slide(true)
  T(s, 'SO WE BUILT IT', { x: M, y: 2.6, w: 8, h: 0.3, fontSize: 9.5, bold: true, color: ACC, charSpacing: 2.6 })
  s.addShape(p.ShapeType.rect, { x: M, y: 3.06, w: 1.6, h: 0.05, fill: { color: ACC }, line: { width: 0 } })
  T(s, '그래서 저희는,\n만들었습니다', { x: M, y: 3.3, w: 11, h: 2.0, fontSize: 52, bold: true, color: ONW, charSpacing: -1.6, lineSpacingMultiple: 1.24 })
  foot(s, '')
  s.addNotes('"그래서 저희는 만들었습니다." 말하고 바로 다음 장으로 넘긴다. 여기서 멈추지 않는다.')
}

/* 전환 — 표지 */
{
  const s = slide()
  T(s, 'THE SERVICE', { x: M, y: 2.1, w: 8, h: 0.3, fontSize: 9.5, bold: true, color: ACC, charSpacing: 2.6 })
  s.addShape(p.ShapeType.rect, { x: M, y: 2.58, w: 1.6, h: 0.05, fill: { color: ACC }, line: { width: 0 } })
  T(s, '집캐치', { x: M, y: 2.8, w: 9, h: 1.4, fontSize: 84, bold: true, color: INK, charSpacing: -2.6 })
  T(s, '청약 · 공공임대 통합 탐색 서비스', { x: M, y: 4.42, w: 10.5, h: 0.5, fontSize: 21, color: BODY })
  T(s, '상시 대비를 개인의 성실성이 아닌 서비스의 기능으로 전환합니다', { x: M, y: 4.98, w: 10.5, h: 0.42, fontSize: 15, color: SUB })
  line(s, M, 5.86, CW, RULE, 1)
  T(s, '청약홈 · LH청약플러스 공공데이터 기반   |   IR 요약자료', { x: M, y: 6.04, w: 10, h: 0.38, fontSize: 12, color: SUB })
  foot(s, '')
  s.addNotes('"그 상시 대비를 대신하는 서비스가 집캐치입니다."')
}

/* ══════════════════════════════════════════════════════════════
   본론
   ══════════════════════════════════════════════════════════════ */

/* 문제 */
{
  const s = slide()
  head(s, 'PROBLEM', '문제는 정보의 부족이 아니라 선별 기준의 부재',
    '공고는 전량 공개되어 있으나, 개인 조건 기준의 선별 수단이 존재하지 않습니다')
  const items = [
    ['출처 분산', '분양은 청약홈, 임대는 LH청약플러스로 이원화되어 단일 조회 수단이 부재합니다'],
    ['선별 기능 부재', '지역 · 예산 · 면적 · 가구형태를 기준으로 후보를 좁히는 기능이 제공되지 않습니다'],
    ['일정 관리 공백', '접수 · 서류 · 발표 · 계약 일정이 공고문 내부에만 존재해 개인이 직접 관리해야 합니다']
  ]
  items.forEach(([h, b], i) => {
    const x = px(i)
    T(s, String(i + 1).padStart(2, '0'), { x, y: Y_TOP, w: 1, h: 0.32, fontSize: 11, bold: true, color: ACC, charSpacing: 1 })
    line(s, x, Y_TOP + 0.38, PW, INK, 1.5)
    T(s, h, { x, y: Y_TOP + 0.56, w: PW, h: 0.44, fontSize: 19, bold: true, color: INK })
    T(s, b, { x, y: Y_TOP + 1.04, w: PW, h: 1.5, fontSize: 12.5, color: BODY, lineSpacingMultiple: 1.42 })
  })
  rect(s, M, 4.94, CW, 1.12, 'F5F7F8', null)
  T(s, '동일한 공고 데이터를 두고도, 「내가 지금 넣을 수 있는 것」을 판별하는 계층만 비어 있습니다',
    { x: M + 0.5, y: 4.94, w: CW - 1, h: 1.12, fontSize: 17, bold: true, color: INK, valign: 'middle' })
  take(s, '해결 대상은 정보 접근성이 아니라 판단 지원입니다')
  foot(s, '자료 : 청약홈 · LH청약플러스 공고 체계 분석')
}

/* 솔루션 */
{
  const s = slide()
  head(s, 'SOLUTION', '조건 입력 1회로 지원 가능 후보를 선별',
    '동일한 공고 데이터에서 검증 가능한 판단 근거를 생성합니다')
  rect(s, M, Y_TOP, 5.5, 2.86)
  T(s, '공고 원문', { x: M + 0.42, y: Y_TOP + 0.3, w: 3, h: 0.3, fontSize: 10.5, bold: true, color: SUB, charSpacing: 1.4 })
  T(s, '모집공고   제12차\n공급유형   국민임대\n전용면적   —\n보증금     —\n접수       2026.09.18~09.20',
    { x: M + 0.42, y: Y_TOP + 0.78, w: 4.7, h: 1.7, fontSize: 12.5, color: BODY, fontFace: MONO, lineSpacingMultiple: 1.42 })
  s.addShape(p.ShapeType.rightArrow, { x: 6.48, y: Y_TOP + 1.22, w: 0.42, h: 0.36, fill: { color: ACC }, line: { width: 0 } })
  rect(s, 7.1, Y_TOP, 5.42, 2.86, DEEP, DEEP)
  T(s, '내 후보', { x: 7.52, y: Y_TOP + 0.3, w: 3, h: 0.3, fontSize: 10.5, bold: true, color: ACC, charSpacing: 1.4 })
  T(s, '조건 충족 · 예산 이내', { x: 7.52, y: Y_TOP + 0.74, w: 4.6, h: 0.5, fontSize: 24, bold: true, color: ONW })
  T(s, '전용 29㎡        희망 최소 28㎡ 대비 +1㎡\n보증금 3,200만원  상한 8,000만원 이내\n접수 마감        D-3',
    { x: 7.52, y: Y_TOP + 1.38, w: 4.6, h: 1.3, fontSize: 12.5, color: 'C3CCD4', lineSpacingMultiple: 1.42 })
  T(s, '판단 근거를 점수 구간이 아닌 실측값 차이로 제시합니다 — 「+1㎡」 「4,800만원 초과」',
    { x: M, y: 5.62, w: CW, h: 0.5, fontSize: 16, bold: true, color: INK })
  take(s, '사용자가 검산할 수 있는 근거만 화면에 남깁니다')
  foot(s, '자료 : 집캐치 매칭 엔진 lib/services/matching.ts')
}

/* 사용자 여정 */
{
  const s = slide()
  head(s, 'USER JOURNEY', '방문부터 재방문까지 6단계 단일 흐름',
    '이탈 지점마다 별도 화면이 아닌 하나의 연속 동선으로 설계했습니다')
  const steps = [
    ['방문', '/', '공고 열람 전 서비스 가치 인지'],
    ['조건 입력', '/analyze', '지역 → 주거비 → 가구 · 선호 3단계'],
    ['후보 확인', '/results', '조건 충족 · 예산 초과 분리 제시'],
    ['관심 · 알림', '/saved', '관심공고 저장 및 알림 수신 설정'],
    ['가입', '/login', '이메일 기반 계정 생성'],
    ['재방문', '알림', '신규 공고 · 마감 임박 알림으로 재유입']
  ]
  steps.forEach(([t, route, d], i) => {
    const col = i < 3 ? 0 : 1, row = i < 3 ? i : i - 3
    const x = M + col * 6.1, y = Y_TOP + row * 1.2
    T(s, String(i + 1).padStart(2, '0'), { x, y: y + 0.06, w: 0.55, h: 0.34, fontSize: 12, bold: true, color: ACC })
    T(s, t, { x: x + 0.62, y, w: 1.9, h: 0.42, fontSize: 17.5, bold: true, color: INK })
    T(s, route, { x: x + 2.6, y: y + 0.06, w: 2.4, h: 0.32, fontSize: 11, color: SUB, fontFace: MONO })
    T(s, d, { x: x + 0.62, y: y + 0.5, w: 4.9, h: 0.4, fontSize: 12.5, color: BODY })
    line(s, x, y + 1.0, 5.6, HAIR, 1)
  })
  take(s, 'CRM은 내부 운영 자산이며 소비자 판매 상품이 아닙니다')
  foot(s, '자료 : 집캐치 소비자 화면 구성')
}

/* 신뢰성 */
{
  const s = slide()
  head(s, 'DATA INTEGRITY', '부동산 서비스의 신뢰 훼손 요인을 사전 차단',
    '정확도보다 「틀린 것을 말하지 않는 것」을 우선 원칙으로 삼았습니다')
  const no = [
    ['당첨 확률 미산출', '공개 데이터만으로는 개인별 확률 산출 근거가 부재합니다. 과거 당첨가점 비교만 제공하며, 표본 부재 시 「자료 부족」으로 표기합니다'],
    ['결측값 미보완', '청약홈 분양정보의 전용면적 · 보증금 · 월임대료는 null을 유지한 뒤 「미공개」로 표기합니다'],
    ['일정 구분 표기', '공고 원문 기한은 OFFICIAL, 역산한 준비일은 RECOMMENDED로 구분해 표기합니다'],
    ['수집 실패 미은폐', '수집 실패 시 sources[]에 원문 그대로 반영하며, 합성 데이터로 대체하지 않습니다']
  ]
  no.forEach(([t, d], i) => {
    const col = i % 2, row = Math.floor(i / 2)
    const x = M + col * 6.1, y = Y_TOP + row * 1.92
    line(s, x, y, 5.6, INK, 1.5)
    T(s, t, { x, y: y + 0.16, w: 5.6, h: 0.44, fontSize: 18, bold: true, color: INK })
    T(s, d, { x, y: y + 0.72, w: 5.5, h: 1.0, fontSize: 12.5, color: BODY, lineSpacingMultiple: 1.4 })
  })
  take(s, '과장하지 않는 것이 이 영역에서 가장 빠른 신뢰 축적 경로입니다')
  foot(s, '자료 : 집캐치 데이터 수집 · 표기 규정')
}

/* 데이터 소스 */
{
  const s = slide()
  head(s, 'DATA SOURCE', '분양 · 임대로 이원화된 출처를 단일 서비스로 통합',
    '수집 경로와 데이터 성격을 공고 단위로 명시합니다')
  const src = [
    ['청약홈', '분양 모집공고', '공공데이터포털', INK],
    ['LH 청약플러스', '국민임대 · 행복주택 · 매입임대 · 통합공공임대', '공공데이터포털', INK],
    ['CSV', '운영자 직접 등록 공고', '내부 업로드', BODY],
    ['예시', '화면 구성용 합성 데이터', 'dataOrigin: SYNTHETIC', SUB]
  ]
  line(s, M, Y_TOP, CW, INK, 1.5)
  src.forEach(([t, d, o, c], i) => {
    const y = Y_TOP + 0.16 + i * 0.86
    T(s, t, { x: M, y, w: 2.6, h: 0.62, fontSize: 16.5, bold: true, color: c, valign: 'middle' })
    T(s, d, { x: M + 2.8, y, w: 6.4, h: 0.62, fontSize: 13, color: BODY, valign: 'middle' })
    T(s, o, { x: M + 9.3, y, w: 2.44, h: 0.62, fontSize: 11.5, color: SUB, align: 'right', valign: 'middle', fontFace: MONO })
    line(s, M, y + 0.7, CW, HAIR, 1)
  })
  rect(s, M, 5.86, CW, 0.7, 'F5F7F8', null)
  T(s, '수집 공고는 「공식 공고」, 합성 데이터는 「예시 공고」로 화면에서 구분 표기합니다',
    { x: M + 0.5, y: 5.86, w: CW - 1, h: 0.7, fontSize: 13.5, bold: true, color: INK, valign: 'middle' })
  take(s, '출처와 성격이 구분되지 않은 데이터는 화면에 올리지 않습니다')
  foot(s, '자료 : 공공데이터포털 API 연동 현황')
}

/* 운영 자동화 */
{
  const s = slide()
  head(s, 'OPERATIONS', '일 단위 CRM 운영을 Claude Routines 12종으로 자동화',
    '운영 인력 증원 없이 고객 응대 · 발송 · 점검 주기를 고정했습니다')
  const r = [
    ['07:00', '자동화 상태 점검'], ['07:30', 'CRM 데이터 품질 점검'], ['08:00', '마감 임박 고객 알림 · 메일'],
    ['08:30', '일일 CRM 운영 브리핑'], ['09:05', '신규 추천 공고 알림 · 메일'], ['09:30', '오늘 연락할 고객'],
    ['10:00', '고의도 고객 감지'], ['10:30', '신청 진행 고객 점검'], ['18:00', '고객 전환 퍼널 점검'],
    ['매시', '공고 변경 감시'], ['매시', '발송 실패 재처리'], ['월요일', '주간 CRM KPI 리포트']
  ]
  line(s, M, Y_TOP, 5.6, INK, 1.5)
  line(s, M + 6.1, Y_TOP, 5.6, INK, 1.5)
  r.forEach(([t, n], i) => {
    const col = i < 6 ? 0 : 1, row = i < 6 ? i : i - 6
    const x = M + col * 6.1, y = Y_TOP + 0.14 + row * 0.56
    T(s, t, { x, y, w: 1.1, h: 0.44, fontSize: 12, bold: true, color: ACC, valign: 'middle', fontFace: MONO })
    T(s, n, { x: x + 1.2, y, w: 4.4, h: 0.44, fontSize: 13.5, color: INK, valign: 'middle' })
    line(s, x, y + 0.47, 5.6, HAIR, 1)
  })
  T(s, 'Supabase 실데이터 조회 · Gmail 발송 · 실행 이력 자동 적재',
    { x: M, y: 5.92, w: CW, h: 0.4, fontSize: 14, bold: true, color: BODY })
  take(s, '운영 비용이 고객 수에 비례해 증가하지 않는 구조입니다')
  foot(s, '자료 : Claude Routines 등록 현황 (Asia/Seoul 기준)')
}

/* 수익 모델 */
{
  const s = slide()
  head(s, 'BUSINESS MODEL', '무료 확장 → 구독 전환 → B2B 데이터의 3단계 수익화',
    '3단계가 실질 매출 축에 해당하며, 1 · 2단계는 데이터 축적 단계입니다')
  const st = [
    ['STEP 1', '무료 확장', '전 기능 무료 제공\n조건 · 관심공고 데이터 확보', '월간 활성 사용자', 2.9],
    ['STEP 2', '구독 전환', '마감 알림 · 정밀 후보 리포트\n자격 자가진단 유료화', '유료 전환율', 3.25],
    ['STEP 3', 'B2B 데이터', '시행사 · 분양대행사 대상\n수요 · 조건 분포 분석 제공', '계약 단지 수', 3.6]
  ]
  st.forEach(([tag, h, b, kpi, ht], i) => {
    const x = px(i), y = 6.12 - ht
    const dark = i === 2
    rect(s, x, y, PW, ht, dark ? DEEP : PAPER, dark ? DEEP : RULE)
    T(s, tag, { x: x + 0.34, y: y + 0.3, w: 3, h: 0.3, fontSize: 10.5, bold: true, color: ACC, charSpacing: 1.6 })
    T(s, h, { x: x + 0.34, y: y + 0.68, w: 3, h: 0.5, fontSize: 21, bold: true, color: dark ? ONW : INK })
    T(s, b, { x: x + 0.34, y: y + 1.3, w: PW - 0.68, h: 0.86, fontSize: 12.5, color: dark ? 'C3CCD4' : BODY, lineSpacingMultiple: 1.4 })
    line(s, x + 0.34, y + 2.26, PW - 0.68, dark ? '35464F' : RULE, 1)
    T(s, '핵심 지표   ' + kpi, { x: x + 0.34, y: y + 2.36, w: 3, h: 0.34, fontSize: 11.5, bold: true, color: dark ? ONW : INK })
  })
  take(s, '축적된 조건 · 관심공고 데이터는 경쟁사가 복제할 수 없는 자산입니다')
  foot(s, '자료 : 집캐치 사업계획')
}

/* 클로징 */
{
  const s = slide(true)
  s.addShape(p.ShapeType.rect, { x: 5.9, y: 2.5, w: 1.5, h: 0.05, fill: { color: ACC }, line: { width: 0 } })
  T(s, '공고는 이미 공개되어 있습니다', { x: 1.3, y: 2.86, w: 10.7, h: 0.5, fontSize: 18, color: '93A0A9', align: 'center' })
  T(s, '부재한 것은 정보가 아니라\n선별의 기준입니다', { x: 1.3, y: 3.46, w: 10.7, h: 1.9, fontSize: 42, bold: true, color: ONW, align: 'center', lineSpacingMultiple: 1.28 })
  T(s, '집캐치는 그 기준을 제공합니다', { x: 1.3, y: 5.5, w: 10.7, h: 0.5, fontSize: 19, bold: true, color: ACC, align: 'center' })
  T(s, '집캐치  ·  ZipCatch', { x: 1.3, y: 6.5, w: 10.7, h: 0.38, fontSize: 12, color: '6E7B85', align: 'center', charSpacing: 2.2 })
  s.addNotes('마지막 문장은 슬라이드를 보지 않고 외워서 말한다.')
}

p.writeFile({ fileName: process.argv[2] || '집캐치_IR.pptx' }).then(f => console.log('OK', f))
