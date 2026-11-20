import { useRef, type KeyboardEvent, type ReactNode } from 'react'

export type TabItem = { key: string; label: ReactNode; ariaLabel?: string }

type Props = {
  label: string
  items: TabItem[]
  selected: string
  onSelect: (key: string) => void
  idPrefix: string
  panelId: string
  className?: string
  tabClassName?: string
}

/** WAI-ARIA tabs: one tab stop, arrow keys / Home / End move and select. */
export function Tabs({ label, items, selected, onSelect, idPrefix, panelId, className = 'tabs', tabClassName = 'tab' }: Props) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])

  const go = (i: number) => {
    const n = items.length
    const j = ((i % n) + n) % n
    onSelect(items[j].key)
    refs.current[j]?.focus()
  }

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const to: Record<string, number> = {
      ArrowRight: i + 1, ArrowDown: i + 1, ArrowLeft: i - 1, ArrowUp: i - 1, Home: 0, End: items.length - 1,
    }
    if (!(e.key in to)) return
    e.preventDefault()
    go(to[e.key])
  }

  return (
    <div className={className} role="tablist" aria-label={label}>
      {items.map((it, i) => {
        const isSel = it.key === selected
        return (
          <button
            key={it.key}
            ref={el => { refs.current[i] = el }}
            id={`${idPrefix}-${it.key}`}
            role="tab"
            type="button"
            className={tabClassName}
            aria-selected={isSel}
            aria-controls={panelId}
            aria-label={it.ariaLabel}
            tabIndex={isSel ? 0 : -1}
            onClick={() => onSelect(it.key)}
            onKeyDown={e => onKeyDown(e, i)}
          >
            {it.label}
          </button>
        )
      })}
    </div>
  )
}

export const tabId = (idPrefix: string, key: string) => `${idPrefix}-${key}`
