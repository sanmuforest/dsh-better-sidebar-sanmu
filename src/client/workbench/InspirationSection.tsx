/**
 * "Inspiration" root: Markdown files in `<workspace>/.dsh-whiteboard/`.
 *
 * The directory IS the product decision: notes are plain `.md` files inside the
 * workspace, so the agent's own tools (read/write/edit, grep, `@` references)
 * can consume them with no plugin API. The panel is a thin list over the same
 * `fs.*` routes the file tree uses — creating an empty `.md` and opening it in
 * the right column is the whole feature. A mind-map plugin, when installed,
 * keeps working because these are ordinary Markdown files it can read.
 */
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import type { Context } from '../../context-types.ts'
import { api } from '../api.ts'
import { joinChild } from '../FileTree.tsx'
import type { TabComponentProps } from '../service.ts'
import css from './workbench.module.css'

/** The fixed directory, relative to the session workspace root. */
export const INSPIRATION_DIR_NAME = '.dsh-whiteboard'

export interface InspirationSectionProps {
  ctx: Context
  scope: TabComponentProps['scope']
  visible: boolean
  cwd: string | undefined
  onOpenFile: (path: string) => void
  /** Bumped when the caller wants this list re-read. */
  refreshTick: number
}

interface NoteRow {
  name: string
  path: string
}

function noteName(seq: number): string {
  const now = new Date()
  const pad = (n: number): string => String(n).padStart(2, '0')
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`
  return `灵感-${stamp}${seq > 0 ? `-${seq}` : ''}.md`
}

export function InspirationSection(props: InspirationSectionProps): ReactNode {
  const { scope, visible, cwd, onOpenFile, refreshTick } = props
  const [rows, setRows] = useState<NoteRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [draftName, setDraftName] = useState('')

  const dir = cwd === undefined ? undefined : joinChild(cwd, INSPIRATION_DIR_NAME)

  const reload = useCallback(async (signal?: AbortSignal) => {
    if (dir === undefined) return
    setLoading(true)
    setError(null)
    try {
      const listing = await api.fsTree(scope, dir, [], signal)
      const notes = listing.entries
        .filter(entry => !entry.isDir && entry.name.toLowerCase().endsWith('.md'))
        .map(entry => ({ name: entry.name, path: entry.path }))
        .sort((a, b) => b.name.localeCompare(a.name, 'zh'))
      setRows(notes)
    } catch (cause) {
      // A missing directory is the normal empty state, not an error.
      const message = cause instanceof Error ? cause.message : String(cause)
      setRows([])
      if (!/ENOENT|not found|不存在/i.test(message)) setError(message)
    } finally {
      setLoading(false)
    }
  }, [dir, scope])

  useEffect(() => {
    if (!visible) return
    const controller = new AbortController()
    void reload(controller.signal)
    return () => { controller.abort() }
  }, [reload, visible, refreshTick])

  const create = useCallback(async (rawName: string) => {
    if (cwd === undefined || dir === undefined) return
    const name = rawName.trim() === '' ? noteName(rows.length) : rawName.trim()
    const fileName = name.toLowerCase().endsWith('.md') ? name : `${name}.md`
    setCreating(false)
    setDraftName('')
    setError(null)
    try {
      try {
        await api.fsMkdir(scope, cwd, INSPIRATION_DIR_NAME)
      } catch {
        // Already there — the only expected failure.
      }
      const created = await api.fsCreateFile(scope, dir, fileName)
      onOpenFile(created.path)
      await reload()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }, [cwd, dir, onOpenFile, reload, rows.length, scope])

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
          onClick={() => { void reload() }}
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
      <div className={css.noteList}>
        {loading ? <div className={css.empty}>读取中…</div> : null}
        {!loading && rows.length === 0 ? (
          <div className={css.empty}>
            还没有灵感。<br />点「+ 新建灵感」创建第一个 .md，文件落在 <code>{INSPIRATION_DIR_NAME}/</code>。
          </div>
        ) : null}
        {rows.map(row => (
          <button
            key={row.path}
            type="button"
            className={css.noteRow}
            title={row.path}
            onClick={() => { onOpenFile(row.path) }}
          >
            <span className={css.noteGlyph} aria-hidden>▤</span>
            <span className={css.noteName}>{row.name}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
