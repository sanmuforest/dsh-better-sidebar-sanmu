/**
 * Workbench UI state that survives a reload (phase 2 scope).
 *
 * One document per session, keyed by the session id so two conversations keep
 * their own rail widths / collapsed sections / open file. Storage is
 * `localStorage` — the native right Sidebar's layout is memory-only, so the
 * plugin owns this memory itself. Everything is validated on read: a stale or
 * hand-edited document must never break the tab.
 */
export type SectionId = 'files' | 'inspiration' | 'tasks' | 'git'

export interface WorkbenchPersisted {
  leftWidth: number
  collapsed: Partial<Record<SectionId, boolean>>
  /** Absolute paths of expanded directories in the files tree. */
  expanded: string[]
  /** The file shown in the content area (restored on reload). */
  openPath?: string
}

const KEY_PREFIX = 'dsh-better-sidebar-sanmu:workbench:'

export const LEFT_MIN = 160
export const LEFT_DEFAULT = 240
/** Keep at least this much room for the content area when dragging. */
export const RIGHT_MIN = 180

export const DEFAULT_STATE: WorkbenchPersisted = {
  leftWidth: LEFT_DEFAULT,
  // Files open by default; the other three roots start folded so the rail
  // reads as an outline rather than a wall of panels.
  collapsed: { inspiration: true, tasks: true, git: true },
  expanded: [],
}

function storageKey(sessionId: string | undefined): string {
  return `${KEY_PREFIX}${sessionId ?? 'anonymous'}`
}

export function loadWorkbench(sessionId: string | undefined): WorkbenchPersisted {
  try {
    const raw = window.localStorage.getItem(storageKey(sessionId))
    if (raw === null) return { ...DEFAULT_STATE, collapsed: { ...DEFAULT_STATE.collapsed } }
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return { ...DEFAULT_STATE, collapsed: { ...DEFAULT_STATE.collapsed } }
    const record = parsed as Partial<WorkbenchPersisted>
    const leftWidth = typeof record.leftWidth === 'number' && Number.isFinite(record.leftWidth)
      ? Math.round(record.leftWidth)
      : LEFT_DEFAULT
    const collapsed = typeof record.collapsed === 'object' && record.collapsed !== null
      ? { ...record.collapsed }
      : { ...DEFAULT_STATE.collapsed }
    const expanded = Array.isArray(record.expanded)
      ? record.expanded.filter((p): p is string => typeof p === 'string')
      : []
    return {
      leftWidth,
      collapsed,
      expanded,
      ...(typeof record.openPath === 'string' ? { openPath: record.openPath } : {}),
    }
  } catch {
    return { ...DEFAULT_STATE, collapsed: { ...DEFAULT_STATE.collapsed } }
  }
}

export function saveWorkbench(sessionId: string | undefined, value: WorkbenchPersisted): void {
  try {
    window.localStorage.setItem(storageKey(sessionId), JSON.stringify(value))
  } catch {
    // A full / disabled storage must not break the workbench: the UI state is
    // still correct for this page's lifetime.
  }
}
