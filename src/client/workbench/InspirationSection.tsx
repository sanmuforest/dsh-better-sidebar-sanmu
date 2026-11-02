/**
 * "Inspiration" root: the `<workspace>/.dsh-whiteboard/` folder, shown with the
 * SAME tree the Files root uses.
 *
 * The directory is the product decision: notes are ordinary `.md` files inside
 * the workspace, so the agent's own tools (read/write/edit, grep, `@` refs) can
 * consume them with no plugin API. Rendering the upstream `FileTree` here (not
 * a bespoke list) is what gives this root the full row menu — open with, reveal
 * in the OS file manager, copy path, rename, delete, upload, new file/folder,
 * "reference in chat" — with zero duplicated menu code.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Context } from '../../context-types.ts'
import { api } from '../api.ts'
import { FileTree } from '../FileTree.tsx'
import { createOpenInApp } from '../open-in-app.ts'
import type { BetterSidebarService, TabComponentProps } from '../service.ts'
import type { UploadItem } from '../upload.ts'
import css from './workbench.module.css'

/** The fixed directory, relative to the session workspace root. */
export const INSPIRATION_DIR_NAME = '.dsh-whiteboard'

export interface InspirationSectionProps {
  ctx: Context
  scope: TabComponentProps['scope']
  visible: boolean
  cwd: string | undefined
  onOpenFile: (path: string) => void
  onReferenceFile: (path: string, isDir: boolean) => void
  /** Bumped by the caller when the workspace moves. */
  refreshTick: number
}

/**
 * The name of a new note: `灵感-YYYYMMDD-HHmmss.md`.
 *
 * Seconds are part of the stamp because two notes created inside the same
 * minute used to collide outright — the create call then reported "already
 * exists" and the reader got nothing.
 */
export function noteName(now: Date = new Date()): string {
  const pad = (n: number): string => String(n).padStart(2, '0')
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`
    + `-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  return `灵感-${stamp}.md`
}

/**
 * Join one child onto a workspace path using the SAME separator dialect the
 * host reports. The tree indexes levels by the exact path string the host
 * echoes back, so a client-built `/` on Windows (`…\DSH测试/.dsh-whiteboard`)
 * never matches the host's `…\DSH测试\.dsh-whiteboard` and the level stays on
 * "加载中…" forever.
 */
function childOf(root: string, name: string): string {
  const base = root.replace(/[\\/]+$/, '')
  const separator = base.includes('\\') ? '\\' : '/'
  return `${base}${separator}${name}`
}

/** The hygiene file's body: these are personal drafts, not project sources. */
export const HYGIENE_BODY = '# 由 dsh-better-sidebar-sanmu 创建：灵感笔记属于个人草稿，不进入 Git。\n*\n'

/**
 * Write `.dsh-whiteboard/.gitignore` once per directory, so notes never show up
 * as untracked changes in the Git root. An existing file is left untouched (the
 * reader may have edited it), and a failure is ignored: a read-only workspace
 * still gets working notes, just with the Git noise.
 */
async function ensureHygiene(scope: TabComponentProps['scope'], dir: string): Promise<void> {
  const path = childOf(dir, '.gitignore')
  try {
    await api.fsRead(scope, path)
    return
  } catch {
    // Missing (the expected case) or unreadable: try to create it.
  }
  try {
    await api.fsWrite(scope, path, HYGIENE_BODY, null)
  } catch {
    // Read-only workspace or a race with another writer: not worth a banner.
  }
}

