// Minimal hash router: lighttpd has no SPA fallback, so pages live in the URL hash (#/camera)

export const pages = {
  live: 'Live',
  system: 'System',
  camera: 'Camera',
  net_services: 'Network services',
  motion: 'Motion detection',
  softnight: 'Software night detection',
  config_files: 'Configuration files',
  control: 'System control',
  info: 'Information',
  sdcard: 'SD card',
} as const

export type Page = keyof typeof pages

function isPage(name: string | null): name is Page {
  return name !== null && Object.hasOwn(pages, name)
}

function current(): Page {
  const name = location.hash.replace(/^#\/?/, '')
  if (isPage(name)) return name
  // Links of the previous UI: index.html?url=camera
  const legacy = new URLSearchParams(location.search).get('url')
  return isPage(legacy) ? legacy : 'live'
}

export const route = $state({ page: current() })

window.addEventListener('hashchange', () => {
  route.page = current()
})

export function href(page: Page): string {
  return '#/' + page
}
