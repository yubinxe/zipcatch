import type { SiteData } from '../complex-visualization'

/** 현장 데이터는 체험을 열 때만 받는다 — 공고 화면의 짐이 되지 않게 */
export function loadSite(key: string | null): Promise<SiteData | null> {
  if (key === 'godeok-gangil-3') return import('./godeok-gangil-3').then(m => m.SITE)
  return Promise.resolve(null)
}