export function InspirationSection(props: InspirationSectionProps): ReactNode {
  const { ctx, scope, visible, cwd, onOpenFile, onReferenceFile, refreshTick } = props
  const dir = cwd === undefined ? undefined : childOf(cwd, INSPIRATION_DIR_NAME)
  const [expanded, setExpanded] = useState<string[]>([])
  const [localTick, setLocalTick] = useState(0)
  const [creating, setCreating] = useState(false)
  const [draftName, setDraftName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [rootEmpty, setRootEmpty] = useState(false)
  const service = ctx.get('betterSidebar') as BetterSidebarService | undefined
  const openInApp = useMemo(() => createOpenInApp(ctx), [ctx])
  /** Directory whose hygiene file this mount already handled (one probe per dir). */
  const hygieneDir = useRef<string | null>(null)

  // The folder must exist before the tree lists it: create-on-demand, then ask
  // whether it has rows so the empty state can explain what this root is for.
  useEffect(() => {
    if (dir === undefined || cwd === undefined || !visible) return
    const controller = new AbortController()
    void (async () => {
      try {
        await api.fsMkdir(scope, cwd, INSPIRATION_DIR_NAME)
      } catch {
        // Already there — the only expected failure.
      }
      if (hygieneDir.current !== dir) {
        hygieneDir.current = dir
        void ensureHygiene(scope, dir)
      }
      try {
        const listing = await api.fsTree(scope, dir, [], controller.signal)
        setRootEmpty(listing.entries.length === 0)
      } catch {
        if (!controller.signal.aborted) setRootEmpty(true)
      }
    })()
    return () => { controller.abort() }
  }, [cwd, dir, scope, visible, refreshTick, localTick])

  const toggleDir = useCallback((path: string) => {
    setExpanded(current => current.includes(path)
      ? current.filter(item => item !== path)
      : [...current, path])
  }, [])

  const onUploadRequest = useCallback((uploadDir: string, items: UploadItem[]) => {
    void (async () => {
      setBusy(true)
      setError(null)
      try {
        for (const item of items) {
          await api.uploadFile(scope, uploadDir, item.relativePath, item.file)
        }
        setLocalTick(tick => tick + 1)
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause))
      } finally {
        setBusy(false)
      }
    })()
  }, [scope])

  const create = useCallback(async (rawName: string) => {
    if (cwd === undefined || dir === undefined) return
    const trimmed = rawName.trim()
    const fileName = trimmed === ''
      ? noteName()
      : (trimmed.toLowerCase().endsWith('.md') ? trimmed : `${trimmed}.md`)
    setCreating(false)
    setDraftName('')
    setError(null)
    try {
      try {
        await api.fsMkdir(scope, cwd, INSPIRATION_DIR_NAME)
      } catch {
        // Already there.
      }
      const created = await api.fsCreateFile(scope, dir, fileName)
      onOpenFile(created.path)
      setLocalTick(tick => tick + 1)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }, [cwd, dir, onOpenFile, scope])

  return (
    <div className={css.inspirationSection}>
      <div className={css.toolbar}>
        <button
          type="button"
          className={css.toolButton}
          title="新建灵感"
          onClick={() => { setCreating(true); setDraftName('') }}
        >+ 新建灵感</button>
        <button
          type="button"
          className={css.toolButton}
          title="刷新"
          onClick={() => { setLocalTick(tick => tick + 1) }}
        >刷新</button>
      </div>
      {creating ? (
        <div className={css.createRow}>
          <input
            autoFocus
            className={css.createInput}
            placeholder="灵感名称（可留空自动命名）"
            value={draftName}
            onChange={event => { setDraftName(event.target.value) }}
            onKeyDown={event => {
              if (event.key === 'Enter') { event.preventDefault(); void create(draftName) }
              else if (event.key === 'Escape') { setCreating(false); setDraftName('') }
            }}
          />
        </div>
      ) : null}
      {error !== null ? <div className={css.error}>{error}</div> : null}
      {rootEmpty && creating === false ? (
        <div className={css.empty}>
          还没有灵感。<br />点「+ 新建灵感」创建第一个 .md，文件落在 <code>{INSPIRATION_DIR_NAME}/</code>。
        </div>
      ) : null}
      <div className={css.treeHost}>
        {dir === undefined
          ? <div className={css.empty}>工作区尚未就绪</div>
          : (
              <FileTree
                sessionId={scope.sessionId}
                cwd={dir}
                expanded={expanded}
                revealed={[]}
                onToggle={toggleDir}
                onOpenFile={onOpenFile}
                onReferenceFile={onReferenceFile}
                refreshTick={refreshTick + localTick}
                onUploadRequest={onUploadRequest}
                busy={busy}
                visible={visible}
                exclude={[]}
                service={service}
                openInApp={openInApp}
                scroll={false}
              />
            )}
      </div>
    </div>
  )
}
