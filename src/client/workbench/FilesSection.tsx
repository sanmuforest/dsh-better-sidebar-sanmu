/**
 * "Files" root of the workbench rail.
 *
 * The tree itself is the upstream explorer component (zero `ctx` coupling: it
 * talks to the plugin's `/sidebar/api` routes through the `api` singleton), so
 * the fork reuses ALL of its behaviour — lazy levels, git colouring, live
 * watch, rename/delete, upload, drag-and-drop, "open with", multi-select.
 *
 * What this wrapper adds is the workbench-specific contract:
 * - clicking a file opens it in the workbench's RIGHT column (not a native tab);
 * - an explicit "new file / new folder" entry at the top of the section, since
 *   the tree's own creation lives behind a row's context menu.
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Context } from '../../context-types.ts'
import { api } from '../api.ts'
import { FileTree } from '../FileTree.tsx'
import { createOpenInApp } from '../open-in-app.ts'
import { t } from '../locales.ts'
import type { BetterSidebarService, TabComponentProps } from '../service.ts'
import type { UploadItem } from '../upload.ts'
import css from './workbench.module.css'

export interface FilesSectionProps {
  ctx: Context
  scope: TabComponentProps['scope']
  visible: boolean
  cwd: string | undefined
  /** Directory the create buttons write into (undefined = the workspace root). */
  targetDir: string | undefined
  /** Forget the target directory and create at the workspace root again. */
  onResetTarget: () => void
  expanded: string[]
  onToggleDir: (path: string) => void
  onOpenFile: (path: string) => void
  onReferenceFile: (path: string, isDir: boolean) => void
  /** Bumped by the caller after it creates a row, so the tree re-lists. */
  refreshTick: number
  /** Called after this section mutates the tree (create / upload). */
  onMutated: () => void
}

export function FilesSection(props: FilesSectionProps): ReactNode {
  const {
    ctx, scope, visible, cwd, targetDir, onResetTarget,
    expanded, onToggleDir, onOpenFile, onReferenceFile, refreshTick, onMutated,
  } = props
  const [creating, setCreating] = useState<'file' | 'dir' | null>(null)
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  /** The workspace root itself has no rows (the tree draws nothing for it). */
  const [rootEmpty, setRootEmpty] = useState(false)
  const service = ctx.get('betterSidebar') as BetterSidebarService | undefined
  /** Host open-in-app face: supplies "打开方式 …" and "在文件管理器中显示". */
  const openInApp = useMemo(() => createOpenInApp(ctx), [ctx])
  /** Where the create buttons land: the followed directory, else the root. */
  const createIn = targetDir ?? cwd

  // An empty ROOT is the one empty state the tree cannot show by itself: it
  // renders rows, and zero rows is a blank panel. One cheap root listing keeps
  // the "nothing here yet" hint honest without duplicating the tree's cache.
  useEffect(() => {
    if (cwd === undefined || !visible) return
    const controller = new AbortController()
    void api.fsTree(scope, cwd, [], controller.signal)
      .then(listing => { setRootEmpty(listing.entries.length === 0) })
      .catch(() => { setRootEmpty(false) })
    return () => { controller.abort() }
  }, [cwd, scope, visible, refreshTick])

  const commit = useCallback(async () => {
    if (creating === null || createIn === undefined) return
    const trimmed = name.trim()
    if (trimmed === '') return
    setBusy(true)
    setError(null)
    try {
      const result = creating === 'dir'
        ? await api.fsMkdir(scope, createIn, trimmed)
        : await api.fsCreateFile(scope, createIn, trimmed)
      setCreating(null)
      setName('')
      onMutated()
      if (creating === 'file') onOpenFile(result.path)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
      setBusy(false)
    } finally {
      setBusy(false)
    }
  }, [creating, createIn, name, onMutated, onOpenFile, scope])

  const onUploadRequest = useCallback((dir: string, items: UploadItem[]) => {
    void (async () => {
      setBusy(true)
      setError(null)
      try {
        for (const item of items) {
          await api.uploadFile(scope, dir, item.relativePath, item.file)
        }
        onMutated()
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause))
      } finally {
        setBusy(false)
      }
    })()
  }, [onMutated, scope])

  return (
    <div className={css.filesSection}>
      <div className={css.toolbar}>
        <button
          type="button"
          className={css.toolButton}
          title={t('wbNewFile')}
          onClick={() => { setCreating('file'); setName('') }}
        >{t('wbNewFileShort')}</button>
        <button
          type="button"
          className={css.toolButton}
          title={t('wbNewFolder')}
          onClick={() => { setCreating('dir'); setName('') }}
        >{t('wbNewFolderShort')}</button>
        {creating !== null ? (
          <button type="button" className={css.toolButton} onClick={() => { setCreating(null); setName('') }}>
            {t('cancel')}
          </button>
        ) : null}
      </div>
      <div className={css.targetRow} title={createIn ?? ''}>
        <span className={css.targetLabel}>{t('wbCreateInto')}</span>
        <span className={css.targetPath}>{targetName(createIn, cwd)}</span>
        {targetDir !== undefined && targetDir !== cwd ? (
          <button type="button" className={css.linkButton} onClick={onResetTarget}>{t('wbBackToRoot')}</button>
        ) : null}
      </div>
      {creating !== null ? (
        <div className={css.createRow}>
          <input
            autoFocus
            className={css.createInput}
            placeholder={creating === 'dir' ? t('wbFolderName') : t('wbFileName')}
            value={name}
            onChange={event => { setName(event.target.value) }}
            onKeyDown={event => {
              if (event.key === 'Enter') { event.preventDefault(); void commit() }
              else if (event.key === 'Escape') { setCreating(null); setName('') }
            }}
            disabled={busy}
          />
        </div>
      ) : null}
      {error !== null ? <div className={css.error}>{error}</div> : null}
      {rootEmpty && cwd !== undefined && creating === null ? (
        <div className={css.empty}>
          {t('wbWorkspaceEmpty')}
        </div>
      ) : null}
      <div className={css.treeHost}>
        {cwd === undefined
          ? <div className={css.empty}>{t('wbWorkspaceNotReady')}</div>
          : (
              <FileTree
                sessionId={scope.sessionId}
                cwd={cwd}
                expanded={expanded}
                revealed={[]}
                onToggle={onToggleDir}
                onOpenFile={onOpenFile}
                onReferenceFile={onReferenceFile}
                refreshTick={refreshTick}
                onUploadRequest={onUploadRequest}
                busy={busy}
                visible={visible}
                exclude={[]}
                service={service}
                openInApp={openInApp}
                // The rail is the single scroller; a tree-owned scrollbar next
                // to it would read as doubled chrome.
                scroll={false}
              />
            )}
      </div>
    </div>
  )
}

/** Human label for the create target: root, a relative sub-path, or the raw path. */
function targetName(dir: string | undefined, root: string | undefined): string {
  if (dir === undefined) return t('wbWorkspaceNotReadyShort')
  if (root === undefined || dir === root) return t('wbWorkspaceRoot')
  const base = root.replace(/[\\/]+$/, '')
  if (dir.startsWith(base)) {
    const relative = dir.slice(base.length).replace(/^[\\/]+/, '')
    if (relative !== '') return relative.replace(/\\/g, '/')
  }
  return dir
}
