import { useEffect, useRef, useState } from 'react'

// Category dropdown that shows inntekt/utgift as a right-aligned badge per
// option, so two categories with the same name (one of each type) stay
// distinguishable — a native <select> can't lay out option content like this.
export default function CategoryPicker({ categories, value, onChange, placeholder = 'Velg kategori…' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef()

  useEffect(() => {
    function onOutsideClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onOutsideClick)
    return () => document.removeEventListener('mousedown', onOutsideClick)
  }, [])

  const selected = categories.find((c) => c.id === value)

  return (
    <div className="select-pop" ref={ref}>
      <button type="button" className="select-pop-trigger" onClick={() => setOpen((o) => !o)}>
        {selected ? (
          <>
            <span>{selected.name}</span>
            <span className={`badge ${selected.type === 'inntekt' ? 'badge-green' : 'badge-neutral'}`}>{selected.type}</span>
          </>
        ) : (
          <span className="select-pop-placeholder">{placeholder}</span>
        )}
      </button>
      {open && (
        <div className="select-pop-menu">
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
        </div>
      )}
    </div>
  )
}
