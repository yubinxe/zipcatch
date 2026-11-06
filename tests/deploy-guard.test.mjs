/**
 * 미리보기 배포 안전장치 — 운영이 아닌 배포에서 DB 쓰기·발송을 막는지.  실행: npm test
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isGuardedDeploy } from '../lib/runtime/deploy-guard.ts'

function withEnv(env, fn) {
  const keep = { VERCEL_ENV: process.env.VERCEL_ENV, ALLOW_PREVIEW_WRITES: process.env.ALLOW_PREVIEW_WRITES }
  Object.assign(process.env, env)
  for (const [k, v] of Object.entries(env)) if (v === undefined) delete process.env[k]
  try {
    return fn()
  } finally {
    for (const [k, v] of Object.entries(keep)) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
  }
}

test('미리보기·개발 배포는 막고, 운영과 로컬은 그대로', () => {
  assert.equal(withEnv({ VERCEL_ENV: 'preview', ALLOW_PREVIEW_WRITES: undefined }, isGuardedDeploy), true)
  assert.equal(withEnv({ VERCEL_ENV: 'development', ALLOW_PREVIEW_WRITES: undefined }, isGuardedDeploy), true)
  assert.equal(withEnv({ VERCEL_ENV: 'production', ALLOW_PREVIEW_WRITES: undefined }, isGuardedDeploy), false)
  assert.equal(withEnv({ VERCEL_ENV: undefined, ALLOW_PREVIEW_WRITES: undefined }, isGuardedDeploy), false)
  assert.equal(withEnv({ VERCEL_ENV: 'preview', ALLOW_PREVIEW_WRITES: '1' }, isGuardedDeploy), false)
})
