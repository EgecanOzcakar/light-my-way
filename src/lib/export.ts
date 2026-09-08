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

export function toICS(checkpoints: Checkpoint[]): string {
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
      `DTSTART:${start}`,
      `DURATION:PT1M`,
      `SUMMARY:${c.hazard ? '⚠ ' : ''}${c.label}${weather}`,
      'END:VEVENT',
    )
  }
  lines.push('END:VCALENDAR')
  return lines.join('\r\n')
}

export function downloadText(filename: string, mime: string, body: string): void {
  const url = URL.createObjectURL(new Blob([body], { type: mime }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
