'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MAP_SCOPE, type MapScope } from '@/lib/consumer/geo'
import { formatManOr } from '@/lib/crm/services/scoring'
import { PillChoice } from './Choose'
import { loadKakao } from './kakao-sdk'
import { diffDays, stateOn } from '@/lib/consumer/timeline-core'
import MapIntro, {
  createHandoff,
  introStartLevel,
  prefersReducedMotion,
  type Handoff,
  type IntroAim,
  type IntroPin,
} from './map/MapIntro'

/**
 * 지도로 보는 공고 (카카오맵).
 *
 * 목록은 "무엇이 있는지"를, 달력은 "언제인지"를 답한다. 지도는 "어디인지"다.
 * 집을 고르는 일은 결국 지도 위에서 끝나므로, 남은 날짜를 표시에 얹어
 * 어디가 급한지까지 한 번에 보이게 한다.
 *
 * 좌표의 출처를 숨기지 않는다. 주소를 좌표로 바꿔 찍은 점과 지역 기준의 대략
 * 위치를 다르게 그리고, 지도에 올리지 못한 공고 수를 아래에 적는다.
 * 지도에 없는 공고가 없는 공고처럼 읽히면 지도를 믿고 목록을 안 보게 된다.
 */

interface Pin {
  id: string
  name: string
  province: string
  region: string
  housingType: string
  address: string | null
  kind: 'SALE' | 'RENT'
  deposit: number | null
  monthlyRent: number | null
  applicationEnd: string | null
  daysLeft: number | null
  urgencyLabel: string
  lat: number
  lng: number
  coordSource: 'GEOCODED' | 'DISTRICT' | 'PROVINCE'
  /** range=all 일 때만 온다 */
  applicationStart?: string | null
  seen?: string | null
  /** 되감은 날 기준으로 아직 접수 전 */
  soon?: boolean
}

