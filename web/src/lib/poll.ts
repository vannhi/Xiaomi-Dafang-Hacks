// Polling that waits for the previous call to finish and pauses while the page is hidden:
// each CGI call forks shell processes on a small SoC, so never stack requests

export function poll(task: () => Promise<unknown>, interval: number): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined
  let stopped = false
  let running = false

  async function run() {
    timer = undefined
    if (stopped || running) return
    if (document.hidden) return
    running = true
    try {
      await task()
    } catch {
      // Keep polling: the camera may just be busy
    } finally {
      running = false
      if (!stopped && !document.hidden) timer = setTimeout(run, interval)
    }
  }

  function onVisibility() {
    if (!document.hidden && timer === undefined && !running) run()
  }

  document.addEventListener('visibilitychange', onVisibility)
  run()

  return () => {
    stopped = true
    clearTimeout(timer)
    document.removeEventListener('visibilitychange', onVisibility)
  }
}
