import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readSeoulSupply } from '../lib/consumer/seoul-supply.ts'

test('개시일 없는 사업장은 연도별에서 빼고 따로 센다', () => {
  const r = readSeoulSupply([
    { 사업장명: 'A', 사업구분: '재건축', 세대수: 1097, '분양 개시일': '2025-02-24' },
    { 사업장명: 'B', 사업구분: '재개발', 세대수: 999, '분양 개시일': '2025-01-14' },
    { 사업장명: 'C', 사업구분: '일반분양', 세대수: 61, '분양 개시일': null },
    { 사업장명: 'D', 사업구분: '지역조합', 세대수: 100, '분양 개시일': '2024-05-01' },
  ])
  assert.equal(r.sites, 4)
  assert.equal(r.households, 2257)
  assert.equal(r.undated, 1)
  assert.deepEqual(r.years.map(y => y.year), ['2024', '2025'])
  assert.equal(r.years[1].byGroup.재건축, 1097)
  assert.equal(r.years[0].byGroup.기타, 100)
  assert.equal(r.latest, '2025-02-24')
  assert.equal(r.recent[0].name, 'A')
})
