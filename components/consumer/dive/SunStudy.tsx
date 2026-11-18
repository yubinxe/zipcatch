'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { compass, hhmm, keyDays, sunAt, sunlightProfile, sunTimes, type SunPosition } from '@/lib/geo/sun'
import type { NeighborhoodScene } from './neighborhood-scene'

/**
 * 해 그림자 연구 — 동네 3D 위에서 하루의 해를 움직여 본다.
 *
 * - 해의 자리는 그 자리의 경위도·날짜·시각으로 계산한다(lib/geo/sun, NOAA 식).
 * - 그림자를 드리우는 것은 지도에 높이가 적힌 기존 건물뿐이다. 이 공고의 새 단지는 아직 없으므로
 *   '주변 건물이 이 자리에 드리우는 그림자'를 보는 도구다.
 * - 한 점으로 짚은 공고(필지·주소)만 그 자리 지면의 일조 띠를 낸다. 공고명 좌표는 범위라 내지 않는다.
 * - 움직임 줄이기에서는 재생·영상 시점을 끈다. 시각 바는 그대로 쓴다.
 */

const kstToday = () => new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10)
const kstNowMin = () => {
  const d = new Date(Date.now() + 9 * 3_600_000)
  return d.getUTCHours() * 60 + d.getUTCMinutes()
}
const span = (min: number) => {
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  return h ? `${h}시간${m ? ` ${m}분` : ''}` : `${m}분`
}

