/**
 * The workbench content body: load a file through `fs.read`, then hand it to the
 * upstream CodeMirror viewer (`TextEditor`).
 *
 * `TextEditor` is the plugin's "code" viewer — the same component a native tab
 * renders — so the workbench inherits syntax highlighting, Markdown/HTML
 * preview, JSONL cards, the large-file paged preview, dirty tracking, the
 * `Mod-s` keymap and the mtime-based `fs-conflict` save protection.
 *
 * `toolbar: 'host'` is the merged-header mode `EditorHost` itself uses: the
 * viewer stops drawing its own toolbar and reports `EditorToolbarState` /
 * `EditorToolbarControls` upward, so the workbench header owns the mode toggle
 * and the save button while the editor keeps the behaviour.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import type { Context } from '../../context-types.ts'
import { api, type FsReadResult } from '../api.ts'
import { baseName } from '../FileTree.tsx'
import { TextEditor } from '../TextEditor.tsx'
import type {
  EditorToolbarControls,
  EditorToolbarState,
  TabComponentProps,
} from '../service.ts'
import css from './workbench.module.css'

export interface EditorPaneProps {
  ctx: Context
  store: TabComponentProps['store']
  scope: TabComponentProps['scope']
  visible: boolean
  path: string
  /** The read finished: hand the toolbar state to the header. */
  onToolbarState: (state: EditorToolbarState | null) => void
  /** The viewer registered its header commands (null on unmount). */
  onToolbarControls: (controls: EditorToolbarControls | null) => void
}

type Load =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; result: FsReadResult }

export function EditorPane(props: EditorPaneProps): ReactNode {
  const { ctx, store, scope, visible, path, onToolbarState, onToolbarControls } = props
  const [load, setLoad] = useState<Load>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const scopeRef = useRef(scope)
  scopeRef.current = scope

  const reload = useCallback(() => { setAttempt(n => n + 1) }, [])

  useEffect(() => {
    const controller = new AbortController()
    setLoad({ status: 'loading' })
    onToolbarState(null)
    void api.fsRead(scopeRef.current, path, controller.signal)
      .then(result => { setLoad({ status: 'ready', result }) })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return
        setLoad({ status: 'error', message: cause instanceof Error ? cause.message : String(cause) })
      })
    return () => { controller.abort() }
  }, [path, scope.sessionId, scope.cwd, attempt, onToolbarState])

  if (load.status === 'loading') return <div className={css.empty}>读取中…</div>
  if (load.status === 'error') {
    return (
      <div className={css.error}>
        无法读取 {path}
        <br />
        {load.message}
        <br />
        <button type="button" className={css.toolButton} onClick={reload}>重新读取</button>
      </div>
    )
  }
  if (load.result.kind === 'binary') {
    return <div className={css.empty}>二进制文件（{formatBytes(load.result.size)}），暂不支持在工作台内编辑。</div>
  }
  if (load.result.kind === 'too-large') {
    return <div className={css.empty}>文件过大（{formatBytes(load.result.size)}），暂不支持在工作台内打开。</div>
  }

  return (
    <div className={css.editorHost}>
      <TextEditor
        ctx={ctx}
        store={store}
        scope={scope}
        path={path}
        title={baseName(path)}
        viewerId="code"
        content={load.result.content}
        size={load.result.size}
        mtimeMs={load.result.mtimeMs}
        visible={visible}
        toolbar="host"
        onToolbarState={onToolbarState}
        onToolbarControls={onToolbarControls}
        onReload={reload}
      />
    </div>
  )
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
