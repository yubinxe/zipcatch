'use client'

import { useSyncExternalStore } from 'react'

/**
 * 비교 담기 — 화면을 옮겨 다녀도 고른 공고가 남는다.
 *
 * 브라우저에만 둔다(이 기기 · 이 사람의 편의). 저장이 막힌 창(사생활 보호 모드 등)에서도
 * 지금 화면 안에서는 동작하도록 메모리에 먼저 두고, 저장은 될 때만 한다.
 */

export interface TrayItem {
  id: string
  name: string
}

export const TRAY_MAX = 3
const KEY = 'zc:compare'
const EMPTY: TrayItem[] = []

let items: TrayItem[] = EMPTY
let loaded = false
const listeners = new Set<() => void>()

function load() {
  if (loaded || typeof window === 'undefined') return
  loaded = true
  try {
    const raw = JSON.parse(window.localStorage.getItem(KEY) ?? '[]')
    if (Array.isArray(raw)) {
      items = raw
        .filter(x => x && typeof x.id === 'string' && typeof x.name === 'string')
        .slice(0, TRAY_MAX)
    }
  } catch {
    /* 읽지 못하면 빈 채로 */
  }
  window.addEventListener('storage', e => {
    if (e.key !== KEY) return
    loaded = false
    load()
    emit()
  })
}

function emit() {
  for (const l of listeners) l()
}

function save(next: TrayItem[]) {
  items = next
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    /* 저장이 막혀도 이 화면에서는 쓴다 */
  }
  emit()
}

export function trayAdd(item: TrayItem): boolean {
  load()
  if (items.some(i => i.id === item.id)) return true
  if (items.length >= TRAY_MAX) return false
  save([...items, item])
  return true
}

export function trayRemove(id: string) {
  load()
  save(items.filter(i => i.id !== id))
}

export function trayToggle(item: TrayItem): boolean {
  load()
  if (items.some(i => i.id === item.id)) {
    trayRemove(item.id)
    return true
  }
  return trayAdd(item)
}

export function trayClear() {
  save(EMPTY)
}

function subscribe(l: () => void) {
  load()
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

export function useCompareTray(): TrayItem[] {
  return useSyncExternalStore(
    subscribe,
    () => {
      load()
      return items
    },
    () => EMPTY,
  )
}

/** 담은 공고로 여는 비교 화면 주소 */
export function compareHref(list: TrayItem[]) {
  return `/compare?ids=${list.map(i => i.id).join(',')}`
}
