/**
 * 미리보기 배포의 안전장치.
 *
 * Vercel 미리보기(VERCEL_ENV=preview)·개발 배포는 운영과 같은 환경변수(Supabase 키·발송 키)를
 * 물려받을 수 있다. 그대로 두면 미리보기 화면을 눌러 보는 것만으로 운영 DB 의 소비자 상태 문서가
 * 덮어쓰이고, 알림이 실제 고객에게 나간다. 운영(production)이 아닌 배포에서는
 *  - DB 는 읽기만 한다 (쓰기는 조용히 실패시키고 화면은 메모리로 계속 돈다)
 *  - 알림은 보내지 않고 원문만 남긴다(PREVIEW)
 * 로컬 개발(VERCEL_ENV 없음)은 건드리지 않는다. 일부러 열려면 ALLOW_PREVIEW_WRITES=1.
 */
export function isGuardedDeploy(): boolean {
  const env = (process.env.VERCEL_ENV ?? '').trim()
  if (!env || env === 'production') return false
  return (process.env.ALLOW_PREVIEW_WRITES ?? '').trim() !== '1'
}

export const GUARD_NOTE = '미리보기 배포라 발송하지 않고 원문만 보관했습니다.'
