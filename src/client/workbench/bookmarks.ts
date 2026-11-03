/**
 * Bookmark storage for the browser launcher.
 *
 * The host's Browser tab is host chrome: its address bar exposes no plugin
 * slot, so a star INSIDE that bar is impossible without patching DSH. What the
 * host does expose is its own persisted tab snapshots
 * (`localStorage['dsh.sidebar-browser.v1']`: `{ byTab: { [tabId]: { entries,
 * index, … } } }`), which this module reads — read-only — so "收藏当前页" can
 * offer the pages the reader already has open.
 *
 * Bookmarks themselves live in this plugin's own localStorage document and
 * are plain `{ id, title, url }` records capped at a sane size.
 */
export interface Bookmark {
  id: string
  title: string
  url: string
}

const STORAGE_KEY = 'dsh-better-sidebar-sanmu:bookmarks:v1'
/** The host browser's persisted snapshot document (read-only on our side). */
const HOST_BROWSER_KEY = 'dsh.sidebar-browser.v1'
const MAX_BOOKMARKS = 200

/** A stable-enough id for a bookmark (no crypto dependency needed). */
function newId(): string {
  return `bm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

/**
 * Canonicalise what the reader typed into a browser address. Returns null for
 * anything the host browser would refuse (it only loads HTTP(S)).
 */
export function normalizeBookmarkUrl(raw: string): string | null {
  const trimmed = raw.trim()
  if (trimmed === '') return null
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  try {
    const url = new URL(withScheme)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    if (url.hostname === '') return null
    return url.toString()
  } catch {
    return null
  }
}

/** A display title for a freshly collected URL: its host + path tail. */
export function titleForUrl(url: string): string {
  try {
    const parsed = new URL(url)
    const path = parsed.pathname === '/' ? '' : parsed.pathname
    const title = `${parsed.hostname}${path}`
    return title.length > 60 ? `${title.slice(0, 59)}…` : title
  } catch {
    return url
  }
}

export function loadBookmarks(): Bookmark[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw === null) return []
    const parsed: unknown = JSON.parse(raw)
    const list = Array.isArray(parsed)
      ? parsed
      : (typeof parsed === 'object' && parsed !== null && Array.isArray((parsed as { items?: unknown }).items)
          ? (parsed as { items: unknown[] }).items
          : [])
    const items: Bookmark[] = []
    for (const entry of list) {
      if (typeof entry !== 'object' || entry === null) continue
      const record = entry as Partial<Bookmark>
      if (typeof record.title !== 'string' || typeof record.url !== 'string') continue
      const url = normalizeBookmarkUrl(record.url)
      if (url === null) continue
      items.push({
        id: typeof record.id === 'string' && record.id !== '' ? record.id : newId(),
        title: record.title.trim() === '' ? titleForUrl(url) : record.title,
        url,
      })
      if (items.length >= MAX_BOOKMARKS) break
    }
    return items
  } catch {
    return []
  }
}

export function saveBookmarks(items: readonly Bookmark[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ items: items.slice(0, MAX_BOOKMARKS) }))
  } catch {
    // A full/disabled storage must not break the bar.
  }
}

export function createBookmark(title: string, url: string): Bookmark {
  return { id: newId(), title: title.trim() === '' ? titleForUrl(url) : title.trim(), url }
}

interface PersistedBrowserState {
  entries?: unknown
  index?: unknown
}

/**
 * Every page the reader currently has open in the host browser, most useful
 * first (deduped, HTTP(S) only). Read-only: the host store is written by the
 * host browser itself; this never mutates it.
 *
 * The host's `defineStore({ persist })` may keep the document under the bare
 * key or under a per-session suffix, so every key sharing the prefix is read
 * and merged rather than guessing one exact key.
 */
export function openBrowserPages(): string[] {
  try {
    const pages: string[] = []
    const keys: string[] = []
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index)
      if (key !== null && key.startsWith(HOST_BROWSER_KEY)) keys.push(key)
    }
    for (const key of keys) {
      const raw = window.localStorage.getItem(key)
      if (raw === null) continue
      let parsed: unknown
      try {
        parsed = JSON.parse(raw)
      } catch {
        continue
      }
      if (typeof parsed !== 'object' || parsed === null) continue
      const container = parsed as { byTab?: unknown; state?: { byTab?: unknown } }
      const byTab = (container.byTab ?? container.state?.byTab) as Record<string, PersistedBrowserState> | undefined
      if (byTab === undefined || byTab === null || typeof byTab !== 'object') continue
      for (const state of Object.values(byTab)) {
        if (typeof state !== 'object' || state === null) continue
        const { entries, index } = state
        if (!Array.isArray(entries) || typeof index !== 'number' || index < 0) continue
        const current = entries[index]
        if (typeof current !== 'string') continue
        const normalized = normalizeBookmarkUrl(current)
        if (normalized === null || pages.includes(normalized)) continue
        pages.push(normalized)
      }
    }
    return pages
  } catch {
    return []
  }
}
