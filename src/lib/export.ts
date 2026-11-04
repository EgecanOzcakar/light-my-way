import type { Checkpoint, RouteResult } from '../types'

export function toJSON(checkpoints: Checkpoint[], route: RouteResult): string {
  return JSON.stringify(
    {
      distanceM: route.distanceM,
      durationS: route.durationS,
      approximate: route.approximate,
      checkpoints,
    },
    null,
    2,
  )
}

const csvCell = (v: string | number): string => {
  const s = String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCSV(checkpoints: Checkpoint[]): string {
  const header = 'time,label,kind,tempC,precipMm,hazard'
  const rows = checkpoints.map((c) =>
    [
      c.etaISO,
      csvCell(c.label),
      c.kind,
      c.weather?.tempC ?? '',
      c.weather?.precipMm ?? '',
      c.hazard,
    ].join(','),
  )
  return [header, ...rows].join('\n')
}

const icsDate = (iso: string): string => iso.replace(/[-:]/g, '').replace(/\.\d{3}/, '')

/** RFC 5545 §3.3.11 TEXT escaping. */
export const icsEscape = (s: string): string =>
  s.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')

const utf8 = new TextEncoder()

/** RFC 5545 §3.1 line folding: max 75 octets per line, never splitting a UTF-8 sequence. */
export function icsFold(line: string): string {
  const out: string[] = []
  let cur = ''
  let octets = 0
  for (const ch of line) {
    const n = utf8.encode(ch).length
    if (octets + n > 75) {
      out.push(cur)
      cur = ' '
      octets = 1
    }
    cur += ch
    octets += n
  }
  out.push(cur)
  return out.join('\r\n')
}

export function toICS(checkpoints: Checkpoint[], now: Date = new Date()): string {
  const stamp = icsDate(now.toISOString())
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//light-my-way//route schedule//EN',
  ]
  for (const c of checkpoints) {
    const start = icsDate(new Date(c.etaISO).toISOString())
    const weather = c.weather ? ` ${c.weather.icon} ${Math.round(c.weather.tempC)}C ${c.weather.precipMm}mm` : ''
    lines.push(
      'BEGIN:VEVENT',
      `UID:${c.id}-${start}@light-my-way`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${start}`,
      `DURATION:PT1M`,
      `SUMMARY:${icsEscape(`${c.hazard ? '⚠ ' : ''}${c.label}${weather}`)}`,
      'END:VEVENT',
    )
  }
  lines.push('END:VCALENDAR')
  return lines.map(icsFold).join('\r\n') + '\r\n'
}

export function downloadText(filename: string, mime: string, body: string): void {
  const url = URL.createObjectURL(new Blob([body], { type: mime }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  // Revoking synchronously can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
