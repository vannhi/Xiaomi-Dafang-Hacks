// Access to the CGI backend of the camera (firmware_mod/www/cgi-bin)
//
// The backend scripts parse parameters with func.cgi, so requests are sent exactly
// like jQuery did: application/x-www-form-urlencoded, spaces encoded as '+'.

export type Params = Record<string, string | number | boolean | undefined>

// Absolute paths: the UI can be served from any folder of the web root
export const CGI = '/cgi-bin/'
export const VIEWER = '/viewer/'

export function encodeParams(params: Params): string {
  return Object.entries(params)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(String(v)).replace(/%20/g, '+'))
    .join('&')
}

export function cgiUrl(script: string, params: Params = {}): string {
  const query = encodeParams(params)
  return CGI + script + (query ? '?' + query : '')
}

async function check(res: Response): Promise<Response> {
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return res
}

export async function get(script: string, params: Params = {}, signal?: AbortSignal): Promise<string> {
  const res = await fetch(cgiUrl(script, params), { cache: 'no-store', signal })
  return (await check(res)).text()
}

/**
 * Call a script that answers errors with an HTTP status and a plain text message
 * (ui_config.cgi): the message becomes the error
 */
export async function call(script: string, params: Params, init: RequestInit = {}): Promise<string> {
  const res = await fetch(cgiUrl(script, params), { cache: 'no-store', ...init })
  const text = await res.text()
  if (!res.ok) {
    const plain = res.headers.get('Content-Type')?.startsWith('text/plain')
    throw new Error(plain && text.trim() ? text.trim() : `${res.status} ${res.statusText}`)
  }
  return text
}

export async function post(script: string, params: Params, query: Params = {}): Promise<string> {
  const res = await fetch(cgiUrl(script, query), {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
    body: encodeParams(params),
  })
  return (await check(res)).text()
}

/**
 * Parse the "key#:#value" lines returned by the get_config commands.
 * A line without separator continues the value of the previous key
 * (multi-line values such as several DNS servers or SSH keys).
 */
export function parseKV(text: string): Record<string, string> {
  const result: Record<string, string> = {}
  let last: string | undefined
  for (const line of text.split('\n')) {
    const sep = line.indexOf('#:#')
    if (sep >= 0) {
      last = line.slice(0, sep)
      result[last] = line.slice(sep + 3)
    } else if (last !== undefined && line !== '') {
      result[last] += '\n' + line
    }
  }
  return result
}

/** Parse "key:value" lines, e.g. the status_all switches */
export function parseColon(text: string): Record<string, string> {
  const result: Record<string, string> = {}
  for (const line of text.split('\n')) {
    const sep = line.indexOf(':')
    if (sep > 0) result[line.slice(0, sep).trim()] = line.slice(sep + 1).trim()
  }
  return result
}

export interface Option {
  value: string
  label: string
}

/** Parse the <option> list some commands return (time zones, OSD fonts) */
export function parseOptions(html: string): { options: Option[]; selected: string } {
  const doc = new DOMParser().parseFromString(`<select>${html.replace(/\n/g, ' ')}</select>`, 'text/html')
  const select = doc.querySelector('select')!
  const options = Array.from(select.options, (o) => ({ value: o.value, label: o.text.trim() }))
  return { options, selected: select.value }
}

/**
 * Turn the HTML fragments some scripts answer (save results) into plain text.
 * They echo user input, so they must never be rendered as HTML.
 */
export function htmlToText(html: string): string {
  const doc = new DOMParser().parseFromString(
    html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<hr\s*\/?>/gi, '\n'),
    'text/html',
  )
  doc.querySelectorAll('button, script, style').forEach((e) => e.remove())
  return (doc.body.textContent ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l)
    .join('\n')
}

/** Paths of the SD card files are returned as /system/sdcard/DCIM/... or viewer/... */
export function viewerUrl(path: string): string {
  return path
    .replace(/^\/system\/sdcard\/DCIM\/?/, VIEWER)
    .replace(/^\/?viewer\/?/, VIEWER)
}
