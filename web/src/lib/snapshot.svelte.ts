// Live picture of the camera, refreshed one image at a time (currentpic.cgi)

import { CGI } from './api'
import { poll } from './poll'

export class Snapshot {
  src = $state('')
  error = $state(false)
  private stopPolling?: () => void
  private controller?: AbortController

  /** Refresh continuously, waiting `interval` ms after each image */
  start(interval = 1000) {
    this.stopPolling?.()
    this.stopPolling = poll(() => this.refresh(), interval)
  }

  async refresh() {
    this.controller?.abort()
    const controller = (this.controller = new AbortController())
    try {
      const res = await fetch(`${CGI}currentpic.cgi?${Date.now()}`, { cache: 'no-store', signal: controller.signal })
      if (!res.ok) throw new Error(res.statusText)
      const blob = await res.blob()
      if (controller.signal.aborted) return
      if (this.src) URL.revokeObjectURL(this.src)
      this.src = URL.createObjectURL(blob)
      this.error = false
    } catch (e) {
      if (!controller.signal.aborted) this.error = true
      throw e
    }
  }

  destroy() {
    this.stopPolling?.()
    this.controller?.abort()
    if (this.src) URL.revokeObjectURL(this.src)
  }
}
