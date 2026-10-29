/**
 * Workbench tab body.
 *
 * The right column of DSH belongs to the host (upstream v0.19.0+): a tab body
 * is the plugin's only drawing surface, so this component owns the WHOLE
 * workbench layout inside one native tab:
 *
 *   ┌───────────────┬─┬───────────────────────────────┐
 *   │ 文件          │ │ header: file · mode · save · 🌐 │
 *   │ 灵感          │ ├───────────────────────────────┤
 *   │ 任务          │ │ editor / preview              │
 *   │ Git           │ │                               │
 *   └───────────────┴─┴───────────────────────────────┘
 *
 * The four roots are independent collapsible sections; only an OPEN section
 * mounts its panel, so a folded Git/Tasks root stops polling. The header is
 * stable across files: it carries the current file name, the editor's merged
 * toolbar (mode toggle + save, reported by the upstream CodeMirror viewer) and
 * the browser launcher. Rail width, folded state, expanded directories and the
 * open file persist per session (see `state.ts`).
 */
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import { VscChecklist, VscFiles, VscGlobe, VscLightbulb, VscSourceControl } from 'react-icons/vsc'
import type { TabComponentProps, EditorToolbarControls, EditorToolbarState } from '../service.ts'
import { baseName } from '../FileTree.tsx'
import { useSessionRoot } from '../use-session-root.ts'
import { referenceInChat } from '../reference-in-chat.ts'
import { ConfirmDialog } from '../ui/index.ts'
import { Section } from './Section.tsx'
import { FilesSection } from './FilesSection.tsx'
import { InspirationSection } from './InspirationSection.tsx'
import { TasksSection } from './TasksSection.tsx'
import { GitSection } from './GitSection.tsx'
import { EditorPane } from './EditorPane.tsx'
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

/** The directory part of an absolute path in either separator dialect. */
function parentDir(path: string): string {
  const cut = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  return cut > 0 ? path.slice(0, cut) : path
}

/** What a pending "unsaved changes" confirmation is about to do. */
type PendingAction = { kind: 'open'; path: string } | { kind: 'close' }

const ICON_SIZE = 14

/** The host right-Sidebar controller slice the browser launcher needs. */
interface BrowserOpener {
  openTab(kind: string, options?: { params?: unknown; revealIfOpened?: boolean; preferNewPane?: boolean }): void
}

