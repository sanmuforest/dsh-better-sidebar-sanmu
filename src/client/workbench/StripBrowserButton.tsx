/**
 * The browser launcher that lives in the workbench TAB CHIP (the strip), not
 * in the editor header.
 *
 * The right column's tab strip is host chrome: the only per-type extension
 * point is the chip title (`sidebar.right.pane.tab.title`), so this button
 * renders inside the chip and stops its own pointer events from activating the
 * tab. It opens the host's `browser` kind — a desktop-profile feature; when
 * that kind is absent the button reports it instead of failing silently.
 */
import { useCallback, useState, type ReactNode } from 'react'
import { VscGlobe } from 'react-icons/vsc'
import type { Context } from '../../context-types.ts'
import css from './workbench.module.css'

/** The host right-Sidebar controller slice this button needs. */
interface BrowserOpener {
  openTab(kind: string, options?: { params?: unknown; revealIfOpened?: boolean; preferNewPane?: boolean }): void
}

/** The event surface both a click and a keyboard activation provide. */
interface LauncherEvent {
  preventDefault: () => void
  stopPropagation: () => void
}

export function StripBrowserButton(props: { ctx: Context }): ReactNode {
  const { ctx } = props
  const [error, setError] = useState<string | null>(null)

  const open = useCallback((event: LauncherEvent) => {
    // The chip's wrapper activates the tab on click; a launcher must not.
    event.preventDefault()
    event.stopPropagation()
    let controller: BrowserOpener | undefined
    try {
      controller = ctx.get('sidebarRight') as unknown as BrowserOpener | undefined
    } catch {
      controller = undefined
    }
    if (controller === undefined) {
      setError('当前部署没有浏览器页签（browser kind 仅在 desktop profile 挂载）')
      return
    }
    try {
      controller.openTab('browser', { params: {} })
      setError(null)
    } catch (cause) {
      setError(`打开浏览器失败：${cause instanceof Error ? cause.message : String(cause)}`)
    }
  }, [ctx])

  return (
    // A span (not a button): the chip itself is an interactive tab capsule, and
    // nested interactive elements are invalid and swallow clicks unevenly.
    <span
      role="button"
      tabIndex={0}
      className={css.chipAction}
      title={error ?? '新建浏览器标签'}
      aria-label="新建浏览器标签"
      onClick={open}
      onPointerDown={(event) => { event.stopPropagation() }}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return
        event.preventDefault()
        event.stopPropagation()
        open(event)
      }}
    >
      {error === null ? <VscGlobe size={13} /> : <span className={css.chipWarn} aria-hidden>!</span>}
    </span>
  )
}
