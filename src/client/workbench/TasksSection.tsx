/**
 * "Tasks" root: the upstream task-management page (subagent topology, team
 * board, background-job drawer) embedded in the rail.
 *
 * `SubagentView` takes exactly the session/ctx/store it needs and runs its own
 * visibility-gated feeds, so the section just hands them over inside an error
 * boundary.
 */
import type { ReactNode } from 'react'
import { RenderBoundary } from '../RenderBoundary.tsx'
import { SubagentView } from '../SubagentView.tsx'
import type { TabComponentProps } from '../service.ts'
import css from './workbench.module.css'

export interface TasksSectionProps {
  ctx: TabComponentProps['ctx']
  store: TabComponentProps['store']
  scope: TabComponentProps['scope']
  visible: boolean
}

export function TasksSection(props: TasksSectionProps): ReactNode {
  const { ctx, store, scope, visible } = props
  return (
    <div className={css.embedHost}>
      <RenderBoundary className={css.panelBoundary}>
        <SubagentView
          sessionId={scope.sessionId}
          active={visible}
          ctx={ctx}
          store={store}
        />
      </RenderBoundary>
    </div>
  )
}
