/**
 * 뜨거운 키워드 — 사전·중복 제거·순위가 같은 입력에 같은 결과를 내는가.  실행: npm test
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  extractHotKeywords,
  dedupe,
  normalizeTitle,
  termsIn,
  matchesKeyword,
} from '../lib/consumer/news-keywords.ts'

const NOW = Date.parse('2026-11-09T00:00:00Z')
const at = (h) => new Date(NOW - h * 3600_000).toISOString()
const art = (title, source = 'A', hours = 1) => ({ title, source, publishedAt: at(hours) })

test('제목 정규화 — 꼬리표와 문장부호를 떼고 같은 기사를 한 열쇠로', () => {
  const a = normalizeTitle('[단독] 분양가상한제 손질… 국토부 "연내 발표" - 한국경제')
  const b = normalizeTitle('【단독】분양가상한제 손질…국토부 “연내 발표” | 한국경제')
  assert.equal(a, b)
})

test('연합 기사 중복 제거 — 같은 제목은 한 번만 센다', () => {
  const items = [
    art('전세사기 피해자 지원 확대', '매체1'),
    art('[속보] 전세사기 피해자 지원 확대 - 매체2', '매체2'),
    art('전세사기 피해자 지원 확대!!', '매체3'),
  ]
  assert.equal(dedupe(items).length, 1)
})

test('여러 낱말 용어는 통째로 — 짧은 말로 쪼개지지 않는다', () => {
  const t = termsIn('공공임대주택 공급 확대… 스트레스 DSR 3단계 적용')
  const names = t.map(x => x.term)
  assert.ok(names.includes('공공임대주택'))
  assert.ok(names.includes('스트레스 DSR'))
  assert.ok(!names.includes('DSR'), 'DSR 은 스트레스 DSR 안에서 다시 잡히면 안 된다')
})

test('같은 말 다른 뜻 — 증권 기사에서는 주택 공급 용어를 세지 않는다', () => {
  assert.equal(termsIn('공모주 청약 경쟁률 1000대 1 돌파').some(e => e.kind === '공급'), false)
  assert.equal(termsIn('아파트 청약경쟁률 10대 1').some(e => e.term === '청약경쟁률'), true)
})

test('순위는 서로 다른 기사 수와 매체 다양성을 함께 본다', () => {
  const items = [
    art('전세사기 대책 발표', '매체1', 1),
    art('전세사기 피해 지원안', '매체2', 2),
    art('전세사기 특별법 연장', '매체3', 3),
    art('GTX 노선 확정', '매체1', 1),
    art('GTX 연장 검토', '매체1', 2),
  ]
  const hot = extractHotKeywords(items, { now: NOW })
  const 전세사기 = hot.find(h => h.term === '전세사기')
  const gtx = hot.find(h => h.term === 'GTX')
  assert.equal(전세사기.articles, 3)
  assert.equal(전세사기.outlets, 3)
  assert.equal(gtx.outlets, 1)
  assert.ok(전세사기.score > gtx.score)
})

test('한 번만 나온 말은 올리지 않는다(기본 최소 2건)', () => {
  const hot = extractHotKeywords([art('토지임대부 주택 공급')], { now: NOW })
  assert.equal(hot.length, 0)
})

test('시각이 없어도 버리지 않는다', () => {
  const items = [
    { title: '디딤돌대출 한도 축소', source: 'A', publishedAt: null },
    { title: '디딤돌대출 금리 인상 검토', source: 'B', publishedAt: null },
  ]
  const hot = extractHotKeywords(items, { now: NOW })
  assert.equal(hot[0].term, '디딤돌대출')
  assert.equal(hot[0].articles, 2)
})

test('빈 목록 · 한 건 목록에서 터지지 않는다', () => {
  assert.deepEqual(extractHotKeywords([], { now: NOW }), [])
  assert.deepEqual(extractHotKeywords([art('아무 말')], { now: NOW }), [])
})

test('사전에 있어도 기사에 없으면 순위에 없다', () => {
  const hot = extractHotKeywords([art('전세사기 대책', 'A'), art('전세사기 후속', 'B')], { now: NOW })
  assert.equal(hot.some(h => h.term === '신혼희망타운'), false)
})

test('걸러 보기는 순위와 같은 판정을 쓴다', () => {
  assert.equal(matchesKeyword('공공임대주택 입주 시작', '공공임대주택'), true)
  assert.equal(matchesKeyword('공모주 청약 흥행', '청약경쟁률'), false)
})
