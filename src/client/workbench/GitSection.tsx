/**
 * "Git" root: the upstream Source-Control page embedded in the rail.
 *
 * `ChangesTab` is a built-in TAB BODY in the upstream plugin, but its whole
 * contract is the `TabComponentProps` it receives — so the workbench hands it a
 * synthetic tab record and lets it keep its own polling, diff preview and
 * commit flow. The error boundary keeps a Git failure inside this section
 * instead of blanking the workbench.
 *
 * The synthetic record is also why this file owns a small `ctx` shim:
 * `ChangesTab` persists its lens / bottom tab / pane height through
 * `service.updateTab(tab.id, { meta })`, and that call is a documented no-op for
 * an id that lives in neither the sidebar store nor the native surface. Without
 * the shim, folding this root remounted the body and `ChangesTab` re-seeded its
 * state from an empty `tab.meta`, silently dropping those choices.
 */
import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { ChangesTab } from '../changes/ChangesTab.tsx'
import { RenderBoundary } from '../RenderBoundary.tsx'
import type { Context } from '../../context-types.ts'
import type { SidebarTab } from '../state.ts'
import type { BetterSidebarService, TabComponentProps } from '../service.ts'
import css from './workbench.module.css'

/** The synthetic record the embedded Git page renders against. */
export const GIT_TAB: SidebarTab = {
  id: 'workbench:git',
  type: 'git',
  title: 'Git',
} as SidebarTab

export interface GitSectionProps {
  ctx: TabComponentProps['ctx']
  store: TabComponentProps['store']
  scope: TabComponentProps['scope']
  visible: boolean
  onOpenFile: (path: string) => void
}

/** Two meta patches that would render the same panel need no extra render. */
function sameMeta(left: unknown, right: unknown): boolean {
  if (left === right) return true
  try {
    return JSON.stringify(left) === JSON.stringify(right)
  } catch {
    return false
  }
}

/**
 * A `ctx` whose `get('betterSidebar')` returns a service that remembers THIS
 * panel's meta instead of forwarding the patch to a tab id nothing knows.
 *
 * Everything else is forwarded to the real context, so the embedded page keeps
 * behaving exactly as it does inside a native tab.
 */
export function metaCapturingContext(
  ctx: Context,
  tabId: string,
  onMeta: (meta: unknown) => void,
): Context {
  const service = ctx.get('betterSidebar') as unknown as BetterSidebarService | undefined
  if (service === undefined) return ctx
  const intercept: BetterSidebarService = {
    ...service,
    updateTab: (id, patch, sessionId) => {
      if (id === tabId && patch.meta !== undefined) {
        onMeta(patch.meta)
        return
      }
      service.updateTab(id, patch, sessionId)
    },
  }
  return new Proxy(ctx, {
    get(target, property, receiver) {
      if (property !== 'get') return Reflect.get(target, property, receiver)
      return (name: string): unknown => (name === 'betterSidebar' ? intercept : target.get(name))
    },
  }) as Context
}

export function GitSection(props: GitSectionProps): ReactNode {
  const { ctx, store, scope, visible, onOpenFile } = props
  const [meta, setMeta] = useState<unknown>(undefined)
  const remember = useCallback((next: unknown) => {
    setMeta((current: unknown) => (sameMeta(current, next) ? current : next))
  }, [])
  const scopedCtx = useMemo(() => metaCapturingContext(ctx, GIT_TAB.id, remember), [ctx, remember])
  const tab = useMemo(
    () => (meta === undefined ? GIT_TAB : ({ ...GIT_TAB, meta } as SidebarTab)),
    [meta],
  )
  return (
    <div className={css.embedHost}>
      <RenderBoundary className={css.panelBoundary}>
        <ChangesTab
          ctx={scopedCtx}
          store={store}
          scope={scope}
          tab={tab}
          visible={visible}
          onOpenFile={onOpenFile}
        />
      </RenderBoundary>
    </div>
  )
}