interface MapData {
  pins: Pin[]
  total: number
  noCoord: number
  noAddress: number
  geocoded: number
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type KakaoNS = any

/** 남은 날을 사람 말로. 표시 안에 들어가므로 짧아야 한다 */
function dday(n: number | null) {
  if (n === null) return '미정'
  if (n === 0) return 'D-DAY'
  if (n < 0) return '마감'
  return `D-${n}`
}

/** 마감이 가까운 순. 되감은 날의 접수 예정 공고는 열려 있는 공고 뒤로 */
function bySoonest(a: Pin, z: Pin) {
  return Number(!!a.soon) - Number(!!z.soon) || (a.daysLeft ?? 9999) - (z.daysLeft ?? 9999)
}

/** 2026-09-19 → 2026. 9. 19. (타임머신 표기와 같게) */
function dotted(day: string) {
  const [y, m, d] = day.split('-').map(Number)
  return `${y}. ${m}. ${d}.`
}

function priceLine(p: Pin) {
  if (p.deposit === null && p.monthlyRent === null) return '공급금액 공고문 확인'
  const dep = formatManOr(p.deposit)
  if (p.monthlyRent === null || p.monthlyRent === 0) return dep
  return `${dep} · 월 ${p.monthlyRent.toLocaleString()}만원`
}

/** 범위가 가리키는 지역 — '서울'을 눌렀는데 부산 공고가 보이면 범위가 거짓말이 된다 */
const SCOPE_PROVINCES: Record<MapScope, string[] | null> = {
  서울: ['서울'],
  수도권: ['서울', '경기', '인천'],
  전국: null,
}

/**
 * 카카오의 level 은 작을수록 확대이고, 한 단 오를 때마다 대략 두 배씩 넓어진다.
 * 7 은 가로 1km 남짓 — 서울 도심 몇 블록이다. 처음에 이 값을 "서울"로 잡았더니
 * 지도 범위가 37.53~37.59 로 잡혀, 의정부·시흥·양주에 있는 공고가 전부 화면
 * 밖으로 나갔다. 표시는 102개 다 만들어졌는데 하나도 안 보였던 이유다.
 *
 *   9 ≈ 4km    서울 전역
 *  11 ≈ 16km   수도권
 *  13 ≈ 64km   전국
 */
const LEVEL: Record<MapScope, number> = { 서울: 9, 수도권: 11, 전국: 13 }

/**
 * 카카오가 지도 안에 직접 그려 넣는 것들에 이름을 붙인다.
 *
 * 저작자 표시 링크(map.kakao.com)와 확대·축소 단추는 카카오 SDK 가 만들고,
 * 이름표가 붙어 있지 않다. 화면을 읽어 주는 기계에는 "링크"라고만 들려서
 * 어디로 가는 링크인지 알 수 없다. 우리가 만든 DOM 은 아니지만, 우리 화면에
 * 놓인 이상 이름은 우리가 챙긴다. 붙이는 것 말고는 건드리지 않는다.
 */
function labelKakaoChrome(box: HTMLElement | null) {
  if (!box) return
  for (const a of box.querySelectorAll('a')) {
    const named = (a.textContent ?? '').trim() || a.getAttribute('aria-label')
    if (named) continue
    a.setAttribute('aria-label', '카카오맵에서 보기 (새 창)')
    a.setAttribute('rel', 'noopener noreferrer')
  }
}

/** 범위가 가리키는 시도 — 벡터 지도에서 살짝 밝혀 어디로 가는지 먼저 보이게 한다 */
const SCOPE_SVG_IDS: Record<MapScope, string[]> = {
  서울: ['seoul'],
  수도권: ['seoul', 'gyeonggi', 'incheon'],
  전국: [],
}

export default function NoticeMap({
  /**
   * 조각이 제 머리(제목·설명)를 들고 나올지.
   *
   * 이 조각은 두 곳에 놓인다. /notices 에서는 목록 아래에 끼어들어 가므로
   * 스스로 "여기부터 지도"라고 밝혀야 하지만, /map 에서는 화면 자체가
   * 지도라 이미 같은 제목이 붙어 있다. 그대로 두었더니 "지도로 보는 공고"가
   * 한 화면에 두 번 나왔다.
   */
  heading = true,
  /**
   * 타임머신이 고른 날(YYYY-MM-DD). 비었거나 오늘이면 지금의 공고를 그대로 그린다.
   * 다른 날이면 공고 원문 일정으로 그날 마감 전이던(또는 접수 예정이던) 공고만 얹는다.
   */
  day = null,
  today = null,
  onToday,
}: {
  heading?: boolean
  day?: string | null
  today?: string | null
  onToday?: () => void
} = {}) {
  const host = useRef<HTMLDivElement>(null)
  const mapRef = useRef<KakaoNS>(null)
  /** 마지막으로 화면을 맞춘 범위. 같은 범위로 두 번 움직이지 않으려고 둔다 */
  const framedRef = useRef<MapScope | null>(null)
  const overlaysRef = useRef<KakaoNS[]>([])
  const resizeRef = useRef<ResizeObserver | null>(null)
  useEffect(() => () => resizeRef.current?.disconnect(), [])

  /**
   * 기본 범위.
   *
   * '서울'로 두었더니 빈 지도가 열렸다 — 지금 접수 중인 서울 공식 공고가 0건이다.
   * 처음 본 화면이 비어 있으면 서비스에 공고가 없다고 읽힌다. 공고가 있는 데서 연다.
   */
  const [scope, setScope] = useState<MapScope>('수도권')
  const [data, setData] = useState<MapData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  /** 지금 화면에 들어온 공고 — 지도를 움직이면 따라 바뀐다 */
  const [visible, setVisible] = useState<Pin[]>([])
  const [hovered, setHovered] = useState<string | null>(null)
  /**
   * 첫 장면(벡터 지도 → 카카오 지도). 'done' 이 되면 벡터 층이 내려간다.
   * 카카오 지도가 서면 handoff 가 생기고, 벡터는 그 지도의 실제 범위로 착지한다.
   */
  const [intro, setIntro] = useState<'on' | 'done'>('on')
  const [handoff, setHandoff] = useState<Handoff | null>(null)
  const [skip, setSkip] = useState(0)
  /** 첫 장면이 끝날 level — 그동안 옆 목록은 이 자리로 센다. 장면이 끝나면 비운다 */
  const introTargetRef = useRef<number | null>(null)
  const endIntro = useCallback(() => {
    introTargetRef.current = null
    setIntro('done')
  }, [])

  /**
   * 지도 SDK 를 **공고와 나란히** 불러 온다.
   *
   * 예전에는 공고가 도착한 뒤에야 SDK 를 불렀다. 지도를 한 번만 그리려면
   * 공고를 기다려야 하는 건 맞지만, 그건 **그리는 일**의 사정이지
   * **받아 오는 일**의 사정이 아니다. 둘을 줄 세워 놓는 바람에 기다림이
   * 더해져서 나왔다. 받아 오는 것은 동시에, 그리는 것은 둘 다 온 뒤에.
   */
  const [sdk, setSdk] = useState<KakaoNS | null>(null)
  useEffect(() => {
    let alive = true
    loadKakao()
      .then(k => {
        if (alive) setSdk(k)
      })
      .catch((e: Error) => {
        if (alive) setError(e.message)
      })
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    let alive = true
    fetch('/api/notices/map', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error('공고를 불러오지 못했어요.'))))
      .then(json => {
        if (!alive) return
        if (json.error) setError(json.error)
        else setData(json)
      })
      .catch((e: unknown) => {
        if (alive) setError(e instanceof Error ? e.message : '공고를 불러오지 못했어요.')
      })
    return () => {
      alive = false
    }
  }, [])

  /** 되감기 중인지. 오늘이면 아니다 */
  const rewound = !!day && !!today && day !== today
  /** 지난 공고까지 실은 판. 처음 되감을 때 한 번만 받는다 */
  const [wide, setWide] = useState<MapData | null>(null)
  const [wideError, setWideError] = useState<string | null>(null)
  useEffect(() => {
    if (!rewound || wide) return
    let alive = true
    fetch('/api/notices/map?range=all', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error('지난 공고를 불러오지 못했어요.'))))
      .then(json => alive && (json.error ? setWideError(json.error) : setWide(json)))
      .catch((e: unknown) => alive && setWideError(e instanceof Error ? e.message : String(e)))
    return () => {
      alive = false
    }
  }, [rewound, wide])

  /**
   * 지금 지도에 얹을 공고. 되감기 중이 아니면 처음 받은 그대로다(기존 동작).
   * 되감은 날에는 남은 날을 그날 기준으로 다시 센다. 시작일이 없고 처음 저장한 날보다
   * 앞선 날에는 있었는지 모르므로 얹지 않는다.
   */
  const shown = useMemo<MapData | null>(() => {
    if (!rewound || !data) return data
    if (!wide) return data
    const pins = wide.pins.flatMap(p => {
      const st = stateOn({ start: p.applicationStart ?? null, end: p.applicationEnd, seen: p.seen }, day!)
      if (st === 'CLOSED' || st === 'UNKNOWN') return []
      const left = p.applicationEnd ? diffDays(day!, p.applicationEnd.slice(0, 10)) : null
      return [{ ...p, daysLeft: left, soon: st === 'UPCOMING' }]
    })
    return { ...wide, pins }
  }, [rewound, data, wide, day])

  /** 고른 범위의 공고 수 — 비어 있을 때 이유를 말하는 데 쓴다 */
  const scopeCount = shown
    ? (SCOPE_PROVINCES[scope]
        ? shown.pins.filter(p => SCOPE_PROVINCES[scope]!.includes(p.province))
        : shown.pins
      ).length
    : 0

  /** 그 범위에 실제로 있는 공고 */
  const pinsInScope = (pins: Pin[]) => {
    const allow = SCOPE_PROVINCES[scope]
    return allow ? pins.filter(p => allow.includes(p.province)) : pins
  }

  /** 주어진 공고를 한 화면에 담는다. 담을 게 없으면 범위의 기본 자리로 */
  const frame = (kakao: KakaoNS, map: KakaoNS, pins: Pin[], animate: boolean) => {
    const s = MAP_SCOPE[scope]
    if (pins.length === 0) {
      const c = new kakao.maps.LatLng(s.center.lat, s.center.lng)
      map.setLevel(LEVEL[scope])
      if (animate) map.panTo(c)
      else map.setCenter(c)
      return
    }
    const box = new kakao.maps.LatLngBounds()
    pins.forEach(p => box.extend(new kakao.maps.LatLng(p.lat, p.lng)))
    map.setBounds(box, 32, 32, 32, 32)
  }

  /**
   * 지도를 세운다 — **공고가 도착한 뒤에.**
   *
   * 예전에는 서울로 먼저 띄우고 400ms 뒤 공고가 있는 데로 옮겼다. 화면이 한 번
   * 잡혔다가 곧바로 튀어 눈이 끊겼다. 사용자는 자기가 만지지도 않았는데 지도가
   * 움직이면 그것을 오작동으로 읽는다.
   *
   * 지도는 한 번만 그린다. 그릴 때 이미 맞는 자리에 있으면 옮길 일이 없다.
   */
  useEffect(() => {
    let alive = true
    // 둘 다 와야 그린다. 그래야 처음 그릴 때 이미 맞는 자리에 있다.
    if (!data || !sdk) return
    Promise.resolve(sdk)
      .then(kakao => {
        if (!alive || !host.current || mapRef.current) return
        const s = MAP_SCOPE[scope]
        const map = new kakao.maps.Map(host.current, {
          center: new kakao.maps.LatLng(s.center.lat, s.center.lng),
          level: LEVEL[scope],
        })
        mapRef.current = map
        // 첫 화면을 여기서 정한다. 그린 뒤에는 옮기지 않는다.
        frame(kakao, map, pinsInScope(data.pins), false)
        framedRef.current = scope
        /*
         * 단, 첫 장면 동안은 한 단 넓게 열어 둔다. 벡터 지도가 여기까지 다가와 넘겨주면
         * 마지막 한 단은 카카오가 직접 당긴다 — 바꿔 끼우는 게 아니라 한 번의 움직임이
         * 된다. 사용자가 손대기 전에 끝나는 움직임이고, 끝나는 자리는 위에서 정한 그대로다.
         */
        const target = map.getLevel()
        const start = introStartLevel(target, map.getCenter().getLat(), prefersReducedMotion())
        if (start !== target) {
          introTargetRef.current = target
          map.setLevel(start)
        }
        setHandoff(createHandoff(kakao, map, target))
        labelKakaoChrome(host.current)
        setReady(true)
        /*
         * 휴대폰에서는 주소창이 접히고 펴지며 지도 칸의 크기가 바뀐다. 카카오 지도는
         * 처음 잰 크기를 기억하고 있어서, 다시 재라고 하지 않으면 바뀐 만큼이
         * 회색으로 남는다. 칸이 실제로 바뀔 때만 다시 잰다.
         */
        if ('ResizeObserver' in window) {
          let last = `${host.current.clientWidth}x${host.current.clientHeight}`
          resizeRef.current?.disconnect()
          resizeRef.current = new ResizeObserver(([entry]) => {
            const size = `${Math.round(entry.contentRect.width)}x${Math.round(entry.contentRect.height)}`
            if (size === last) return
            last = size
            map.relayout()
          })
          resizeRef.current.observe(host.current)
        }
      })
      .catch((e: Error) => {
        if (alive) setError(e.message)
      })
    return () => {
      alive = false
    }
    // scope 는 아래 효과가 맡는다 — 지도를 다시 만들지 않는다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, sdk])

  /**
   * 범위를 누르면 옮긴다. 이건 사용자가 시킨 움직임이라 부드럽게 따라가도 된다.
   * 첫 그림이 이미 자리를 잡았으므로 지도가 저절로 움직이는 곳은 여기뿐이다.
   */
  useEffect(() => {
    const w = window as unknown as { kakao?: KakaoNS }
    if (!ready || !mapRef.current || !data || !w.kakao?.maps) return
    // 첫 그림이 이미 이 범위로 잡혀 있으면 아무것도 하지 않는다
    if (framedRef.current === scope) return
    frame(w.kakao, mapRef.current, pinsInScope(data.pins), true)
    framedRef.current = scope
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, ready])

  // 표시를 그린다. 기본 핀 대신 지면의 글자꼴로 만든 표를 얹는다.
  useEffect(() => {
    const w = window as unknown as { kakao?: KakaoNS }
    const data = shown
    if (!ready || !mapRef.current || !data || !w.kakao?.maps) return
    const kakao = w.kakao
    const map = mapRef.current

    overlaysRef.current.forEach(o => {
      try {
        o.setMap(null)
      } catch {
        /* 이미 떨어져 나간 표시 */
      }
    })
    overlaysRef.current = []

    // 표시는 HTML 문자열로 넘긴다. DOM 요소를 넘기면 React 가 다시 그릴 때
    // 그 요소가 바뀌어 지도 위에서 사라지는 일이 생긴다. 실패를 조용히
    // 삼키지 않고 한 번만 모아서 화면에 알린다 — 지난번에 표시가 하나도
    // 안 뜨는데 아무 말도 없어 원인을 찾는 데 오래 걸렸다.
    let failed = 0
    data.pins.forEach(pin => {
      const urgent = pin.daysLeft !== null && pin.daysLeft <= 3
      const approx = pin.coordSource !== 'GEOCODED'
      // 신호등. 급한 쪽이 붉고, 여유가 있으면 푸르다.
      // 색은 남은 날이 결정을 바꾸는 구간까지만 쓴다 — 여드레 넘게 남은 공고를
      // 물들여 봐야 화면만 시끄럽고 급한 것이 묻힌다.
      const dayClass =
        pin.daysLeft === null
          ? ''
          : pin.daysLeft === 0
            ? 'cs-pin--d0' // 오늘 마감 — 지금 넣지 않으면 끝난다
            : pin.daysLeft <= 3
              ? 'cs-pin--d1' // 사흘 안 — 서류를 챙길 시간이 빠듯하다
              : pin.daysLeft <= 7
                ? 'cs-pin--d2' // 한 주 안 — 준비하면 된다
                : ''
      const cls = [
        'cs-pin',
        `cs-pin--${pin.kind.toLowerCase()}`,
        urgent ? 'cs-pin--urgent' : '',
        dayClass,
        approx ? 'cs-pin--approx' : '',
        pin.soon ? 'cs-pin--soon' : '',
      ]
        .filter(Boolean)
        .join(' ')
      const label = pin.soon ? '예정' : dday(pin.daysLeft)
      const title = `${pin.name} · ${pin.province}`.replace(/"/g, '&quot;')

      try {
        const ov = new kakao.maps.CustomOverlay({
          position: new kakao.maps.LatLng(pin.lat, pin.lng),
          content: `<a class="${cls}" href="/notices/${pin.id}" title="${title}">${label}</a>`,
          yAnchor: 0.5,
          xAnchor: 0.5,
          clickable: true,
          zIndex: urgent ? 3 : pin.kind === 'SALE' ? 2 : 1,
        })
        ov.setMap(map)
        overlaysRef.current.push(ov)
      } catch {
        failed++
      }
    })
    if (failed > 0 && failed === data.pins.length) {
      // 효과 안에서 곧바로 상태를 바꾸면 그리기가 한 번 더 돈다. 한 박자 뒤로 미룬다.
      queueMicrotask(() => setError('지도에 공고를 표시하지 못했습니다. 잠시 뒤 새로고침해 주세요.'))
    }

    // 지도를 움직이면 옆 목록이 따라온다. 보이는 것과 읽는 것을 어긋나게 두지 않는다.
    const sync = () => {
      const b = map.getBounds()
      if (!b) return
      const sw = b.getSouthWest()
      const ne = b.getNorthEast()
      /*
       * 첫 장면 동안 카카오 지도는 한 단 넓게 서 있다. 그 범위로 목록을 세면 장면이
       * 끝나는 순간 목록이 한 번 줄어든다 — 사용자가 손대지 않았는데 바뀌는 목록이다.
       * 장면이 끝날 자리(가운데를 두고 한 단마다 절반)로 미리 센다.
       */
      const lv = map.getLevel()
      const tl = introTargetRef.current
      const f = tl !== null && lv > tl ? 2 ** (tl - lv) : 1
      const cLat = (sw.getLat() + ne.getLat()) / 2
      const cLng = (sw.getLng() + ne.getLng()) / 2
      const hLat = ((ne.getLat() - sw.getLat()) / 2) * f
      const hLng = ((ne.getLng() - sw.getLng()) / 2) * f
      const inView = data.pins.filter(
        p =>
          p.lat >= cLat - hLat &&
          p.lat <= cLat + hLat &&
          p.lng >= cLng - hLng &&
          p.lng <= cLng + hLng,
      )
      inView.sort(bySoonest)
      setVisible(inView)
    }
    sync()
    // 처음 그릴 때 bounds 가 아직 0 인 순간이 있어 한 박자 뒤 다시 센다.
    // 화면은 건드리지 않고 옆 목록만 맞춘다 — 저절로 움직이는 지도를 만들지 않는다.
    const settle = setTimeout(sync, 300)
    kakao.maps.event.addListener(map, 'idle', sync)

    return () => {
      clearTimeout(settle)
      try {
        kakao.maps.event.removeListener(map, 'idle', sync)
      } catch {
        /* 떠나는 길에 난 예외로 다음 화면을 망치지 않는다 */
      }
      overlaysRef.current.forEach(o => {
        try {
          o.setMap(null)
        } catch {
          /* 같은 이유 */
        }
      })
      overlaysRef.current = []
    }
    // scope 가 바뀌면 다시 맞출 기회를 준다. 되감은 날이 바뀌면 표시를 다시 얹는다
  }, [ready, shown, scope])

  /** 벡터 지도가 다가갈 곳 — 카카오 지도가 처음 담을 것과 같은 공고들 */
  const aim = useMemo<IntroAim>(() => {
    const allow = SCOPE_PROVINCES[scope]
    const pins = data ? (allow ? data.pins.filter(p => allow.includes(p.province)) : data.pins) : []
    return {
      points: pins.map(p => ({ lat: p.lat, lng: p.lng })),
      center: MAP_SCOPE[scope].center,
      level: LEVEL[scope],
      settled: !!data,
    }
  }, [data, scope])

  const introPins = useMemo<IntroPin[]>(
    () =>
      (shown?.pins ?? []).map(p => ({
        lat: p.lat,
        lng: p.lng,
        kind: p.kind,
        hot: !p.soon && p.daysLeft !== null && p.daysLeft >= 0 && p.daysLeft <= 3,
      })),
    [shown],
  )

  /**
   * 옆 목록. 지도가 서 있으면 보이는 범위를 따르고, 지도를 열지 못했으면 고른 범위의
   * 공고를 마감 순으로 그대로 보여 준다 — 지도가 없다고 목록까지 비우지 않는다.
   */
  const listed = useMemo(() => {
    if (!error || !shown) return visible
    const allow = SCOPE_PROVINCES[scope]
    const pins = allow ? shown.pins.filter(p => allow.includes(p.province)) : [...shown.pins]
    return pins.sort(bySoonest)
  }, [error, shown, scope, visible])

  return (
    // 앵커(id)를 여기 두지 않는다. 이 조각은 /notices 와 /map 두 곳에 놓이는데,
    // /notices 에서는 바깥 감싸개가 이미 id="map" 을 들고 있어 한 화면에 같은
    // id 가 둘이 된다. 감싸개가 앵커를 맡고 조각은 모양만 맡는다.
    <section className={heading ? 'cs-section cs-sa-map' : 'cs-section cs-section--flush cs-sa-map'}>
      {heading && (
        <header className="cs-sa-head">
          <div className="cs-sa-head__t">
            <span className="cs-sa-kicker">Map View</span>
            <h2 className="cs-sa-h2">지도로 보는 공고</h2>
            <p className="cs-sa-sub">
              공고가 있는 곳부터 보여 드려요. 표시의 숫자는 접수 마감까지 남은 날이고, 붉은 쪽이 분양,
              푸른 쪽이 임대입니다. 지도를 움직이면 옆 목록이 보이는 범위의 공고로 바뀝니다.
            </p>
          </div>
        </header>
      )}

      <div className="cs-sa-map__console">
        <div className="cs-map__bar">
          <PillChoice
            label="범위"
            value={scope}
            onChange={v => {
              setScope(v as MapScope)
              // 첫 장면이 아직 걷히는 중이면 마저 걷고 옮긴다 — 두 움직임이 겹치지 않게
              if (intro !== 'done') {
                introTargetRef.current = null
                setSkip(n => n + 1)
              }
            }}
            items={(Object.keys(MAP_SCOPE) as MapScope[]).map(k => {
              const allow = SCOPE_PROVINCES[k]
              const n = shown
                ? allow
                  ? shown.pins.filter(p => allow.includes(p.province)).length
                  : shown.pins.length
                : undefined
              // 건수를 함께 적어 어디에 공고가 몰려 있는지 누르기 전에 보이게 한다
              return { value: k, label: k, count: n }
            })}
          />
          <div className="cs-map__legend" aria-hidden="true">
            <span className="cs-map__key">
              <i className="cs-pin cs-pin--sale cs-pin--chip" />
              분양
            </span>
            <span className="cs-map__key">
              <i className="cs-pin cs-pin--rent cs-pin--chip" />
              임대
            </span>
            <span className="cs-map__key">
              <i className="cs-pin cs-pin--rent cs-pin--approx cs-pin--chip" />
              지역 기준
            </span>

            {/* 색을 썼으면 무슨 뜻인지 적는다. 신호등이라도 밝혀 두는 편이 낫다 */}
            <span className="cs-map__days">
              <span className="cs-map__legend-day">
                <i className="cs-map__legend-dot" data-d="0" />
                오늘 마감
              </span>
              <span className="cs-map__legend-day">
                <i className="cs-map__legend-dot" data-d="1" />
                사흘 안
              </span>
              <span className="cs-map__legend-day">
                <i className="cs-map__legend-dot" data-d="2" />
                한 주 안
              </span>
            </span>
          </div>
        </div>

        {rewound && (
          <div className="cs-map__rewind" role="status" aria-live="polite">
            <span>
              <b>{dotted(day!)}</b> 기준으로 되감은 지도
              {wide ? ` · 마감 전 ${shown!.pins.filter(p => !p.soon).length}건 · 접수 예정 ${shown!.pins.filter(p => p.soon).length}건` : ' · 지난 공고를 불러오는 중'}
              {wideError && ` · ${wideError}`}
            </span>
            <span className="cs-map__rewind-note">공고 원문 일정으로 되짚은 상태 · 시작일 미기재 공고는 처음 수집한 날부터</span>
            {onToday && (
              <button type="button" className="cs-map__rewind-btn" onClick={onToday}>
                오늘로
              </button>
            )}
          </div>
        )}

        <div className="cs-map">
          {/*
            판은 하나다. 벡터 지도(MapIntro)가 먼저 서서 공고가 있는 곳으로 다가가고,
            카카오 지도가 서면 그 위에서 걷힌다. 카카오를 열지 못하면 벡터 지도가 그대로
            남아 고른 범위와 공고 위치를 보여 준다 — 회색 판이나 빈 칸을 남기지 않는다.
            같은 자리에 두어야 오류가 나도 벡터 지도가 처음부터 다시 날지 않는다.
          */}
          <div className="cs-map__stage cs-mi-stage" data-mi={error ? 'fallback' : intro}>
            {!error && <div className="cs-map__canvas" ref={host} role="application" aria-label="공고 지도" />}
            {(error || intro !== 'done') && (
              <MapIntro
                mode={error ? 'fallback' : 'intro'}
                aim={aim}
                highlight={SCOPE_SVG_IDS[scope]}
                pins={introPins}
                handoff={error ? null : handoff}
                skip={skip}
                onDone={endIntro}
              />
            )}
            {/*
              무엇을 기다리는지 두 줄로 따로 적는다 — 지도 엔진과 공고 위치는 서로 다른
              곳에서 오고, 어느 쪽이 늦는지가 보여야 기다림이 덜 막막하다.
              꾸며낸 진행률은 쓰지 않는다. 둘 다 오면 조용히 걷힌다.
            */}
            {!error && intro !== 'done' && (
              <div className="cs-map__shell" role="status" aria-live="polite" data-ready={ready || undefined}>
                <ul className="cs-map__shell-steps">
                  <li data-done={!!sdk || undefined}>
                    <i aria-hidden="true" />
                    {sdk ? '지도 엔진 준비됨' : '지도 엔진을 받는 중'}
                  </li>
                  <li data-done={!!data || undefined}>
                    <i aria-hidden="true" />
                    {data ? `공고 위치 ${data.pins.length}건 받음` : '공고 위치를 받는 중'}
                  </li>
                </ul>
              </div>
            )}
            {error && (
              <div className="cs-sa-map__why" role="status" data-mi-avoid>
                <span className="cs-vacancy__eyebrow">지도를 열지 못했습니다</span>
                <p className="cs-vacancy__title">{error}</p>
                <p className="cs-vacancy__desc">
                  {data && data.pins.length > 0
                    ? '공고 위치는 이 그림과 목록에서 보실 수 있어요.'
                    : '지도가 없어도 공고는 목록에서 전부 보실 수 있어요.'}
                </p>
              </div>
            )}
          </div>

          <aside className="cs-map__side" aria-label="보이는 범위의 공고">
            <div className="cs-map__side-head">
              <strong>보이는 범위의 공고</strong>
              <span className="cs-num">{listed.length}건</span>
            </div>
            {listed.length === 0 ? (
              <p className="cs-note" style={{ padding: '18px 16px' }}>
                {error && !data
                  ? '지도를 열지 못해 범위를 셀 수 없어요.'
                  : error && scopeCount === 0
                    ? `지금 ${scope}에는 접수 중인 공고가 없어요. 다른 범위를 눌러 보세요.`
                    : error
                      ? '지도를 열지 못해 범위를 셀 수 없어요.'
                  : !ready
                    ? '지도가 서면 보이는 범위의 공고를 마감 순으로 정리해요.'
                    : scopeCount === 0
                    ? `지금 ${scope}에는 접수 중인 공고가 없어요. 다른 범위를 눌러 보세요.`
                    : '이 범위에는 표시된 공고가 없어요. 지도를 넓히거나 범위를 바꿔 보세요.'}
              </p>
            ) : (
              <ul className="cs-map__list">
                {listed.map(p => (
                  <li key={p.id} data-hover={hovered === p.id} data-kind={p.kind.toLowerCase()}>
                    <Link
                      href={`/notices/${p.id}`}
                      onMouseEnter={() => setHovered(p.id)}
                      onMouseLeave={() => setHovered(null)}
                    >
                      <span
                        className="cs-map__dday"
                        data-d={
                          p.soon || p.daysLeft === null
                            ? undefined
                            : p.daysLeft === 0
                              ? '0'
                              : p.daysLeft <= 3
                                ? '1'
                                : p.daysLeft <= 7
                                  ? '2'
                                  : undefined
                        }
                      >
                        {p.soon ? '예정' : dday(p.daysLeft)}
                      </span>
                      <span className="cs-map__name">{p.name}</span>
                      <span className="cs-map__meta">
                        {p.province} · {p.housingType} · {priceLine(p)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </aside>
        </div>
      </div>

      {data && !rewound && (
        <p className="cs-note cs-sa-map__note">
          지도에 표시된 공고 {data.pins.length}건
          {data.geocoded > 0 && ` · 주소로 정확히 찍은 공고 ${data.geocoded}건`}
          {data.noAddress > 0 &&
            ` · 주소가 없어 지역 기준으로 표시한 공고 ${data.noAddress}건(LH 목록에는 주소 칸이 없습니다)`}
          {data.noCoord > 0 && ` · 위치를 찾지 못한 공고 ${data.noCoord}건`}.{' '}
          <Link href="/notices" className="cs-btn cs-btn--text" style={{ padding: 0 }}>
            목록에서 전체 보기
          </Link>
        </p>
      )}
    </section>
  )
}
