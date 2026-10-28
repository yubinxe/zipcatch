import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readProgress, toProvince } from '../lib/consumer/build-progress.ts'

test('주소 첫 단어로 시·도 — 통합특별시는 자치구로 광주·전남을 가른다', () => {
  assert.equal(toProvince('부산 북구 만덕동'), '부산')
  assert.equal(toProvince('전남광주통합특별시 광산구 월곡동'), '광주')
  assert.equal(toProvince('전남광주통합특별시 순천시 해룡면'), '전남')
})

test('HUG 행으로 광역별 집계', () => {
  const r = readProgress([
    { 사업장명: 'A', 공정률: '30.5', 주소: '부산 북구', 시행사: 'x' },
    { 사업장명: 'B', 공정률: '80', 주소: '부산 남구', 시행사: 'y' },
    { 사업장명: 'C', 공정률: '10', 주소: '서울 강남구', 시행사: 'z' },
  ])
  const busan = r.provinces.find(p => p.province === '부산')
  assert.equal(busan.sites, 2)
  assert.equal(busan.median, 55.3)
  assert.equal(r.skipped, 0)
})
