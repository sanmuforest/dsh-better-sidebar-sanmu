/**
 * Workbench tab body.
 *
 * The right column of DSH belongs to the host (upstream v0.19.0+): a tab body
 * is the plugin's only drawing surface, so this component owns the WHOLE
 * workbench layout inside one native tab:
 *
 *   ┌───────────────┬─┬───────────────────────────────┐
 *   │ 文件          │ │ content area                  │
 *   │ 灵感          │ │ (file preview / editor)       │
 *   │ 任务          │ │                               │
 *   │ Git           │ │                               │
 *   └───────────────┴─┴───────────────────────────────┘
 *
 * The four roots are independent collapsible sections; only an OPEN section
 * mounts its panel, so a folded Git/Tasks root stops polling. Rail width,
 * folded state, expanded directories and the open file persist per session
 * (see `state.ts`).
 */
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import { VscChecklist, VscFiles, VscLightbulb, VscSourceControl } from 'react-icons/vsc'
import type { TabComponentProps } from '../service.ts'
import { useSessionRoot } from '../use-session-root.ts'
import { referenceInChat } from '../reference-in-chat.ts'
import { Section } from './Section.tsx'
import { FilesSection } from './FilesSection.tsx'
import { InspirationSection } from './InspirationSection.tsx'
import { TasksSection } from './TasksSection.tsx'
import { GitSection } from './GitSection.tsx'
import { FilePane } from './FilePane.tsx'
import {
  LEFT_MIN,
  RIGHT_MIN,
  loadWorkbench,
  saveWorkbench,
  type SectionId,
  type WorkbenchPersisted,
} from './state.ts'
import css from './workbench.module.css'

function clampLeft(width: number, total: number): number {
  const ceiling = Math.max(LEFT_MIN, total - RIGHT_MIN)
  return Math.min(Math.max(Math.round(width), LEFT_MIN), ceiling)
}

const ICON_SIZE = 14