export function WorkbenchTab(props: TabComponentProps): ReactNode {
  const { ctx, store, scope, visible } = props
  const cwd = useSessionRoot(ctx, scope.sessionId, { visible })
  const root = cwd ?? scope.cwd

  const [ui, setUi] = useState<WorkbenchPersisted>(() => loadWorkbench(scope.sessionId))
  const [refreshTick, setRefreshTick] = useState(0)
  /** Editor toolbar state reported by the upstream viewer (null: no editor). */
  const [toolbar, setToolbar] = useState<EditorToolbarState | null>(null)
  const controlsRef = useRef<EditorToolbarControls | null>(null)
  const [pending, setPending] = useState<PendingAction | undefined>(undefined)
  const [browserError, setBrowserError] = useState<string | null>(null)
  /** Directory the rail's "+ 文件 / + 文件夹" buttons create into. */
  const [createDir, setCreateDir] = useState<string | undefined>(undefined)

  // Persist on every change: the document is tiny (a few hundred bytes) and a
  // reload must restore exactly what the reader left behind.
  useEffect(() => { saveWorkbench(scope.sessionId, ui) }, [scope.sessionId, ui])

  const rootRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef(false)
  const [dragging, setDragging] = useState(false)

  // Keep the rail inside the panel: a width dragged on a wider window must not
  // squeeze the content area to zero when the panel comes back narrower.
  useEffect(() => {
    const element = rootRef.current
    if (element === null) return
    const observer = new ResizeObserver(() => {
      const width = element.getBoundingClientRect().width
      if (width <= 0) return
      setUi(current => {
        const next = clampLeft(current.leftWidth, width)
        return next === current.leftWidth ? current : { ...current, leftWidth: next }
      })
    })
    observer.observe(element)
    return () => { observer.disconnect() }
  }, [])

  const isOpen = useCallback((id: SectionId): boolean => ui.collapsed[id] !== true, [ui.collapsed])

  const toggleSection = useCallback((id: SectionId) => {
    setUi(current => ({
      ...current,
      collapsed: { ...current.collapsed, [id]: current.collapsed[id] !== true },
    }))
  }, [])

  const toggleDir = useCallback((path: string) => {
    setUi(current => {
      const open = current.expanded.includes(path)
      if (!open) setCreateDir(path)
      return {
        ...current,
        expanded: open
          ? current.expanded.filter(item => item !== path)
          : [...current.expanded, path],
      }
    })
  }, [])

  /** Actually land on a file (no dirty check — callers do that). */
  const landOn = useCallback((path: string) => {
    setCreateDir(parentDir(path))
    setToolbar(null)
    setUi(current => ({ ...current, openPath: path }))
  }, [])

  /** Open a file, asking first when the current editor has unsaved edits. */
  const requestOpen = useCallback((path: string) => {
    if (path === ui.openPath) return
    if (toolbar?.dirty === true) {
      setPending({ kind: 'open', path })
      return
    }
    landOn(path)
  }, [landOn, toolbar?.dirty, ui.openPath])

  const requestClose = useCallback(() => {
    if (ui.openPath === undefined) return
    if (toolbar?.dirty === true) {
      setPending({ kind: 'close' })
      return
    }
    setToolbar(null)
    setUi(current => {
      const next = { ...current }
      delete next.openPath
      return next
    })
  }, [toolbar?.dirty, ui.openPath])

  const confirmPending = useCallback(() => {
    const action = pending
    setPending(undefined)
    if (action === undefined) return
    setToolbar(null)
    if (action.kind === 'open') {
      landOn(action.path)
      return
    }
    setUi(current => {
      const next = { ...current }
      delete next.openPath
      return next
    })
  }, [landOn, pending])

  const referenceFile = useCallback((path: string, isDir: boolean) => {
    referenceInChat(ctx, scope.sessionId, path, isDir)
  }, [ctx, scope.sessionId])

  const mutate = useCallback(() => { setRefreshTick(tick => tick + 1) }, [])

  /** Open the host's own Browser tab (desktop profile only; absent on web). */
  const openBrowser = useCallback(() => {
    let controller: BrowserOpener | undefined
    try {
      controller = ctx.get('sidebarRight') as unknown as BrowserOpener | undefined
    } catch {
      controller = undefined
    }
    if (controller === undefined) {
      setBrowserError('当前部署没有提供浏览器页签（browser kind 仅在 desktop profile 挂载）。')
      return
    }
    try {
      controller.openTab('browser', { params: {} })
      setBrowserError(null)
    } catch (cause) {
      setBrowserError(`打开浏览器失败：${cause instanceof Error ? cause.message : String(cause)}`)
    }
  }, [ctx])

  const onToolbarState = useCallback((state: EditorToolbarState | null) => { setToolbar(state) }, [])
  const onToolbarControls = useCallback((controls: EditorToolbarControls | null) => {
    controlsRef.current = controls
  }, [])

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

  const saveLabel = toolbar?.saveState === 'saving'
    ? '保存中…'
    : toolbar?.saveState === 'failed'
      ? '保存失败'
      : toolbar?.dirty === true ? '保存' : '已保存'

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
            targetDir={createDir}
            onResetTarget={() => { setCreateDir(undefined) }}
            expanded={ui.expanded}
            onToggleDir={toggleDir}
            onOpenFile={requestOpen}
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
            onOpenFile={requestOpen}
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
          <GitSection ctx={ctx} store={store} scope={scope} visible={visible && gitOpen} onOpenFile={requestOpen} />
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
        <div className={css.editorHead}>
          <span className={css.fileName} title={ui.openPath ?? ''}>
            {ui.openPath === undefined ? '工作台' : baseName(ui.openPath)}
          </span>
          {toolbar?.dirty === true ? <span className={css.dirtyDot} title="有未保存的修改">●</span> : null}
          <span className={css.headSpacer} />
          {toolbar?.modes === true && toolbar.mode === 'edit'
            ? <button type="button" className={css.headButton} onClick={() => { controlsRef.current?.setMode('preview') }}>预览</button>
            : null}
          {toolbar?.modes === true && toolbar.mode === 'preview'
            ? <button type="button" className={css.headButton} onClick={() => { controlsRef.current?.setMode('edit') }}>编辑</button>
            : null}
          {toolbar?.editable === true
            ? (
                <button
                  type="button"
                  className={css.headButton}
                  disabled={toolbar.saveState === 'saving'}
                  title="保存 (Ctrl/Cmd+S)"
                  onClick={() => { controlsRef.current?.save() }}
                >{saveLabel}</button>
              )
            : null}
          <button type="button" className={css.iconButton} title="新建浏览器标签" onClick={openBrowser}>
            <VscGlobe size={15} />
          </button>
          {ui.openPath !== undefined
            ? <button type="button" className={css.iconButton} title="关闭文件" onClick={requestClose}>×</button>
            : null}
        </div>
        {browserError !== null ? (
          <div className={css.error}>
            {browserError}
            <button type="button" className={css.linkButton} onClick={() => { setBrowserError(null) }}>知道了</button>
          </div>
        ) : null}
        {ui.openPath === undefined
          ? (
              <div className={css.rightBody}>
                <div className={css.rightEmpty}>
                  内容区<br />从左侧选择文件开始编辑
                </div>
              </div>
            )
          : (
              <EditorPane
                key={ui.openPath}
                ctx={ctx}
                store={store}
                scope={scope}
                visible={visible}
                path={ui.openPath}
                onToolbarState={onToolbarState}
                onToolbarControls={onToolbarControls}
              />
            )}
      </div>

      <ConfirmDialog
        open={pending !== undefined}
        title="有未保存的修改"
        description="当前文件还有未保存的修改，继续会丢弃它们。"
        confirmLabel="丢弃并继续"
        cancelLabel="取消"
        danger
        onConfirm={confirmPending}
        onClose={() => { setPending(undefined) }}
      />
    </div>
  )
}
