/**
 * The workbench's right column (phase 2: read-only preview).
 *
 * Phase 3 replaces the body with the upstream CodeMirror `TextEditor`; this
 * component already owns the pieces that survive that swap — loading through
 * `fs.read`, the file header, the close action and the error/notice states —
 * so the editor lands as a body replacement, not a rewrite.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { Context } from '../../context-types.ts'
import { api, type FsReadResult } from '../api.ts'
import type { TabComponentProps } from '../service.ts'
import { baseName } from '../FileTree.tsx'
import css from './workbench.module.css'

/** Characters rendered in the read-only phase-2 preview. */
const PREVIEW_LIMIT = 200_000

export interface FilePaneProps {
  ctx: Context
  scope: TabComponentProps['scope']
  visible: boolean
  path: string
  onClose: () => void
}

type Load =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; result: FsReadResult }

export function FilePane(props: FilePaneProps): ReactNode {
  const { scope, path, onClose } = props
  const [load, setLoad] = useState<Load>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  // The service call needs the live scope, but the effect must not restart
  // because the host handed a fresh (structurally equal) scope object on a
  // re-render: depending on the object identity alone can loop forever and
  // leave the pane on "读取中…".
  const scopeRef = useRef(scope)
  scopeRef.current = scope

  // Load on mount and whenever the path changes — deliberately NOT gated on
  // `visible`: the host keeps every visited tab body mounted, and a body it
  // currently reports as parked must still show the file the reader clicked.
  // (The file tree loads the same way; gating here was what left the pane
  // stuck on "读取中…".)
  useEffect(() => {
    const controller = new AbortController()
    setLoad({ status: 'loading' })
    void api.fsRead(scopeRef.current, path, controller.signal)
      .then(result => { setLoad({ status: 'ready', result }) })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return
        setLoad({ status: 'error', message: cause instanceof Error ? cause.message : String(cause) })
      })
    return () => { controller.abort() }
  }, [path, scope.sessionId, scope.cwd, attempt])

  return (
    <div className={css.filePane}>
      <div className={css.fileHead}>
        <span className={css.fileName} title={path}>{baseName(path)}</span>
        <button type="button" className={css.iconButton} title="关闭" onClick={onClose}>×</button>
      </div>
      <div className={css.fileBody}>
        {load.status === 'loading' ? <div className={css.empty}>读取中…</div> : null}
        {load.status === 'error' ? (
          <div className={css.error}>
            无法读取 {path}
            <br />
            {load.message}
            <br />
            <button type="button" className={css.toolButton} onClick={() => { setAttempt(n => n + 1) }}>重新读取</button>
          </div>
        ) : null}
        {load.status === 'ready' && load.result.kind === 'binary'
          ? <div className={css.empty}>二进制文件（{formatBytes(load.result.size)}），暂不支持在预览中打开。</div>
          : null}
        {load.status === 'ready' && load.result.kind === 'too-large'
          ? <div className={css.empty}>文件过大（{formatBytes(load.result.size)}），已在右侧折叠；编辑能力将在后续阶段接入。</div>
          : null}
        {load.status === 'ready' && load.result.kind === 'text' ? (
          load.result.content.length === 0
            ? <div className={css.empty}>空文件（0 B）—— 编辑与保存将在阶段三接入。</div>
            : load.result.content.length > PREVIEW_LIMIT
              ? (
                  <>
                    <div className={css.fileNotice}>文件较大，预览截断到前 {formatBytes(PREVIEW_LIMIT)}。</div>
                    <pre className={css.fileText}>{load.result.content.slice(0, PREVIEW_LIMIT)}</pre>
                  </>
                )
              : <pre className={css.fileText}>{load.result.content}</pre>
        ) : null}
      </div>
    </div>
  )
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
