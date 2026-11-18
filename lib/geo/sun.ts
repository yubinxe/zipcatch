/**
 * 해의 자리와 그림자 — 동네 3D 의 '해 그림자 연구'가 쓰는 계산.
 *
 * - 해의 위치는 NOAA 태양 계산식(NOAA Solar Calculator 의 식)을 그대로 옮겼다. 경위도·시각이 정해지면
 *   값이 하나로 정해진다(지어내는 값 없음). 오차는 고도·방위 모두 0.1° 안팎이다.
 * - 시각은 한국 표준시(KST, UTC+9, 일광절약 없음)로 받는다.
 * - 그림자는 '바닥 윤곽 × 높이' 기둥(평지붕)으로 본 건물만 계산한다. 지도에 높이가 적히지 않은
 *   건물·지형·나무·아직 없는 계획 건물은 빠진다 — 화면이 그 사실을 함께 적는다.
 *
 * 순수 함수만 둔다(경로 별칭 없음) — node --test 로 바로 시험한다.
 */

const RAD = Math.PI / 180
const DEG = 180 / Math.PI

export interface SunPosition {
  /** 방위 — 정북 0°, 시계 방향(동 90° · 남 180° · 서 270°) */
  azimuth: number
  /** 고도 — 지평선 0°, 천정 90°. 대기 굴절은 넣지 않은 기하 고도 */
  elevation: number
}

/** UTC 시각의 해 위치 */
export function solarPosition(date: Date, lat: number, lng: number): SunPosition {
  const jd = date.getTime() / 86_400_000 + 2440587.5
  const T = (jd - 2451545) / 36525
  const L0 = (((280.46646 + T * (36000.76983 + T * 0.0003032)) % 360) + 360) % 360
  const M = 357.52911 + T * (35999.05029 - 0.0001537 * T)
  const e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T)
  const C =
    Math.sin(M * RAD) * (1.914602 - T * (0.004817 + 0.000014 * T)) +
    Math.sin(2 * M * RAD) * (0.019993 - 0.000101 * T) +
    Math.sin(3 * M * RAD) * 0.000289
  const trueLong = L0 + C
  const omega = 125.04 - 1934.136 * T
  const lambda = trueLong - 0.00569 - 0.00478 * Math.sin(omega * RAD)
  const eps0 = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60
  const eps = eps0 + 0.00256 * Math.cos(omega * RAD)
  const decl = Math.asin(Math.sin(eps * RAD) * Math.sin(lambda * RAD))
  const y = Math.tan((eps / 2) * RAD) ** 2
  const eot =
    4 *
    DEG *
    (y * Math.sin(2 * L0 * RAD) -
      2 * e * Math.sin(M * RAD) +
      4 * e * y * Math.sin(M * RAD) * Math.cos(2 * L0 * RAD) -
      0.5 * y * y * Math.sin(4 * L0 * RAD) -
      1.25 * e * e * Math.sin(2 * M * RAD))

  const utcMin = date.getUTCHours() * 60 + date.getUTCMinutes() + date.getUTCSeconds() / 60
  const tst = (((utcMin + eot + 4 * lng) % 1440) + 1440) % 1440
  const ha = (tst / 4 - 180) * RAD
  const phi = lat * RAD
  const cosZ = Math.sin(phi) * Math.sin(decl) + Math.cos(phi) * Math.cos(decl) * Math.cos(ha)
  const zenith = Math.acos(Math.min(1, Math.max(-1, cosZ)))
  const az = Math.atan2(Math.sin(ha), Math.cos(ha) * Math.sin(phi) - Math.tan(decl) * Math.cos(phi)) * DEG + 180
  return { azimuth: ((az % 360) + 360) % 360, elevation: 90 - zenith * DEG }
}

/** 'YYYY-MM-DD' 의 한국 시각 m분(0~1439) → Date */
export function kstDate(day: string, minutes: number): Date {
  const [y, mo, d] = day.split('-').map(Number)
  return new Date(Date.UTC(y, mo - 1, d, 0, 0) + (minutes - 9 * 60) * 60_000)
}

export function sunAt(day: string, minutes: number, lat: number, lng: number): SunPosition {
  return solarPosition(kstDate(day, minutes), lat, lng)
}

/** 해돋이·해넘이를 가르는 고도 — 해의 위 끝과 대기 굴절(-0.833°) */
const HORIZON = -0.833

