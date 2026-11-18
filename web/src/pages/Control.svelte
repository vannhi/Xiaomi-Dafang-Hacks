<script lang="ts">
  import { onDestroy } from 'svelte'
  import { get, parseKV, post, viewerUrl } from '../lib/api'
  import { confirm, showResult } from '../lib/dialogs.svelte'
  import Icon from '../components/Icon.svelte'
  import Modal from '../components/Modal.svelte'
  import Tabs from '../components/Tabs.svelte'

  const tabs = { services: 'Services', update: 'Update', config: 'Backup / restore', power: 'Power' }
  let tab = $state<keyof typeof tabs>('services')

  // Services ---------------------------------------------------------------

  const friendlyNames: Record<string, string> = {
    'auto-night-detection': 'Auto night detection',
    dropbear: 'SSH server',
    'debug-on-osd': 'Debug on OSD',
    'ftp-server': 'FTP server',
    'mdns-responder': 'mDNSResponder',
    'mqtt-control': 'MQTT control',
    'mqtt-status': 'MQTT live status updates',
    'onvif-srvd': 'ONVIF server',
    recording: 'Recording',
    rtsp: 'RTSP server',
    'sound-on-startup': 'Play startup sound',
    'telegram-bot': 'Telegram bot',
    timelapse: 'Timelapse',
    lighttpd: 'Web server',
  }

  interface Service {
    name: string
    started: boolean
    autostart: boolean
    busy: boolean
  }

  let services = $state<Service[]>([])
  let servicesState = $state<'loading' | 'ready' | string>('loading')

  async function loadServices() {
    servicesState = 'loading'
    try {
      const text = await get('ui_control.cgi', { cmd: 'get_services' })
      services = text
        .split('\n')
        .filter((l) => l.includes('#:#'))
        .map((l) => {
          const [name, status, autostart] = l.split('#:#')
          return { name, started: status === 'started', autostart: autostart === 'true', busy: false }
        })
      servicesState = 'ready'
    } catch (e) {
      servicesState = (e as Error).message
    }
  }

  async function controlService(service: Service, start: boolean) {
    service.busy = true
    try {
      await get('ui_control.cgi', { cmd: 'services', service: service.name, action: start ? 'start' : 'stop' })
      service.started = start
    } catch {
      service.started = !start
    } finally {
      service.busy = false
    }
  }

  async function autostartService(service: Service, enabled: boolean) {
    service.autostart = enabled
    try {
      await get('ui_control.cgi', { cmd: 'autoStartService', service: service.name, action: String(enabled) })
    } catch {
      service.autostart = !enabled
    }
  }

  // Update -----------------------------------------------------------------

  let check = $state<{ repo: string; branch: string; behind: number } | undefined>()
  let checkError = $state('')
  let checking = $state(false)
  let custom = $state({ repo: '', branch: '', full: true })

  let update = $state({ open: false, progress: 0, message: '', countdown: 0 })
  let timers: ReturnType<typeof setTimeout>[] = []
  onDestroy(() => timers.forEach(clearTimeout))

  async function checkUpdate() {
    checking = true
    checkError = ''
    try {
      // repo:branch:commits behind (0 = up to date, -1 = no VERSION file)
      const [repo, branch, status] = (await get('action.cgi', { cmd: 'check_update' })).trim().split(':')
      check = { repo, branch, behind: parseInt(status, 10) }
      custom = { repo: repo === 'null' ? 'EliasKotlyar' : repo, branch: branch === 'null' ? 'master' : branch, full: true }
    } catch (e) {
      checkError = (e as Error).message
    } finally {
      checking = false
    }
  }

  interface UpdateAction {
    label: string
    repo: string
    branch: string
    mode: 'full' | 'cumul'
  }

  const branchLabel = (branch: string) =>
    branch === 'master' ? 'STABLE' : branch === 'beta' ? 'BETA' : 'CUSTOM'

  // Same choices as the previous UI, depending on the installed branch
  const actions = $derived.by((): { main: UpdateAction[]; other: UpdateAction[] } => {
    if (!check) return { main: [], other: [] }
    const { repo, branch, behind } = check
    if (!(behind >= 0)) {
      return {
        main: [
          { label: 'Update firmware (STABLE)', repo: 'EliasKotlyar', branch: 'master', mode: 'cumul' },
          { label: 'Update firmware (BETA)', repo: 'EliasKotlyar', branch: 'beta', mode: 'cumul' },
        ],
        other: [],
      }
    }
    const main: UpdateAction[] =
      behind > 0 ? [{ label: `Update firmware (${branchLabel(branch)})`, repo, branch, mode: 'cumul' }] : []
    const other: UpdateAction[] = []
    if (branch !== 'master' && branch !== 'beta')
      other.push({ label: 'Force full update to CUSTOM (remove version file + update)', repo, branch, mode: 'full' })
    if (branch !== 'master') other.push({ label: 'Switch to STABLE firmware', repo, branch: 'master', mode: 'full' })
    if (branch === 'master') {
      other.push({ label: 'Switch to BETA firmware', repo, branch: 'beta', mode: 'full' })
      other.push({ label: 'Force full update to STABLE (remove version file + update)', repo, branch: 'master', mode: 'full' })
    } else {
      other.push({ label: 'Force full update to BETA (remove version file + update)', repo, branch: 'beta', mode: 'full' })
    }
    return { main, other }
  })

  async function startUpdate(repo: string, branch: string, mode: 'full' | 'cumul') {
    const ok = await confirm(
      `Update the firmware from the ${branch} branch of ${repo} (${mode === 'full' ? 'full' : 'cumulative'} update)?\nThe camera will reboot at the end of the process.`,
      { title: 'Firmware update', action: 'Update' },
    )
    if (!ok) return
    update = { open: true, progress: 0, message: 'Starting the update…', countdown: 0 }
    try {
      const pid = await post('action.cgi', {}, { cmd: 'update', repo, release: branch, mode })
      if (!pid.trim()) throw new Error('the update process did not start')
      followUpdate()
    } catch (e) {
      update.message = `Error starting update process: ${(e as Error).message}`
    }
  }

  async function followUpdate() {
    try {
      const progress = parseInt(await get('action.cgi', { cmd: 'show_updateProgress' }), 10)
      if (progress < 0) {
        update.message = update.progress > 0 ? 'The update process ended.' : 'Error starting update process'
        return
      }
      update.progress = progress
      update.message = 'Update in progress'
      if (progress >= 100) return reloadAfter(30, 'Rebooting… please wait')
    } catch {
      // The camera may be too busy to answer: try again
    }
    timers.push(setTimeout(followUpdate, 500))
  }

  function reloadAfter(seconds: number, message: string) {
    update.message = message
    update.countdown = seconds
    const tick = () => {
      update.countdown--
      if (update.countdown <= 0) location.reload()
      else timers.push(setTimeout(tick, 1000))
    }
    timers.push(setTimeout(tick, 1000))
  }

  // Configuration snapshots -------------------------------------------------

  interface Snapshot {
    name: string
    size: string
    date: string
    path: string
  }

  let snapshots = $state<Snapshot[]>([])
  let snapshotsState = $state<'loading' | 'ready' | string>('loading')

  async function loadSnapshots() {
    snapshotsState = 'loading'
    try {
      const text = await get('ui_control.cgi', { cmd: 'getFiles', dir: 'config' })
      snapshots = text
        .split('\n')
        .filter((l) => l.includes('#:#'))
        .map((l) => {
          const [name, size, date, path] = l.split('#:#')
          return { name, size, date, path }
        })
        .sort((a, b) => b.name.localeCompare(a.name))
      snapshotsState = 'ready'
    } catch (e) {
      snapshotsState = (e as Error).message
    }
  }

  async function takeSnapshot() {
    snapshotsState = 'loading'
    await get('ui_control.cgi', { cmd: 'save_config' }).catch(() => {})
    await loadSnapshots()
  }

  async function deleteSnapshot(s: Snapshot) {
    if (!(await confirm(`Delete the configuration snapshot ${s.name}?`, { action: 'Delete', danger: true }))) return
    await get('ui_control.cgi', { cmd: 'del_config', file: s.path }).catch(() => {})
    await loadSnapshots()
  }

  async function restoreSnapshot(s: Snapshot) {
    const ok = await confirm(
      `Restore the configuration snapshot ${s.name}?\nThe camera will reboot at the end of the process.`,
      { title: 'Restore configuration', action: 'Restore', danger: true },
    )
    if (ok) showResult('Restore configuration', () => get('ui_control.cgi', { cmd: 'restore_config', file: s.path }))
  }

  // Power ------------------------------------------------------------------

  async function power(command: 'reboot' | 'shutdown') {
    const ok = await confirm(command === 'reboot' ? 'Reboot the camera?' : 'Shut down the camera?', {
      title: command === 'reboot' ? 'Reboot' : 'Shutdown',
      action: command === 'reboot' ? 'Reboot' : 'Shut down',
      danger: true,
    })
    if (!ok) return
    get('action.cgi', { cmd: command }).catch(() => {})
    update = { open: true, progress: -1, message: '', countdown: 0 }
    if (command === 'reboot') reloadAfter(45, 'Rebooting… please wait')
    else update.message = 'The camera is shutting down…'
  }

  // Load each tab when first opened
  let loaded = new Set<string>()
  $effect(() => {
    if (loaded.has(tab)) return
    loaded.add(tab)
    if (tab === 'services') loadServices()
    else if (tab === 'update') checkUpdate()
    else if (tab === 'config') loadSnapshots()
  })
