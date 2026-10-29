/**
 * One collapsible root of the workbench rail.
 *
 * The whole header is the toggle (a real <button> so keyboard users get the
 * same affordance), and the body only mounts while open: the Git and Tasks
 * panels poll, and an unfolded root must not keep polling out of sight.
 */
import type { ReactNode } from 'react'
import css from './workbench.module.css'

export interface SectionProps {
  title: string
  icon: ReactNode
  open: boolean
  onToggle: () => void
  /** Extra controls rendered at the right end of the header (e.g. "new file"). */
  actions?: ReactNode
  children?: ReactNode
}

export function Section(props: SectionProps): ReactNode {
  const { title, icon, open, onToggle, actions, children } = props
  return (
    <section className={css.section}>
      <div className={css.sectionHead}>
        <button
          type="button"
          className={css.sectionToggle}
          aria-expanded={open}
          title={title}
          onClick={onToggle}
        >
          <span className={open ? `${css.chevron} ${css.chevronOpen}` : css.chevron} aria-hidden>▸</span>
          <span className={css.sectionIcon} aria-hidden>{icon}</span>
          <span className={css.sectionTitle}>{title}</span>
        </button>
        {open && actions !== undefined ? <div className={css.sectionActions}>{actions}</div> : null}
      </div>
      {open ? <div className={css.sectionBody}>{children}</div> : null}
    </section>
  )
}
