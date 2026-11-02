/**
 * Workbench pieces that used to have no coverage at all: the persisted layout
 * document, the inspiration note naming/hygiene, the git panel's meta capture
 * and the skin contract of the rail's surface token.
 *
 * These are the failure modes that only show up after a fold, a reload or a
 * minute-boundary collision — none of them were reachable from the upstream
 * suite, because the whole `workbench/` directory is fork-only code.
 *
 * @vitest-environment jsdom
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Context } from '../src/context-types.ts'
import type { BetterSidebarService } from '../src/client/service.ts'
import { metaCapturingContext, GIT_TAB } from '../src/client/workbench/GitSection.tsx'
import { HYGIENE_BODY, noteName } from '../src/client/workbench/InspirationSection.tsx'
import {
  DEFAULT_STATE,
  LEFT_DEFAULT,
  LEFT_MIN,
  RIGHT_MIN,
  loadWorkbench,
  saveWorkbench,
  type WorkbenchPersisted,
} from '../src/client/workbench/state.ts'

const KEY = (sessionId: string): string => `dsh-better-sidebar-sanmu:workbench:${sessionId}`

const defaults = (): WorkbenchPersisted => ({
  ...DEFAULT_STATE,
  collapsed: { ...DEFAULT_STATE.collapsed },
  expanded: [...DEFAULT_STATE.expanded],
})

describe('workbench persisted state', () => {
  beforeEach(() => { window.localStorage.clear() })

  it('answers the documented defaults for a session that never saved', () => {
    expect(loadWorkbench('s1')).toEqual(defaults())
    expect(loadWorkbench(undefined)).toEqual(defaults())
  })

  it('keeps a valid document', () => {
    const saved: WorkbenchPersisted = {
      leftWidth: 320,
      collapsed: { git: false },
      expanded: ['/ws/src'],
      openPath: '/ws/src/a.ts',
    }
    saveWorkbench('s1', saved)
    expect(loadWorkbench('s1')).toEqual(saved)
  })

  it('falls back instead of throwing on a corrupt or foreign document', () => {
    window.localStorage.setItem(KEY('s1'), 'not json at all')
    expect(loadWorkbench('s1')).toEqual(defaults())
    window.localStorage.setItem(KEY('s1'), '"a string"')
    expect(loadWorkbench('s1')).toEqual(defaults())
    // Per-field validation: a hand-edited document must never break the tab.
    window.localStorage.setItem(KEY('s1'), JSON.stringify({
      leftWidth: 'wide',
      collapsed: 'nope',
      expanded: ['/a', 7, null],
      openPath: 42,
    }))
    expect(loadWorkbench('s1')).toEqual({
      leftWidth: LEFT_DEFAULT,
      collapsed: { ...DEFAULT_STATE.collapsed },
      expanded: ['/a'],
    })
  })

  it('keeps the rail clamps useful', () => {
    expect(LEFT_MIN).toBeLessThan(LEFT_DEFAULT)
    expect(RIGHT_MIN).toBeGreaterThan(0)
  })
})

describe('inspiration notes', () => {
  it('stamps seconds so two notes in one minute do not collide', () => {
    // Minute precision was the bug: the second create reported "already exists".
    const first = noteName(new Date(2026, 10, 2, 21, 5, 7))
    const second = noteName(new Date(2026, 10, 2, 21, 5, 8))
    expect(first).toBe('灵感-20261102-210507.md')
    expect(first).not.toBe(second)
  })

  it('zero-pads every field', () => {
    expect(noteName(new Date(2026, 0, 3, 4, 5, 6))).toBe('灵感-20260103-040506.md')
  })

  it('ignores the whole notes directory in git', () => {
    // The hygiene file exists so `.dsh-whiteboard/` never shows up as untracked
    // changes; `*` is what makes that true for notes added later.
    expect(HYGIENE_BODY.trimEnd().split('\n').at(-1)).toBe('*')
  })
})

describe('git panel meta capture', () => {
  const makeContext = (): { ctx: Context; updateTab: ReturnType<typeof vi.fn> } => {
    const updateTab = vi.fn()
    const service = { updateTab } as unknown as BetterSidebarService
    const ctx = {
      get: (name: string) => (name === 'betterSidebar' ? service : undefined),
    } as unknown as Context
    return { ctx, updateTab }
  }

  it('remembers a patch for the synthetic tab instead of dropping it', () => {
    // `service.updateTab('workbench:git', …)` is a documented no-op upstream:
    // the id is in neither the store nor the native surface. Without capture the
    // lens / bottom tab / pane height reset on every fold.
    const { ctx, updateTab } = makeContext()
    const seen: unknown[] = []
    const scoped = metaCapturingContext(ctx, GIT_TAB.id, meta => { seen.push(meta) })
    const service = scoped.get('betterSidebar') as unknown as BetterSidebarService
    service.updateTab(GIT_TAB.id, { meta: { lens: 'session' } })
    expect(seen).toEqual([{ lens: 'session' }])
    expect(updateTab).not.toHaveBeenCalled()
  })

  it('forwards every other patch and every other service untouched', () => {
    const { ctx, updateTab } = makeContext()
    const scoped = metaCapturingContext(ctx, GIT_TAB.id, () => {})
    const service = scoped.get('betterSidebar') as unknown as BetterSidebarService
    // A different tab id: the real service must see it.
    service.updateTab('native-id', { title: 'Renamed' }, 'session-1')
    expect(updateTab).toHaveBeenCalledWith('native-id', { title: 'Renamed' }, 'session-1')
    // A patch without meta for our own id: also forwarded (title/path edits).
    service.updateTab(GIT_TAB.id, { title: 'Git' })
    expect(updateTab).toHaveBeenCalledWith(GIT_TAB.id, { title: 'Git' }, undefined)
    // Unknown services keep resolving to whatever the real context returns.
    expect(scoped.get('sidebarRight')).toBeUndefined()
  })
})

describe('workbench skin contract', () => {
  it('does not consume the app-chrome sidebar token', () => {
    // `--dsw-specific-sidebar-fill` is overridden by skin systems to restyle the
    // app's own left-nav column (glass/transparent); a panel using it loses its
    // fill or clashes with the label tokens. See sidebar.module.css §Shell.
    // Read through cwd rather than import.meta.url: under jsdom that URL is an
    // http one, which readFileSync refuses. Comments are stripped first — a
    // comment may name the token while explaining why it is banned.
    const css = readFileSync(resolve(process.cwd(), 'src/client/workbench/workbench.module.css'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
    expect(css).not.toContain('--dsw-specific-sidebar-fill')
  })
})