export default function SunStudy({
  scene,
  lat,
  lng,
  pinpoint,
  name,
  onSun,
}: {
  scene: NeighborhoodScene
  lat: number
  lng: number
  pinpoint: boolean
  name: string
  /** 하늘빛을 맞추려고 해의 자리를 바깥에 알린다 */
  onSun?: (sun: SunPosition) => void
}) {
  const [today] = useState(kstToday)
  const days = useMemo(() => keyDays(Number(today.slice(0, 4))), [today])
  const presets = useMemo(
    () => [
      { key: 'today', label: '오늘', day: today },
      { key: 'winter', label: '동지', day: days.winter },
      { key: 'equinox', label: '춘분', day: days.equinox },
      { key: 'summer', label: '하지', day: days.summer },
    ],
    [today, days],
  )
  const [preset, setPreset] = useState('today')
  const day = presets.find(p => p.key === preset)?.day ?? today
  const times = useMemo(() => sunTimes(day, lat, lng), [day, lat, lng])
  const lo = Math.ceil((times.sunrise ?? 360) / 5) * 5
  const hi = Math.floor((times.sunset ?? 1080) / 5) * 5

  // 처음 시각 — 지금 해가 떠 있으면 지금, 아니면 남중
  const [minute, setMinute] = useState(() => {
    const now = kstNowMin()
    const t = sunTimes(kstToday(), lat, lng)
    return t.sunrise !== null && t.sunset !== null && now > t.sunrise + 20 && now < t.sunset - 20 ? Math.round(now / 5) * 5 : Math.round(t.noon / 5) * 5
  })
  const m = Math.min(hi, Math.max(lo, minute))
  const sun = useMemo(() => sunAt(day, m, lat, lng), [day, m, lat, lng])

  useEffect(() => {
    scene.setSun(sun)
    onSun?.(sun)
  }, [scene, sun, onSun])

  // 그 자리 지면의 일조 띠 — 날짜가 바뀔 때만 다시 센다
  const profile = useMemo(() => (pinpoint ? sunlightProfile(scene.buildings, day, lat, lng, { step: 5 }) : null), [pinpoint, scene, day, lat, lng])

  /* ── 하루 재생 — 해돋이부터 해넘이까지 약 9초 ── */
  const reduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const [playing, setPlaying] = useState(false)
  const playRef = useRef<{ raf: number; t0: number; from: number } | null>(null)
  const stop = useCallback(() => {
    if (playRef.current) cancelAnimationFrame(playRef.current.raf)
    playRef.current = null
    setPlaying(false)
  }, [])
  const play = () => {
    if (reduced) return
    if (playing) return stop()
    const from = m >= hi - 5 ? lo : m
    const total = 9000 * ((hi - from) / Math.max(1, hi - lo))
    const st = { raf: 0, t0: 0, from }
    playRef.current = st
    setPlaying(true)
    const step = (now: number) => {
      if (playRef.current !== st) return
      if (!st.t0) st.t0 = now
      const k = Math.min(1, (now - st.t0) / Math.max(1, total))
      setMinute(Math.round(from + (hi - from) * k))
      if (k < 1) st.raf = requestAnimationFrame(step)
      else stop()
    }
    st.raf = requestAnimationFrame(step)
  }
  useEffect(() => stop, [stop])

  const [cine, setCine] = useState(false)
  useEffect(() => {
    scene.setCinematic(cine)
  }, [scene, cine])

  const [saved, setSaved] = useState<string | null>(null)
  const save = async () => {
    const label = presets.find(p => p.key === preset)?.label ?? ''
    const blob = await scene.capture({
      eyebrow: 'ZIPCATCH · 해 그림자',
      title: name,
      lines: [
        `${day}${preset === 'today' ? '' : ` (${label})`} ${hhmm(m)} · 해 고도 ${sun.elevation.toFixed(1)}° · ${compass(sun.azimuth)}`,
        ...(profile ? [`이 자리(지면) 직사광 ${span(profile.total)} · 9~15시 연속 최장 ${span(profile.longest9to15)}`] : []),
      ],
      footer: '지도 © OpenStreetMap 기여자 · 높이가 적힌 기존 건물만 · 계획 단지·지형·나무 제외',
    })
    if (!blob) return setSaved('이미지를 만들지 못했습니다')
    const file = new File([blob], `zipcatch-sun-${day}-${hhmm(m).replace(':', '')}.png`, { type: 'image/png' })
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean }
    try {
      if (nav.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: `${name} — 해 그림자` })
        return setSaved('공유했습니다')
      }
    } catch {
      // 공유를 닫았으면 그대로 저장으로 넘어간다
    }
    const url = URL.createObjectURL(file)
    const a = document.createElement('a')
    a.href = url
    a.download = file.name
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 4000)
    setSaved('이미지를 저장했습니다')
  }
  useEffect(() => {
    if (!saved) return
    const t = setTimeout(() => setSaved(null), 2600)
    return () => clearTimeout(t)
  }, [saved])

  const [open, setOpen] = useState(() => typeof window === 'undefined' || window.matchMedia('(min-width: 861px)').matches)
  const pct = (v: number) => ((v - lo) / Math.max(1, hi - lo)) * 100
  const noonPct = pct(times.noon)

  if (!open) {
    return (
      <button type="button" className="zx-sun-pill" onClick={() => setOpen(true)} aria-expanded="false">
        <SunGlyph /> 해 그림자 <b className="cs-num">{hhmm(m)}</b>
      </button>
    )
  }

  return (
    <section className="zx-sun" aria-label="해 그림자 연구">
      <header className="zx-sun__head">
        <p className="zx-sun__eyebrow">
          <SunGlyph /> 해 그림자
        </p>
        <div className="zx-sun__days" role="radiogroup" aria-label="날짜">
          {presets.map(p => (
            <button key={p.key} type="button" role="radio" aria-checked={preset === p.key} onClick={() => setPreset(p.key)}>
              {p.label}
            </button>
          ))}
        </div>
        <div className="zx-sun__acts">
          {!reduced && (
            <button type="button" className="zx-sun__icon" aria-pressed={cine} onClick={() => setCine(c => !c)} title="천천히 돌며 보기">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                <path d="M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3" />
                <path d="M18 3v4h-4M6 21v-4h4" />
              </svg>
              <span className="cs-sr">천천히 돌며 보기</span>
            </button>
          )}
          <button type="button" className="zx-sun__icon" onClick={save} title="이 장면을 이미지로 저장·공유">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
            </svg>
            <span className="cs-sr">이 장면을 이미지로 저장·공유</span>
          </button>
          <button type="button" className="zx-sun__icon" onClick={() => setOpen(false)} title="접기">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
              <path d="M6 9l6 6 6-6" />
            </svg>
            <span className="cs-sr">접기</span>
          </button>
        </div>
      </header>

      <div className="zx-sun__row">
        {!reduced && (
          <button type="button" className="zx-sun__play" onClick={play} aria-label={playing ? '멈춤' : '하루 재생'}>
            {playing ? (
              <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
                <rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor" />
                <rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M7 4.5v15l12-7.5z" fill="currentColor" />
              </svg>
            )}
          </button>
        )}
        <div className="zx-sun__track" style={{ '--at': `${pct(m)}%`, '--noon': `${noonPct}%` } as React.CSSProperties}>
          <input
            type="range"
            min={lo}
            max={hi}
            step={5}
            value={m}
            onChange={e => {
              stop()
              setMinute(Number(e.target.value))
            }}
            aria-label="시각"
            aria-valuetext={`${hhmm(m)}, 해 고도 ${sun.elevation.toFixed(0)}도, ${compass(sun.azimuth)}쪽`}
          />
          <div className="zx-sun__ticks cs-num" aria-hidden="true">
            <span>{times.sunrise !== null ? hhmm(times.sunrise) : '—'}</span>
            <span>{times.sunset !== null ? hhmm(times.sunset) : '—'}</span>
          </div>
        </div>
        <output className="zx-sun__time cs-num" aria-live="off">
          {hhmm(m)}
        </output>
      </div>

      <p className="zx-sun__read cs-num">
        해 고도 <b>{sun.elevation.toFixed(1)}°</b> · 방위 <b>{compass(sun.azimuth)}</b> {Math.round(sun.azimuth)}° · 남중 {hhmm(times.noon)} ({times.noonElevation.toFixed(1)}°)
      </p>

      {profile && (
        <div className="zx-sun__light">
          <svg className="zx-sun__strip" viewBox={`0 0 ${profile.samples.length} 10`} preserveAspectRatio="none" aria-hidden="true">
            {profile.samples.map(([t, lit], i) => (
              <rect key={t} x={i} y={0} width={1.02} height={10} data-lit={lit || undefined} data-core={(t >= 540 && t < 900) || undefined} />
            ))}
            <rect className="zx-sun__now" x={Math.max(0, profile.samples.findIndex(([t]) => t >= m))} y={0} width={0.6} height={10} />
          </svg>
          <p className="zx-sun__sum">
            이 자리 지면 직사광 <b className="cs-num">{span(profile.total)}</b> · 9~15시 연속 최장 <b className="cs-num">{span(profile.longest9to15)}</b> · 8~16시 합계{' '}
            <b className="cs-num">{span(profile.total8to16)}</b>
          </p>
          {preset === 'winter' && (
            <p className="zx-sun__ref">참고 — 판례는 일조 침해를 볼 때 동지 기준 9~15시 연속 2시간 또는 8~16시 합계 4시간을 흔히 씁니다. 이 값은 그 판정이 아닙니다.</p>
          )}
        </div>
      )}
      <p className="zx-sun__note">
        {pinpoint
          ? '지면 기준 · 지도에 높이가 적힌 기존 건물만 그림자를 드립니다(지형·나무·이 공고의 새 단지 제외).'
          : '공고명으로 찾은 대략 위치라 그 자리의 일조는 세지 않고, 주변 그림자만 보여 드립니다.'}
      </p>
      {saved && (
        <p className="zx-sun__toast" role="status">
          {saved}
        </p>
      )}
    </section>
  )
}

function SunGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  )
}
