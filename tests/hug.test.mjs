/**
 * HUG 분양아파트 공정률 응답 읽기 — 공식 가이드(23_openapi_download.docx)의 응답 예제와
 * 키 없이 부를 때 실제로 돌아오는 오류 응답으로 확인한다.  실행: npm test
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseHug, hugToProgressRows } from '../lib/adapters/hug.ts'

const SAMPLE = `<response><header><resultCode>00</resultCode><resultMsg>NORMAL SERVICE.</resultMsg></header>
<body><items>
<item><BUNO>016476</BUNO><AREA_DCD>02</AREA_DCD><BSU_NM>만덕주공아파트 주택재건축정비사업</BSU_NM><TPOW_RT>100.00</TPOW_RT><CUST_NM1>동문건설(주)</CUST_NM1><CUST_NM2>동문건설(주)</CUST_NM2><ADDR>부산 북구 만덕동 834번지 일원</ADDR></item>
<item><BUNO>017019</BUNO><AREA_DCD>02</AREA_DCD><BSU_NM>부산명륜2구역 주택재개발정비사업(명륜2차아이파크)</BSU_NM><TPOW_RT>100.00</TPOW_RT><CUST_NM1>a</CUST_NM1><CUST_NM2>b</CUST_NM2><ADDR>부산 동래구 명륜동 100번지 일원</ADDR></item>
</items></body></response>`

test('정상 응답(XML) — 사업장 필드를 그대로 읽는다', () => {
  const r = parseHug(SAMPLE)
  assert.equal(r.kind, 'ok')
  assert.equal(r.items.length, 2)
  assert.deepEqual(r.items[0], {
    BUNO: '016476', AREA_DCD: '02', BSU_NM: '만덕주공아파트 주택재건축정비사업', TPOW_RT: '100.00',
    CUST_NM1: '동문건설(주)', CUST_NM2: '동문건설(주)', ADDR: '부산 북구 만덕동 834번지 일원',
  })
})

test('키 오류(JSON 배열) — 인증 실패로 가른다', () => {
  assert.deepEqual(parseHug('[{"ERROR_CODE":"31","ERROR_MSG":"EXPIRED API_KEY."}]'), { kind: 'auth', msg: 'EXPIRED API_KEY.' })
})

test('빈 목록 — 오류가 아니라 자료 없음', () => {
  const r = parseHug('<response><header><resultCode>00</resultCode></header><body><items></items></body></response>')
  assert.equal(r.kind, 'ok')
  assert.equal(r.items.length, 0)
})

test('엉뚱한 응답 — 오류', () => {
  assert.equal(parseHug('<html>점검 중</html>').kind, 'err')
})

test('readProgress 머리글로 옮긴다', () => {
  const rows = hugToProgressRows(parseHug(SAMPLE).items)
  assert.equal(rows[0]['사업장명'], '만덕주공아파트 주택재건축정비사업')
  assert.equal(rows[0]['공정률'], '100.00')
  assert.equal(rows[0]['주소'], '부산 북구 만덕동 834번지 일원')
})