export function WorkbenchTab(props: TabComponentProps): ReactNode {
  const { ctx, store, scope, visible } = props
  const cwd = useSessionRoot(ctx, scope.sessionId, { visible })
  const root = cwd ?? scope.cwd

  const [ui, setUi] = useState<WorkbenchPersisted>(() => loadWorkbench(scope.sessionId))
  const [refreshTick, setRefreshTick] = useState(0)

  // Persist on every change: the document is tiny (a few hundred bytes) and a
  // reload must restore exactly what the reader left behind.
  useEffect(() => { saveWorkbench(scope.sessionId, ui) }, [scope.sessionId, ui])

  const rootRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef(false)
  const [dragging, setDragging] = useState(false)

  const isOpen = useCallback((id: SectionId): boolean => ui.collapsed[id] !== true, [ui.collapsed])

  const toggleSection = useCallback((id: SectionId) => {
    setUi(current => ({
      ...current,
      collapsed: { ...current.collapsed, [id]: current.collapsed[id] !== true },
    }))
  }, [])

  const toggleDir = useCallback((path: string) => {
    setUi(current => ({
      ...current,
      expanded: current.expanded.includes(path)
        ? current.expanded.filter(item => item !== path)
        : [...current.expanded, path],
    }))
  }, [])

  const openFile = useCallback((path: string) => {
    setUi(current => ({ ...current, openPath: path }))
  }, [])

  const closeFile = useCallback(() => {
    setUi(current => {
      const next = { ...current }
      delete next.openPath
      return next
    })
  }, [])

  const referenceFile = useCallback((path: string, isDir: boolean) => {
    referenceInChat(ctx, scope.sessionId, path, isDir)
  }, [ctx, scope.sessionId])

  const mutate = useCallback(() => { setRefreshTick(tick => tick + 1) }, [])

  const widthFromClientX = useCallback((clientX: number): number => {
    const rect = rootRef.current?.getBoundingClientRect()
    if (rect === undefined) return ui.leftWidth
    return clampLeft(clientX - rect.left, rect.width)
  }, [ui.leftWidth])

  const onPointerDown = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    event.preventDefault()
    draggingRef.current = true
    setDragging(true)
    event.currentTarget.setPointerCapture(event.pointerId)
  }, [])

  const onPointerMove = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return
    const width = widthFromClientX(event.clientX)
    setUi(current => (current.leftWidth === width ? current : { ...current, leftWidth: width }))
  }, [widthFromClientX])

  const endDrag = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return
    draggingRef.current = false
    setDragging(false)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }, [])

  // Keyboard parity for the splitter: a separator that only reacts to a mouse
  // is unusable without one. Arrow keys step 16px, Home/End jump to the clamps.
  const onSplitterKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    const total = rootRef.current?.getBoundingClientRect().width
    if (total === undefined) return
    let next: number | undefined
    if (event.key === 'ArrowLeft') next = ui.leftWidth - 16
    else if (event.key === 'ArrowRight') next = ui.leftWidth + 16
    else if (event.key === 'Home') next = LEFT_MIN
    else if (event.key === 'End') next = total
    if (next === undefined) return
    event.preventDefault()
    setUi(current => ({ ...current, leftWidth: clampLeft(next, total) }))
  }, [ui.leftWidth])

  const filesOpen = isOpen('files')
  const inspirationOpen = isOpen('inspiration')
  const tasksOpen = isOpen('tasks')
  const gitOpen = isOpen('git')

  return (
    <div className={css.workbench} ref={rootRef}>
      <div className={css.left} style={{ width: `${ui.leftWidth}px` }}>
        <Section
          title="文件"
          icon={<VscFiles size={ICON_SIZE} />}
          open={filesOpen}
          onToggle={() => { toggleSection('files') }}
        >
          <FilesSection
            ctx={ctx}
            scope={scope}
            visible={visible && filesOpen}
            cwd={root}
            expanded={ui.expanded}
            onToggleDir={toggleDir}
            onOpenFile={openFile}
            onReferenceFile={referenceFile}
            refreshTick={refreshTick}
            onMutated={mutate}
          />
        </Section>

        <Section
          title="灵感"
          icon={<VscLightbulb size={ICON_SIZE} />}
          open={inspirationOpen}
          onToggle={() => { toggleSection('inspiration') }}
        >
          <InspirationSection
            ctx={ctx}
            scope={scope}
            visible={visible && inspirationOpen}
            cwd={root}
            onOpenFile={openFile}
            refreshTick={refreshTick}
          />
        </Section>

        <Section
          title="任务"
          icon={<VscChecklist size={ICON_SIZE} />}
          open={tasksOpen}
          onToggle={() => { toggleSection('tasks') }}
        >
          <TasksSection ctx={ctx} store={store} scope={scope} visible={visible && tasksOpen} />
        </Section>

        <Section
          title="Git"
          icon={<VscSourceControl size={ICON_SIZE} />}
          open={gitOpen}
          onToggle={() => { toggleSection('git') }}
        >
          <GitSection ctx={ctx} store={store} scope={scope} visible={visible && gitOpen} onOpenFile={openFile} />
        </Section>
      </div>

      <div
        className={dragging ? `${css.splitter} ${css.splitterActive}` : css.splitter}
        role="separator"
        aria-orientation="vertical"
        aria-valuemin={LEFT_MIN}
        aria-valuenow={ui.leftWidth}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={onSplitterKeyDown}
      />

      <div className={css.right}>
        {ui.openPath === undefined
          ? (
              <div className={css.rightBody}>
                <div className={css.rightEmpty}>
                  内容区<br />选择文件后在此打开
                </div>
              </div>
            )
          : (
              <FilePane
                ctx={ctx}
                scope={scope}
                visible={visible}
                path={ui.openPath}
                onClose={closeFile}
              />
            )}
      </div>
    </div>
  )
}
