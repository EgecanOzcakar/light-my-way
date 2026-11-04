interface Props {
  label: string
  value: string
  onChange: (value: string) => void
}

/**
 * Plain text field. No as-you-type autocomplete: Nominatim's usage policy
 * forbids it, so places are geocoded only when the route is calculated.
 */
export function SearchField({ label, value, onChange }: Props) {
  return (
    <div className="field">
      <label className="field-label">{label}</label>
      <input
        className="field-input"
        value={value}
        placeholder="City, address or landmark"
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}
