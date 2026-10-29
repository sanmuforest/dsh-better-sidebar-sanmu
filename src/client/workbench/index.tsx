/**
 * The `workbench` tab descriptor: the one page this fork adds on top of the
 * upstream sidebar. It registers through the SAME `ctx.betterSidebar` service
 * every external plugin uses, so the service contract stays untouched
 * (decision B of the workbench plan).
 *
 * The host turns every descriptor into a native right-Sidebar tab type
 * (`kind === descriptor.id`), so the descriptor must declare a title, an icon
 * and a one-line description for DSH's new-tab guide.
 */
import type { ReactNode } from 'react'
import { isZh } from '../locales.ts'
import { IconPanelBottomOutline16 } from '../icons.tsx'
import type { TabDescriptor } from '../service.ts'
import { WorkbenchTab } from './WorkbenchTab.tsx'

/** The tab type id; also the native `kind` the host registers. */
export const WORKBENCH_TAB_ID = 'workbench'

export function workbenchTab(): TabDescriptor {
  return {
    id: WORKBENCH_TAB_ID,
    title: () => (isZh() ? '工作台' : 'Workbench'),
    description: () => (isZh()
      ? '文件、灵感、任务与 Git 四栏，右侧固定编辑区'
      : 'Files, inspiration, tasks and Git on the left, editor on the right'),
    icon: (size: number): ReactNode => <IconPanelBottomOutline16 size={size} />,
    // Sit next to the built-in pages (files = 10, git = 20, tasks = 30) so the
    // workbench is easy to find in the + menu without displacing them.
    order: 15,
    // One workbench per session: reopening focuses the existing tab.
    single: true,
    component: WorkbenchTab,
  }
}
