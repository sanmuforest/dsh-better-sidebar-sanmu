/**
 * "Git" root: the upstream Source-Control page embedded in the rail.
 *
 * `ChangesTab` is a built-in TAB BODY in the upstream plugin, but its whole
 * contract is the `TabComponentProps` it receives — so the workbench hands it a
 * synthetic tab record and lets it keep its own polling, diff preview and
 * commit flow. The error boundary keeps a Git failure inside this section
 * instead of blanking the workbench.
 */
import type { ReactNode } from 'react'
import { ChangesTab } from '../changes/ChangesTab.tsx'
import { RenderBoundary } from '../RenderBoundary.tsx'
import type { SidebarTab } from '../state.ts'
import type { TabComponentProps } from '../service.ts'
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

export function GitSection(props: GitSectionProps): ReactNode {
  const { ctx, store, scope, visible, onOpenFile } = props
  return (
    <div className={css.embedHost}>
      <RenderBoundary className={css.panelBoundary}>
        <ChangesTab
          ctx={ctx}
          store={store}
          scope={scope}
          tab={GIT_TAB}
          visible={visible}
          onOpenFile={onOpenFile}
        />
      </RenderBoundary>
    </div>
  )
}
