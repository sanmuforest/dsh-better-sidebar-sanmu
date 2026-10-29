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
import { VscChecklist, VscFiles, VscLightbulb, VscSourceControl } from 'react-icons/vsc'
import type { TabComponentProps, EditorToolbarControls, EditorToolbarState } from '../service.ts'
import { baseName } from '../FileTree.tsx'
import { useSessionRoot } from '../use-session-root.ts'
import { referenceInChat } from '../reference-in-chat.ts'
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
  /** The unsaved-changes dialog is waiting for the editor to finish saving. */
  const saveThenActRef = useRef(false)
  const [saveError, setSaveError] = useState<string | null>(null)
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

  /** Perform a confirmed pending action (switch file / close the editor). */
  const performPending = useCallback((action: PendingAction) => {
    setPending(undefined)
    setSaveError(null)
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
  }, [landOn])

  /** "不保存": drop the edits and continue. */
  const discardPending = useCallback(() => {
    saveThenActRef.current = false
    if (pending !== undefined) performPending(pending)
  }, [pending, performPending])

  const cancelPending = useCallback(() => {
    saveThenActRef.current = false
    setPending(undefined)
    setSaveError(null)
  }, [])

  /** "保存": save through the editor, then continue once it reports clean. */
  const savePending = useCallback(() => {
    if (controlsRef.current === null) {
      setSaveError('当前文件不支持保存（编辑器未就绪）。')
      return
    }
    saveThenActRef.current = true
    setSaveError(null)
    controlsRef.current.save()
  }, [])

  // Continue a save-then-act once the editor reports the document clean.
  // A failed save keeps the dialog open with the reason instead of switching.
  useEffect(() => {
    if (!saveThenActRef.current || pending === undefined || toolbar === null) return
    if (toolbar.saveState === 'failed') {
      saveThenActRef.current = false
      setSaveError('保存失败：文件可能已在磁盘上被修改，请先处理冲突。')
      return
    }
    if (toolbar.dirty === false) {
      saveThenActRef.current = false
      performPending(pending)
    }
  }, [toolbar, pending, performPending])

  const referenceFile = useCallback((path: string, isDir: boolean) => {
    referenceInChat(ctx, scope.sessionId, path, isDir)
  }, [ctx, scope.sessionId])

  const mutate = useCallback(() => { setRefreshTick(tick => tick + 1) }, [])

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

  // Ctrl/Cmd+S anywhere in the workbench saves the open file. The editor's own
  // keymap handles the focused case and marks the event handled; this listener
  // covers focus outside CodeMirror (the rail, the header) and never double-saves.
  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent): void => {
      // A parked body keeps its listeners: only the tab the reader is LOOKING
      // at may claim the shortcut.
      if (!visible) return
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 's') return
      if (event.defaultPrevented || toolbar?.editable !== true) return
      event.preventDefault()
      controlsRef.current?.save()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => { document.removeEventListener('keydown', onKeyDown) }
  }, [toolbar?.editable, visible])

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
            {toolbar?.dirty === true
              ? <span className={css.unsavedMark} title="有未保存的修改" aria-label="有未保存的修改">*</span>
              : null}
          </span>
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
                  title={toolbar.saveState === 'failed'
                    ? '保存失败：文件可能已在磁盘上被修改，请处理冲突后重试'
                    : '保存 (Ctrl/Cmd+S)'}
                  onClick={() => { controlsRef.current?.save() }}
                >{saveLabel}</button>
              )
            : null}
          {ui.openPath !== undefined
            ? <button type="button" className={css.iconButton} title="关闭文件" onClick={requestClose}>×</button>
            : null}
        </div>
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

      {pending !== undefined ? (
        <div className={css.modalOverlay}>
          <div className={css.modal} role="dialog" aria-modal="true" aria-label="有未保存的修改">
            <div className={css.modalTitle}>有未保存的修改</div>
            <div className={css.modalText}>
              「{ui.openPath === undefined ? '' : baseName(ui.openPath)}」还有未保存的修改。
            </div>
            {saveError !== null ? <div className={css.error}>{saveError}</div> : null}
            <div className={css.modalActions}>
              <button type="button" className={css.modalButton} onClick={cancelPending}>取消</button>
              <button type="button" className={css.modalButton} onClick={discardPending}>不保存</button>
              <button type="button" className={css.modalPrimary} onClick={savePending}>保存</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}