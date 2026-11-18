<script lang="ts">
  import { onMount } from 'svelte'
  import { cgiUrl, get, parseKV } from '../lib/api'
  import Tabs from '../components/Tabs.svelte'
  import Icon from '../components/Icon.svelte'

  const tabs = { overview: 'Overview', network: 'Network', logs: 'Logs' }
  let tab = $state<keyof typeof tabs>('overview')

  const system: [string, string][] = [
    ['hostname', 'Hostname'],
    ['model', 'Model'],
    ['fwDate', 'Firmware date'],
    ['fwBranch', 'Firmware branch'],
    ['fwCommit', 'Firmware commit'],
    ['kernel', 'Kernel version'],
    ['bootLoader', 'Bootloader version'],
    ['localTime', 'Local time'],
    ['uptime', 'System uptime'],
    ['loadAvg', 'Load average'],
  ]
  const network: [string, string][] = [
    ['ssid', 'SSID'],
    ['linkQuality', 'Link quality'],
    ['ip', 'IP address'],
    ['mac', 'MAC address'],
    ['netmask', 'Netmask'],
    ['gateway', 'Gateway'],
    ['dns', 'DNS'],
  ]
  const panels: Record<'network' | 'logs', [string, string][]> = {
    network: [
      ['netInt', 'Interfaces'],
      ['netRoutes', 'Routes'],
      ['netDNS', 'DNS'],
    ],
    logs: [
      ['dmesg', 'System logs'],
      ['logCat', 'LogCat'],
      ['logVideo', 'Video server'],
      ['logUpdate', 'Last update'],
      ['logProcess', 'Process list'],
      ['logMounts', 'Mounts'],
    ],
  }

  let info = $state<Record<string, string>>({})
  let loading = $state(true)
  let error = $state('')

  // Logs: loaded when their section is opened, as plain text
  let logs = $state<Record<string, { text: string; loading: boolean }>>({})

  async function loadInfo() {
    loading = true
    error = ''
    try {
      info = parseKV(await get('ui_info.cgi', { cmd: 'get_config' }))
    } catch (e) {
      error = (e as Error).message
    } finally {
      loading = false
    }
  }

  async function loadLog(id: string) {
    logs[id] = { text: logs[id]?.text ?? '', loading: true }
    try {
      logs[id] = { text: await get('ui_info.cgi', { cmd: 'get_info', info: id }), loading: false }
    } catch (e) {
      logs[id] = { text: `Request failed: ${(e as Error).message}`, loading: false }
    }
  }

  onMount(loadInfo)
</script>

{#snippet table(rows: [string, string][])}
  <table class="data">
    <tbody>
      {#each rows as [id, label] (id)}
        <tr>
          <th scope="row">{label}</th>
          <td class="value">{info[id] ?? ''}</td>
        </tr>
      {/each}
    </tbody>
  </table>
{/snippet}

<section class="card">
  <div class="title">
    <h1>Information</h1>
    {#if tab === 'overview'}
      <button class="btn" type="button" onclick={loadInfo} disabled={loading}><Icon name="refresh" size={16} /> Refresh</button>
    {/if}
  </div>
  <Tabs {tabs} bind:active={tab} />

  {#if tab === 'overview'}
    {#if error}
      <p class="error">Unable to read the information: {error}</p>
    {:else if loading}
      <p class="muted"><span class="spinner"></span> Collecting information (this takes a few seconds)…</p>
    {/if}
    {#if !loading || Object.keys(info).length}
      <details class="section" open>
        <summary>System</summary>
        <div class="body table-wrap">{@render table(system)}</div>
      </details>
      <details class="section" open>
        <summary>Network</summary>
        <div class="body table-wrap">{@render table(network)}</div>
      </details>
      <details class="section">
        <summary>Bootloader</summary>
        <div class="body">
          <p class="label">Bootloader MD5</p>
          <pre class="output">{info.bootMD5 ?? ''}</pre>
          <p class="label">Bootloader version</p>
          <pre class="output">{info.bootVersion ?? ''}</pre>
          <p class="label">Kernel command line</p>
          <pre class="output">{info.bootCMD ?? ''}</pre>
          <p>
            <a class="btn" href={cgiUrl('dumpbootloader.cgi')} download="bootloader.bin">
              <Icon name="download" size={16} /> Download the bootloader
            </a>
          </p>
        </div>
      </details>
    {/if}
  {:else}
    {#each panels[tab] as [id, label] (id)}
      <details class="section" ontoggle={(e) => e.currentTarget.open && !logs[id] && loadLog(id)}>
        <summary>
          {label}
          {#if logs[id]?.loading}<span class="spinner"></span>{/if}
        </summary>
        <div class="body">
          <div class="actions top">
            <button class="btn" type="button" onclick={() => loadLog(id)} disabled={logs[id]?.loading}>
              <Icon name="refresh" size={16} /> Reload
            </button>
          </div>
          <pre class="output">{logs[id]?.text ?? ''}</pre>
        </div>
      </details>
    {/each}
  {/if}
</section>

<style>
  .title {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 1rem;
  }

  .title h1 {
    margin: 0;
  }

  th[scope='row'] {
    width: 35%;
  }

  .value {
    white-space: pre-wrap;
    word-break: break-word;
  }

  .label {
    margin: 0.75rem 0 0.3rem;
  }

  .actions.top {
    margin: 0 0 0.5rem;
  }
</style>
