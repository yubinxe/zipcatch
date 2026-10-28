'use client'

import { BatteryGlyph, SignalGlyph, WifiGlyph } from './glyphs'
import { useBattery, useDeviceClock, useOnline } from './deviceStores'

/**
 * One UI 상태 표시줄 — 왼쪽 시계, 가운데 펀치홀, 오른쪽 와이파이·안테나·배터리.
 * 시계와 배터리는 지금 이 기기의 값이다. 읽어줄 내용이 아니므로 통째로 aria-hidden.
 * 펀치홀은 테두리가 있는 데스크톱에서만 보인다(좁은 화면은 CSS 가 숨긴다).
 */
export default function StatusBar() {
  const { time } = useDeviceClock()
  const battery = useBattery()
  const online = useOnline()
  const pct = battery.level === null ? null : Math.round(battery.level * 100)

  return (
    <div className="cs-phone__status" aria-hidden="true">
      <span className="cs-phone__clock">{time}</span>
      <span className="cs-phone__punch" />
      <span className="cs-phone__sys">
        <WifiGlyph off={!online} />
        <SignalGlyph />
        {pct !== null && <span className="cs-phone__pct">{pct}%</span>}
        <BatteryGlyph level={battery.level} charging={battery.charging} />
      </span>
    </div>
  )
}