export interface SunTimes {
  /** 한국 시각 분 — 해가 뜨지 않거나 지지 않는 날(극지)은 null */
  sunrise: number | null
  sunset: number | null
  /** 해가 가장 높은 때(남중) */
  noon: number
  /** 남중 고도 */
  noonElevation: number
}

export function sunTimes(day: string, lat: number, lng: number): SunTimes {
  // 남중 — 1분 단위로 가장 높은 때를 찾는다(하루 1440번 계산, 화면에서 날짜를 바꿀 때 한 번)
  let noon = 0
  let best = -Infinity
  for (let m = 0; m < 1440; m += 4) {
    const el = sunAt(day, m, lat, lng).elevation
    if (el > best) {
      best = el
      noon = m
    }
  }
  for (let m = Math.max(0, noon - 4); m <= Math.min(1439, noon + 4); m++) {
    const el = sunAt(day, m, lat, lng).elevation
    if (el > best) {
      best = el
      noon = m
    }
  }
  const cross = (lo: number, hi: number, rising: boolean): number | null => {
    const f = (m: number) => sunAt(day, m, lat, lng).elevation - HORIZON
    if (rising ? !(f(lo) < 0 && f(hi) > 0) : !(f(lo) > 0 && f(hi) < 0)) return null
    for (let i = 0; i < 30; i++) {
      const mid = (lo + hi) / 2
      if ((f(mid) < 0) === rising) lo = mid
      else hi = mid
    }
    return (lo + hi) / 2
  }
  return { sunrise: cross(noon - 720, noon, true), sunset: cross(noon, noon + 720, false), noon, noonElevation: best }
}

/** 방위 → 열여섯 방위 이름 */
export function compass(azimuth: number): string {
  const names = ['북', '북북동', '북동', '동북동', '동', '동남동', '남동', '남남동', '남', '남남서', '남서', '서남서', '서', '서북서', '북서', '북북서']
  return names[Math.round((((azimuth % 360) + 360) % 360) / 22.5) % 16]
}

/* ── 그림자 ───────────────────────────────────────────── */

/** 동네 장면과 같은 좌표 — x 동쪽(m) · z 남쪽(m) */
export interface Prism {
  f: [number, number][]
  holes?: [number, number][][]
  h: number | null
}

function inside(px: number, pz: number, ring: [number, number][]): boolean {
  let c = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i]
    const [xj, zj] = ring[j]
    if (zi > pz !== zj > pz && px < ((xj - xi) * (pz - zi)) / (zj - zi) + xi) c = !c
  }
  return c
}

/**
 * 그 자리(높이 y)에서 해 쪽을 봤을 때 건물에 가리는가.
 *
 * 해 쪽으로 수평 반직선을 긋고, 건물 윤곽과 만나는 거리 t 에서 시선 높이(y + t·tan 고도)가
 * 건물 높이보다 낮으면 가린다. 평지붕 기둥이라 이 셈이 그대로 맞다.
 * 그 자리를 품은 건물(옛 건물 자리 등)은 빼고 본다 — 그 건물 안에서 해를 볼 수는 없지만, 새 단지의
 * 일조를 가늠할 때는 지금 그 자리에 선 건물이 사라진다고 보는 편이 맞다.
 */
export function shaded(buildings: readonly Prism[], sun: SunPosition, at: { x: number; z: number; y?: number } = { x: 0, z: 0 }): boolean {
  // 해돋이·해넘이와 같은 기준 — 해의 위 끝이 지평선 위에 보이는 동안(굴절 포함)은 해가 떠 있다
  if (sun.elevation <= HORIZON) return true
  const y0 = at.y ?? 0
  const tanE = Math.tan(Math.max(0.05, sun.elevation) * RAD)
  const dx = Math.sin(sun.azimuth * RAD)
  const dz = -Math.cos(sun.azimuth * RAD)
  for (const b of buildings) {
    if (b.h === null || b.h <= y0) continue
    if (inside(at.x, at.z, b.f)) continue
    // 이 높이의 건물이 가릴 수 있는 가장 먼 거리 — 그 밖의 건물은 볼 필요가 없다
    const reach = (b.h - y0) / tanE
    const rings = [b.f, ...(b.holes ?? [])]
    for (const ring of rings) {
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [ax, az] = ring[j]
        const [bx, bz] = ring[i]
        // 반직선 P + t·d 와 선분 A + s·(B−A) 의 교점
        const ex = bx - ax
        const ez = bz - az
        const den = dx * ez - dz * ex
        if (Math.abs(den) < 1e-12) continue
        const qx = ax - at.x
        const qz = az - at.z
        const t = (qx * ez - qz * ex) / den
        const s = (qx * dz - qz * dx) / den
        if (t > 0 && t <= reach && s >= 0 && s <= 1) return true
      }
    }
  }
  return false
}

