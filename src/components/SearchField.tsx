import { useEffect, useRef, useState } from 'react'
import { suggest, type GeoHit } from '../lib/geocode'

interface Props {
  label: string
  value: string
  onChange: (value: string) => void
}

const DEBOUNCE_MS = 400

export function SearchField({ label, value, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const [options, setOptions] = useState<GeoHit[]>([])
  const [active, setActive] = useState(-1)
  const [dirty, setDirty] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!dirty || value.trim().length < 3) {
      setOptions([])
      return
    }
    const t = setTimeout(async () => {
      const hits = await suggest(value)
      setOptions(hits)
      setOpen(hits.length > 0)
      setActive(-1)
    }, DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [value, dirty])

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const pick = (hit: GeoHit) => {
    onChange(hit.label)
    setDirty(false)
    setOpen(false)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open) return
    if (e.key === 'ArrowDown') setActive((a) => Math.min(a + 1, options.length - 1))
    else if (e.key === 'ArrowUp') setActive((a) => Math.max(a - 1, 0))
    else if (e.key === 'Enter' && active >= 0) {
      e.preventDefault()
      pick(options[active])
    } else if (e.key === 'Escape') setOpen(false)
  }

  return (
    <div className="field" ref={boxRef}>
      <label className="field-label">{label}</label>
      <input
        className="field-input"
        value={value}
        placeholder="City, address or landmark"
        autoComplete="off"
        onChange={(e) => {
          onChange(e.target.value)
          setDirty(true)
        }}
        onFocus={() => options.length > 0 && setOpen(true)}
        onKeyDown={onKeyDown}
      />
      {open && (
        <ul className="suggestions">
          {options.map((o, i) => (
            <li
              key={o.label}
              className={i === active ? 'active' : ''}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => {
                e.preventDefault()
                pick(o)
              }}
            >
              {o.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
