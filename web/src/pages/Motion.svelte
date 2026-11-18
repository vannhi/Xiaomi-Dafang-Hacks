<script lang="ts">
  import { onDestroy, onMount } from 'svelte'
  import { post } from '../lib/api'
  import { Config } from '../lib/config.svelte'
  import { showResult } from '../lib/dialogs.svelte'
  import { colors, fieldIds, onOff, type SectionDef } from '../lib/forms'
  import { Snapshot } from '../lib/snapshot.svelte'
  import ConfigForm from '../components/ConfigForm.svelte'
  import Tabs from '../components/Tabs.svelte'
  import ZoneEditor, { type Zone } from '../components/ZoneEditor.svelte'

  const alertTypes: [string, string][] = [
    ['text', 'Text'],
    ['image', 'Image'],
    ['video', 'Video'],
    ['video+image', 'Video and image'],
  ]

  const forms: Record<'general' | 'storage' | 'notifications', SectionDef[]> = {
    general: [
      {
        fields: [
          { id: 'motionDetection', label: 'Motion detection', type: 'select', options: [['off', 'Deactivate'], ['on', 'Activate']] },
          {
            id: 'motionSensitivity',
            label: 'Sensitivity',
            type: 'select',
            options: [['0', 'Very low'], ['1', 'Low'], ['2', 'Moderate'], ['3', 'High'], ['4', 'Very high']],
          },
          {
            id: 'motionIndicatorColor',
            label: 'Motion indicator on the picture',
            type: 'select',
            options: [['-1', 'Deactivated'], ...colors],
          },
          {
            id: 'motionTracking',
            label: 'Motion tracking (ignores the detection zones)',
            type: 'select',
            options: [['off', 'Deactivate'], ['on', 'Activate']],
          },
          { id: 'motionTimeout', label: 'Motion timeout', type: 'number' },
        ],
      },
    ],
    storage: [
      {
        title: 'Local storage',
        fields: [
          { id: 'saveSnapshot', label: 'Save snapshots on motion', type: 'select', options: onOff },
          { id: 'maxSnaphotDays', label: 'Snapshot retention (days)', type: 'number' },
          { id: 'saveVideo', label: 'Save videos on motion', type: 'select', options: onOff },
          { id: 'maxVideoDays', label: 'Video retention (days)', type: 'number' },
        ],
      },
      {
        title: 'Samba storage',
        fields: [
          { id: 'smbShare', label: 'Samba share path', wide: true },
          { id: 'smbUsername', label: 'Samba username' },
          { id: 'smbPassword', label: 'Samba password', type: 'password' },
          { id: 'smbSnapshot', label: 'Save snapshots on motion', type: 'select', options: onOff },
          { id: 'smbStillsDir', label: 'Remote snapshots directory' },
          { id: 'smbVideo', label: 'Save videos on motion', type: 'select', options: onOff },
          { id: 'smbVideosDir', label: 'Remote videos directory' },
        ],
      },
      {
        title: 'FTP storage',
        fields: [
          { id: 'ftpHost', label: 'FTP hostname' },
          { id: 'ftpPort', label: 'FTP port' },
          { id: 'ftpUsername', label: 'FTP username' },
          { id: 'ftpPassword', label: 'FTP password', type: 'password' },
          { id: 'ftpSnapshot', label: 'Save snapshots on motion', type: 'select', options: onOff },
          { id: 'ftpStillsDir', label: 'Remote snapshots directory' },
          { id: 'ftpVideo', label: 'Save videos on motion', type: 'select', options: onOff },
          { id: 'ftpVideosDir', label: 'Remote videos directory' },
        ],
      },
      {
        title: 'Dropbox storage',
        fields: [
          { id: 'dropboxUrl', label: 'Dropbox URL', wide: true },
          { id: 'dropboxToken', label: 'Dropbox long lived token', wide: true },
          { id: 'dropboxSnapshot', label: 'Save snapshots on motion', type: 'select', options: onOff },
          { id: 'dropboxStillsDir', label: 'Remote snapshots directory (starts with /)' },
          { id: 'dropboxVideo', label: 'Save videos on motion', type: 'select', options: onOff },
          { id: 'dropboxVideosDir', label: 'Remote videos directory (starts with /)' },
        ],
      },
    ],
    notifications: [
      {
        fields: [
          { id: 'motionTriggerLed', label: 'LED notification', type: 'select', options: onOff },
          { id: 'mqttMessage', label: 'MQTT: publish a message', type: 'select', options: onOff },
          { id: 'mqttSnapshot', label: 'MQTT: publish a snapshot', type: 'select', options: onOff },
          { id: 'mqttVideo', label: 'MQTT: publish a video', type: 'select', options: onOff },
          { id: 'sendEmail', label: 'Send an email (configure the mail service first)', type: 'select', options: onOff },
          { id: 'sendTelegram', label: 'Send Telegram (configure the Telegram service first)', type: 'select', options: onOff },
          { id: 'telegramAlertType', label: 'Telegram alert type (videos are sent without audio)', type: 'select', options: alertTypes },
          { id: 'sendMatrix', label: 'Send Matrix (configure the Matrix service first)', type: 'select', options: onOff },
          { id: 'matrixAlertType', label: 'Matrix alert type', type: 'select', options: alertTypes },
          {
            id: 'nightModeEventDelay',
            label: 'Ignore motion for this many seconds after switching to night mode',
            type: 'number',
          },
        ],
      },
    ],
  }

  const tabs = { general: 'General', storage: 'Storage', notifications: 'Notifications', zones: 'Zones' }
  let tab = $state<keyof typeof tabs>('general')

  const config = new Config('ui_motion.cgi')
  onMount(() => config.load())

  // Detection zones: "x1,y1,x2,y2,..." in pixels of the camera picture
  const snapshot = new Snapshot()
  let picture = $state<{ width: number; height: number }>()
  let zones = $state<Zone[]>([])
  let zonesLoaded = false
  onDestroy(() => snapshot.destroy())

  $effect(() => {
    if (tab !== 'zones' || snapshot.src) return
    snapshot.refresh().catch(() => {})
  })

  $effect(() => {
    // Read the zones once both the picture and the configuration are available
    const regions = config.values.currentRegions
    if (zonesLoaded || !picture || regions === undefined) return
    const n = regions.split(',').map(Number)
    const list: Zone[] = []
    for (let i = 0; i + 3 < n.length; i += 4) {
      if (n.slice(i, i + 4).some(isNaN)) continue
      list.push({ x1: n[i], y1: n[i + 1], x2: n[i + 2], y2: n[i + 3] })
    }
    zones = list
    zonesLoaded = true
  })

  const regions = $derived(zones.map((z) => `${z.x1},${z.y1},${z.x2},${z.y2}`).join(','))

  function measure(src: string) {
    const img = new Image()
    img.onload = () => (picture = { width: img.naturalWidth, height: img.naturalHeight })
    img.src = src
  }

  $effect(() => {
    if (snapshot.src && !picture) measure(snapshot.src)
  })

  async function saveZones() {
    await showResult('Save configuration', () => post('ui_motion.cgi', { cmd: 'save_config', regions }))
    config.values.currentRegions = regions
  }
</script>

<section class="card">
  <h1>Motion detection</h1>
  <Tabs {tabs} bind:active={tab} />
  {#if tab === 'zones'}
    <div class="field">
      <label for="regions">Current boundaries</label>
      <input id="regions" readonly value={regions} />
    </div>
    <div class="zones">
      {#if picture && snapshot.src}
        <ZoneEditor src={snapshot.src} width={picture.width} height={picture.height} bind:zones />
      {:else if snapshot.error}
        <p class="error">Unable to load the camera picture.</p>
      {:else}
        <p class="muted"><span class="spinner"></span> Loading the picture…</p>
      {/if}
    </div>
    <div class="actions">
      <button class="btn primary" type="button" onclick={saveZones} disabled={!picture || config.loading}>Save</button>
      <button class="btn" type="button" onclick={() => (zones = [])} disabled={!zones.length}>Clear all zones</button>
    </div>
  {:else}
    {#key tab}
      {@const sections = forms[tab as keyof typeof forms]}
      <ConfigForm
        {sections}
        bind:values={config.values}
        loading={config.loading}
        error={config.error}
        onsave={() => config.save(fieldIds(sections))}
      />
    {/key}
  {/if}
</section>

<style>
  .zones {
    margin-top: 1rem;
  }
</style>
