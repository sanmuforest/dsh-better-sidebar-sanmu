/**
 * The workbench's right column (phase 2: read-only preview).
 *
 * Phase 3 replaces the body with the upstream CodeMirror `TextEditor`; this
 * component already owns the pieces that survive that swap — loading through
 * `fs.read`, the file header, the close action and the error/notice states —
 * so the editor lands as a body replacement, not a rewrite.
 */
import { useEffect, useState, type ReactNode } from 'react'
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
  const { scope, visible, path, onClose } = props
  const [load, setLoad] = useState<Load>({ status: 'loading' })

  useEffect(() => {
    if (!visible) return
    const controller = new AbortController()
    setLoad({ status: 'loading' })
    void api.fsRead(scope, path, controller.signal)
      .then(result => { setLoad({ status: 'ready', result }) })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return
        setLoad({ status: 'error', message: cause instanceof Error ? cause.message : String(cause) })
      })
    return () => { controller.abort() }
  }, [path, scope, visible])

  return (
    <div className={css.filePane}>
      <div className={css.fileHead}>
        <span className={css.fileName} title={path}>{baseName(path)}</span>
        <button type="button" className={css.iconButton} title="关闭" onClick={onClose}>×</button>
      </div>
      <div className={css.fileBody}>
        {load.status === 'loading' ? <div className={css.empty}>读取中…</div> : null}
        {load.status === 'error' ? <div className={css.error}>{load.message}</div> : null}
        {load.status === 'ready' && load.result.kind === 'binary'
          ? <div className={css.empty}>二进制文件（{formatBytes(load.result.size)}），暂不支持在预览中打开。</div>
          : null}
        {load.status === 'ready' && load.result.kind === 'too-large'
          ? <div className={css.empty}>文件过大（{formatBytes(load.result.size)}），已在右侧折叠；编辑能力将在后续阶段接入。</div>
          : null}
        {load.status === 'ready' && load.result.kind === 'text' ? (
          load.result.content.length > PREVIEW_LIMIT
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