</script>

<section class="card">
  <h1>System control</h1>
  <Tabs {tabs} bind:active={tab} />

  {#if tab === 'services'}
    {#if servicesState === 'loading'}
      <p class="muted"><span class="spinner"></span> Loading services…</p>
    {:else if servicesState !== 'ready'}
      <p class="error">Unable to read the services: {servicesState}</p>
    {/if}
    {#if services.length}
      <div class="table-wrap">
        <table class="data">
          <thead>
            <tr><th>Service</th><th>Running</th><th>Autostart</th></tr>
          </thead>
          <tbody>
            {#each services as service (service.name)}
              <tr>
                <td>{friendlyNames[service.name] ?? service.name}</td>
                <td>
                  <input
                    type="checkbox"
                    role="switch"
                    class="switch"
                    aria-label="Run {service.name}"
                    checked={service.started}
                    disabled={service.busy}
                    onchange={(e) => controlService(service, e.currentTarget.checked)}
                  />
                </td>
                <td>
                  <input
                    type="checkbox"
                    role="switch"
                    class="switch"
                    aria-label="Start {service.name} at boot"
                    checked={service.autostart}
                    onchange={(e) => autostartService(service, e.currentTarget.checked)}
                  />
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  {:else if tab === 'update'}
    {#if checking}
      <p class="muted"><span class="spinner"></span> Searching for updates…</p>
    {:else if checkError}
      <p class="error">Unable to check for updates: {checkError}</p>
      <button class="btn" type="button" onclick={checkUpdate}>Retry</button>
    {:else if check}
      <p class="status">
        {#if check.behind === 0}
          You already have the latest version from the <strong>{check.branch}</strong> branch of the
          <strong>{check.repo}</strong> repository.
        {:else if check.behind > 0}
          You are <strong>{check.behind}</strong> commits behind the <strong>{check.branch}</strong> branch of the
          <strong>{check.repo}</strong> repository.
        {:else if check.behind === -1}
          No version file found. You can update the firmware of this camera to the latest version from the
          <a target="_blank" rel="noreferrer" href="https://github.com/EliasKotlyar/Xiaomi-Dafang-Hacks">GitHub repository</a>.
          Settings are kept after the update.
        {:else}
          There is a problem with your VERSION file. Please do a full update to create a valid VERSION file.
        {/if}
      </p>
      <div class="update-actions">
        {#each actions.main as a (a.label)}
          <button class="btn primary block" type="button" onclick={() => startUpdate(a.repo, a.branch, a.mode)}>
            {a.label}
          </button>
        {/each}
      </div>
      <details class="section">
        <summary>Other update options</summary>
        <div class="body update-actions">
          {#each actions.other as a (a.label)}
            <button class="btn block" type="button" onclick={() => startUpdate(a.repo, a.branch, a.mode)}>
              {a.label}
            </button>
          {/each}
          <h2>Custom firmware</h2>
          <div class="grid">
            <label class="field"><span>Repository</span><input bind:value={custom.repo} /></label>
            <label class="field"><span>Branch</span><input bind:value={custom.branch} /></label>
          </div>
          <label class="check"><input type="checkbox" bind:checked={custom.full} /> Force full update</label>
          <button
            class="btn block"
            type="button"
            disabled={!custom.repo || !custom.branch}
            onclick={() => startUpdate(custom.repo, custom.branch, custom.full ? 'full' : 'cumul')}
          >
            Update custom firmware
          </button>
        </div>
      </details>
    {/if}
  {:else if tab === 'config'}
    <div class="actions top">
      <button class="btn primary" type="button" onclick={takeSnapshot} disabled={snapshotsState === 'loading'}>
        Take a configuration snapshot
      </button>
    </div>
    {#if snapshotsState === 'loading'}
      <p class="muted"><span class="spinner"></span> Loading…</p>
    {:else if snapshotsState !== 'ready'}
      <p class="error">Unable to list the snapshots: {snapshotsState}</p>
    {:else if !snapshots.length}
      <p class="muted">No snapshot available.</p>
    {:else}
      <div class="table-wrap">
        <table class="data">
          <thead>
            <tr><th>File name</th><th>Size</th><th>Date</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {#each snapshots as s (s.path)}
              <tr>
                <td>{s.name}</td>
                <td>{s.size}</td>
                <td>{s.date}</td>
                <td class="row-actions">
                  <a class="icon-btn" href={viewerUrl(s.path)} download title="Download"><Icon name="download" size={18} /></a>
                  <button class="icon-btn" type="button" onclick={() => restoreSnapshot(s)} title="Restore this configuration">
                    <Icon name="restore" size={18} />
                  </button>
                  <button class="icon-btn danger" type="button" onclick={() => deleteSnapshot(s)} title="Delete">
                    <Icon name="trash" size={18} />
                  </button>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  {:else}
    <div class="grid power">
      <button class="btn block" type="button" onclick={() => power('reboot')}><Icon name="refresh" size={18} /> Reboot</button>
      <button class="btn block danger" type="button" onclick={() => power('shutdown')}>
        <Icon name="power" size={18} /> Shut down
      </button>
    </div>
  {/if}
</section>

<Modal bind:open={update.open} title={update.progress >= 0 ? 'Firmware update' : 'Power'}>
  {#if update.progress >= 0}
    <p><strong>At the end of this process the camera will reboot without notice.</strong></p>
    <div class="progress" role="progressbar" aria-valuenow={update.progress} aria-valuemin={0} aria-valuemax={100}>
      <div style:width="{Math.min(100, update.progress)}%"></div>
      <span>{update.progress}%</span>
    </div>
  {/if}
  <p>{update.message}{update.countdown > 0 ? ` ${update.countdown}` : ''}</p>
</Modal>

<style>
  .status {
    margin-top: 0;
  }

  .update-actions {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-bottom: 1rem;
  }

  .update-actions h2 {
    margin-bottom: 0;
  }

  .row-actions {
    white-space: nowrap;
  }

  .actions.top {
    margin: 0 0 1rem;
  }

  .power {
    max-width: 480px;
  }

  .progress {
    position: relative;
    height: 26px;
    border-radius: 6px;
    background: var(--surface-2);
    overflow: hidden;
  }

  .progress div {
    height: 100%;
    background: var(--accent);
    transition: width 0.3s;
  }

  .progress span {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 600;
    font-size: 0.85rem;
  }
</style>