export interface SunlightProfile {
  day: string
  /** 표본 간격(분) */
  step: number
  /** 해돋이부터 해넘이까지의 표본: [한국 시각 분, 직사광인가] */
  samples: [number, boolean][]
  /** 직사광 합계(분) */
  total: number
  /** 9~15시 사이 가장 긴 연속 직사광(분) */
  longest9to15: number
  /** 8~16시 사이 직사광 합계(분) */
  total8to16: number
  sunrise: number | null
  sunset: number | null
}

/** 그날 그 자리의 직사광 띠 */
export function sunlightProfile(
  buildings: readonly Prism[],
  day: string,
  lat: number,
  lng: number,
  opts: { step?: number; at?: { x: number; z: number; y?: number } } = {},
): SunlightProfile {
  const step = opts.step ?? 5
  const times = sunTimes(day, lat, lng)
  const samples: [number, boolean][] = []
  const from = times.sunrise === null ? 0 : Math.ceil(times.sunrise / step) * step
  const to = times.sunset === null ? 1440 : Math.floor(times.sunset / step) * step
  for (let m = from; m <= to; m += step) {
    const sun = sunAt(day, m, lat, lng)
    samples.push([m, !shaded(buildings, sun, opts.at)])
  }
  let total = 0
  let total8to16 = 0
  let longest9to15 = 0
  let run = 0
  for (const [m, lit] of samples) {
    if (lit) total += step
    if (lit && m >= 480 && m < 960) total8to16 += step
    if (m >= 540 && m < 900) {
      run = lit ? run + step : 0
      longest9to15 = Math.max(longest9to15, run)
    } else run = 0
  }
  return { day, step, samples, total, longest9to15, total8to16, sunrise: times.sunrise, sunset: times.sunset }
}

/** 한국 시각 분 → 'HH:MM' */
export function hhmm(minutes: number): string {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

/** 그해의 동지·춘분·하지 — 천문 날짜는 해마다 하루쯤 움직인다. 화면의 기준일로 쓴다 */
export function keyDays(year: number): { winter: string; equinox: string; summer: string } {
  // 해의 적위가 가장 낮은/높은 날, 0 을 지나는 날을 찾는다 — 표로 박아 두지 않는다
  const decl = (d: Date) => {
    const jd = d.getTime() / 86_400_000 + 2440587.5
    const T = (jd - 2451545) / 36525
    const L0 = 280.46646 + T * 36000.76983
    const M = 357.52911 + T * 35999.05029
    const C = Math.sin(M * RAD) * 1.914602 + Math.sin(2 * M * RAD) * 0.019993
    const lambda = L0 + C - 0.00569
    return Math.asin(Math.sin(23.4393 * RAD) * Math.sin(lambda * RAD)) * DEG
  }
  const iso = (t: number) => new Date(t + 9 * 3_600_000).toISOString().slice(0, 10)
  // 하루의 시작(한국 0시) — 춘분은 적위가 0 을 지나는 순간이 든 날이다
  const dayStart = (doy: number) => Date.UTC(year, 0, 1 + doy) - 9 * 3_600_000
  let winter = 0
  let summer = 0
  let lo = Infinity
  let hi = -Infinity
  let equinox = 0
  for (let doy = 0; doy < 366; doy++) {
    const t = dayStart(doy) + 12 * 3_600_000
    const v = decl(new Date(t))
    if (v < lo && doy > 300) {
      lo = v
      winter = t
    }
    if (v > hi) {
      hi = v
      summer = t
    }
    if (!equinox && doy < 120 && decl(new Date(dayStart(doy))) < 0 && decl(new Date(dayStart(doy + 1))) >= 0) equinox = dayStart(doy)
  }
  return { winter: iso(winter), equinox: iso(equinox), summer: iso(summer) }
}
