/**
 * Workbench tab body (phase 1 skeleton).
 *
 * The right column of DSH belongs to the host (v0.19.0+ of the upstream
 * plugin): a tab body is the plugin's only drawing surface. This component
 * therefore owns the WHOLE workbench layout inside one native tab:
 *
 *   ┌───────────────┬─┬───────────────────────────────┐
 *   │ left rail     │ │ content area                  │
 *   │ (four roots)  │ │ (editor / preview)            │
 *   └───────────────┴─┴───────────────────────────────┘
 *
 * Phase 1 renders the shell only: the left rail is an empty placeholder and
 * the content area shows an empty state. The splitter is fully interactive
 * (pointer drag + keyboard arrows) and its width is local state for now —
 * phase 4 persists it per session.
 */
import { useCallback, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import css from './workbench.module.css'

const LEFT_MIN = 160
const LEFT_DEFAULT = 240
/** Keep at least this much room for the content area when dragging. */
const RIGHT_MIN = 180

/** Clamp the left rail against both the floor and the remaining width. */
function clampLeft(width: number, total: number): number {
  const ceiling = Math.max(LEFT_MIN, total - RIGHT_MIN)
  return Math.min(Math.max(Math.round(width), LEFT_MIN), ceiling)
}

export function WorkbenchTab(): ReactNode {
  const rootRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef(false)
  const [leftWidth, setLeftWidth] = useState(LEFT_DEFAULT)
  const [dragging, setDragging] = useState(false)

  const widthFromClientX = useCallback((clientX: number): number => {
    const rect = rootRef.current?.getBoundingClientRect()
    if (rect === undefined) return LEFT_DEFAULT
    return clampLeft(clientX - rect.left, rect.width)
  }, [])

  const onPointerDown = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    event.preventDefault()
    draggingRef.current = true
    setDragging(true)
    event.currentTarget.setPointerCapture(event.pointerId)
  }, [])

  const onPointerMove = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return
    setLeftWidth(widthFromClientX(event.clientX))
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
  // is unusable without one. Arrow keys step 16px, Home/End jump to the
  // clamps.
  const onSplitterKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    const total = rootRef.current?.getBoundingClientRect().width
    if (total === undefined) return
    let next: number | undefined
    if (event.key === 'ArrowLeft') next = leftWidth - 16
    else if (event.key === 'ArrowRight') next = leftWidth + 16
    else if (event.key === 'Home') next = LEFT_MIN
    else if (event.key === 'End') next = total
    if (next === undefined) return
    event.preventDefault()
    setLeftWidth(clampLeft(next, total))
  }, [leftWidth])

  return (
    <div className={css.workbench} ref={rootRef}>
      <div className={css.left} style={{ width: `${leftWidth}px` }}>
        <div className={css.leftTitle}>Workbench</div>
        <div className={css.leftBody}>
          <div className={css.empty}>折叠容器（阶段二接入四组根项目）</div>
        </div>
      </div>
      <div
        className={dragging ? `${css.splitter} ${css.splitterActive}` : css.splitter}
        role="separator"
        aria-orientation="vertical"
        aria-valuemin={LEFT_MIN}
        aria-valuenow={leftWidth}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={onSplitterKeyDown}
      />
      <div className={css.right}>
        <div className={css.rightHead} />
        <div className={css.rightBody}>
          <div className={css.rightEmpty}>内容区<br />选择文件后在此打开</div>
        </div>
      </div>
    </div>
  )
}
