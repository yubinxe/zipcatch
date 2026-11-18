/**
 * 정정공고·재공고 정리 — 결정적 시험.  실행: npm test
 * 아래 두 사례는 2026-11-18 운영 공개 API 에서 실제로 나란히 열려 있던 공고의 모양을 본떴다(값은 그대로, id 는 줄임).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { baseTitle, correctionMark, supersede, tidyTitle } from '../lib/consumer/supersede.ts'

const N = o => ({ region: '', housingType: '국민임대', applicationStart: null, firstSeenAt: null, announcementId: o.id, deposit: null, monthlyRent: null, ...o })

test('정정 표시 읽기 — 괄호로 감싼 표기만', () => {
  assert.equal(correctionMark('[정정공고]인천논현2단지 국임임대주택 예비입주자 모집 공고'), 'CORRECTION')
  assert.equal(correctionMark('평택고덕 A-6블록 (재공고)'), 'REISSUE')
  assert.equal(correctionMark('[검증용 가상] [정정공고] 고양 창릉'), 'CORRECTION')
  assert.equal(correctionMark('정정동 행복주택'), null)
  assert.equal(baseTitle('[정정공고]인천논현2단지  국임임대주택'), baseTitle('인천논현2단지 국임임대주택'))
})

test('정정공고가 원공고를 대신한다(금액이 달라도)', () => {
  const r = supersede([
    N({ id: 'orig', name: '인천논현2단지 국임임대주택 예비입주자 모집 공고', address: '인천광역시 남동구 은봉로166번길 27', region: '남동구', deposit: 3720, monthlyRent: 31 }),
    N({ id: 'fix', name: '[정정공고]인천논현2단지 국임임대주택 예비입주자 모집 공고', address: '인천광역시 남동구 은봉로166번길 27', region: '남동구', deposit: 3800, monthlyRent: 31 }),
  ])
  assert.deepEqual([...r.keep], ['fix'])
  assert.deepEqual(r.supersededBy.get('orig'), { id: 'fix', name: '[정정공고]인천논현2단지 국임임대주택 예비입주자 모집 공고', reason: 'CORRECTION' })
  assert.equal(r.supersedes.get('fix').length, 1)
})

test('같은 단지·같은 금액의 이전 회차는 최근 회차가 대신한다', () => {
  const addr = '충청북도 제천시 청풍호로2다길 8 충청북도 제천시 영천동 999-2'
  const r = supersede([
    N({ id: 'old', name: '제천 영천동 행복주택 추가(예비)입주자 모집공고', address: addr, region: '제천시', housingType: '행복주택', applicationStart: '2025-07-03', announcementId: '18430-1', deposit: 1143, monthlyRent: 9 }),
    N({ id: 'new', name: '제천 영천동 행복주택 추가(예비)입주자 모집공고', address: addr, region: '제천시', housingType: '행복주택', applicationStart: '2026-11-09', announcementId: '21477-1', deposit: 1143, monthlyRent: 9 }),
  ])
  assert.deepEqual([...r.keep], ['new'])
  assert.equal(r.supersededBy.get('old').reason, 'REISSUE')
})

test('금액이 다르면(주택형별 줄) 정정 표시 없이 합치지 않는다', () => {
  const r = supersede([
    N({ id: 'a', name: '영주 더 포레 매입임대', address: '경상북도 영주시 대동로34번길 23-3', deposit: 1131, monthlyRent: 18 }),
    N({ id: 'b', name: '영주 더 포레 매입임대', address: '경상북도 영주시 대동로34번길 23-3', deposit: 200, monthlyRent: 16 }),
  ])
  assert.equal(r.keep.size, 2)
})

test('이름이 다르거나 유형이 다르면 다른 모집이다', () => {
  const addr = '강원특별자치도 평창군 용평면 새이들길 23'
  const r = supersede([
    N({ id: 'a', name: '평창장평 통합공공임대주택(고령자복지형) 입주자 모집', address: addr, housingType: '통합공공임대', deposit: 598, monthlyRent: 9 }),
    N({ id: 'b', name: '평창장평 통합공공임대주택(일반형) 입주자 모집', address: addr, housingType: '통합공공임대', deposit: 598, monthlyRent: 9 }),
  ])
  assert.equal(r.keep.size, 2)
})

test('주소 없는 목록형 공고는 이름만 같다고 묶지 않는다', () => {
  const r = supersede([
    N({ id: 'a', name: '매입임대주택 입주자 모집', address: '', region: '서울' }),
    N({ id: 'b', name: '매입임대주택 입주자 모집', address: '', region: '서울' }),
  ])
  assert.equal(r.keep.size, 2)
})

test('주소 없어도 정정 표시가 있으면 같은 지역·유형 안에서 묶는다', () => {
  const r = supersede([
    N({ id: 'a', name: '서울 은평 행복주택 예비입주자', address: '', region: '서울', housingType: '행복주택' }),
    N({ id: 'b', name: '[정정] 서울 은평 행복주택 예비입주자', address: '', region: '서울', housingType: '행복주택' }),
    N({ id: 'c', name: '[정정] 서울 은평 행복주택 예비입주자', address: '', region: '경기', housingType: '행복주택' }),
  ])
  assert.deepEqual([...r.keep].sort(), ['b', 'c'])
})

test('겹쳐 실린 정정 표시는 하나로 — 표시 자체는 남긴다', () => {
  assert.equal(tidyTitle("[정정공고][정정공고]'26.11월 경주시, 영천시 국민임대주택"), "[정정공고]'26.11월 경주시, 영천시 국민임대주택")
  assert.equal(tidyTitle('[정정][재공고] 평택'), '[정정][재공고] 평택')
  assert.equal(tidyTitle('인천논현2단지'), '인천논현2단지')
})
