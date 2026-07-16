import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

// Category dropdown that shows inntekt/utgift as a right-aligned badge per
// option, so two categories with the same name (one of each type) stay
// distinguishable — a native <select> can't lay out option content like this.
//
// The menu is portaled to <body> and positioned/sized against the remaining
// viewport space (flips upward and shrinks its max-height near an edge)
// instead of being an absolutely-positioned child of the trigger — inside a
// scrollable modal that meant a long list pushed the modal itself taller
// than the viewport, forcing the whole modal to scroll instead of just the
// option list.
export default function CategoryPicker({ categories, value, onChange, placeholder = 'Velg kategori…' }) {
  const [open, setOpen] = useState(false)
  const [menuStyle, setMenuStyle] = useState(null)
  const triggerRef = useRef()
  const menuRef = useRef()

  useEffect(() => {
    function onOutsideClick(e) {
      if (triggerRef.current?.contains(e.target) || menuRef.current?.contains(e.target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onOutsideClick)
    return () => document.removeEventListener('mousedown', onOutsideClick)
  }, [])

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return

    function reposition() {
      const rect = triggerRef.current.getBoundingClientRect()
      const margin = 8
      const spaceBelow = window.innerHeight - rect.bottom - margin
      const spaceAbove = rect.top - margin
      const openUpward = spaceBelow < 160 && spaceAbove > spaceBelow
      const maxHeight = Math.max(120, Math.min(280, openUpward ? spaceAbove : spaceBelow))
      setMenuStyle({
        position: 'fixed',
        left: rect.left,
        width: rect.width,
        maxHeight,
        ...(openUpward ? { bottom: window.innerHeight - rect.top + 4 } : { top: rect.bottom + 4 }),
      })
    }

    reposition()
    window.addEventListener('resize', reposition)
    window.addEventListener('scroll', reposition, true)
    return () => {
      window.removeEventListener('resize', reposition)
      window.removeEventListener('scroll', reposition, true)
    }
  }, [open])

  const selected = categories.find((c) => c.id === value)

  return (
    <div className="select-pop">
      <button type="button" className="select-pop-trigger" ref={triggerRef} onClick={() => setOpen((o) => !o)}>
        {selected ? (
          <>
            <span>{selected.name}</span>
            <span className={`badge ${selected.type === 'inntekt' ? 'badge-green' : 'badge-neutral'}`}>{selected.type}</span>
          </>
        ) : (
          <span className="select-pop-placeholder">{placeholder}</span>
        )}
      </button>
      {open && menuStyle && createPortal(
        <div className="select-pop-menu" style={menuStyle} ref={menuRef}>
          {categories.map((c) => (
            <button
              type="button"
              key={c.id}
              className="select-pop-option"
              onClick={() => { onChange(c.id); setOpen(false) }}
            >
              <span>{c.name}</span>
              <span className={`badge ${c.type === 'inntekt' ? 'badge-green' : 'badge-neutral'}`}>{c.type}</span>
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  )
}
