// Parsing of the `ls -l` output some scripts return (busybox)

export interface LsEntry {
  path: string
  size: string
  /** Date as printed by ls */
  date: string
  /** Date as a timestamp, for sorting */
  time: number
}

const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Date of ls -l: "Jan 31 12:34" (this year) or "Jan 31 2023" */
function lsTime(month: string, day: string, timeOrYear: string): number {
  const m = months.indexOf(month)
  if (m < 0) return 0
  const now = new Date()
  if (timeOrYear.includes(':')) {
    const [h, min] = timeOrYear.split(':').map(Number)
    const d = new Date(now.getFullYear(), m, Number(day), h, min)
    // ls shows the time for the last 6 months: a future date is from last year
    if (d.getTime() > now.getTime() + 86400_000) d.setFullYear(d.getFullYear() - 1)
    return d.getTime()
  }
  return new Date(Number(timeOrYear), m, Number(day)).getTime()
}

/** Lines of `ls -l`: permissions links owner group size month day time path */
export function parseLs(text: string): LsEntry[] {
  const entries: LsEntry[] = []
  for (const line of text.split('\n')) {
    const parts = line.trim().split(/\s+/)
    if (parts.length < 9) continue
    entries.push({
      path: parts.slice(8).join(' '),
      size: parts[4],
      date: `${parts[5]} ${parts[6]} ${parts[7]}`,
      time: lsTime(parts[5], parts[6], parts[7]),
    })
  }
  return entries
}
