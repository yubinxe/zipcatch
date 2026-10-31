'use client'

import { usePathname, useRouter } from 'next/navigation'
import { FEATURES } from '@/lib/features'
import { captureTitles } from '@/lib/consumer/title-flip'
import { compareHref, TRAY_MAX, trayClear, trayRemove, useCompareTray } from '@/lib/consumer/compare-tray'

/**
 * 화면 아래의 비교 트레이. 어느 화면에서 담았든 여기 모인다.
 *
 * 관심공고 화면은 제 고르기 띠가 따로 있고, 비교 화면은 이미 그 결과라 띄우지 않는다.
 */
export default function CompareTray() {
  const tray = useCompareTray()
  const pathname = usePathname()
  const router = useRouter()
  if (!FEATURES.battle || tray.length === 0) return null
  if (pathname.startsWith('/saved') || pathname.startsWith('/compare')) return null

  // 화면에 보이는 담은 공고의 제목 자리를 적고 옮긴다 — 비교 열 제목이 그 자리에서 이어 나온다
  const go = () => {
    captureTitles(tray.map(i => i.id))
    router.push(compareHref(tray))
  }

  return (
    <div className="cs-tray" role="region" aria-label="비교 담은 공고">
      <span className="cs-tray__n">
        비교 <b className="cs-num">{tray.length}</b>/{TRAY_MAX}
      </span>
      <ul className="cs-tray__list">
        {tray.map(i => (
          <li key={i.id}>
            <span className="cs-tray__name">{i.name}</span>
            <button type="button" className="cs-tray__x" onClick={() => trayRemove(i.id)} aria-label={`${i.name} 비교에서 빼기`}>
              ×
            </button>
          </li>
        ))}
      </ul>
      <div className="cs-tray__acts">
        <button type="button" className="cs-tray__clear" onClick={trayClear}>
          비우기
        </button>
        {tray.length >= 2 ? (
          <button type="button" className="cs-tray__go" onClick={go}>
            비교하기 →
          </button>
        ) : (
          <span className="cs-tray__hint">하나 더 담으면 비교해요</span>
        )}
      </div>
    </div>
  )
}
