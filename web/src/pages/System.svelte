<script lang="ts">
  import { onMount } from 'svelte'
  import { parseOptions } from '../lib/api'
  import { Config } from '../lib/config.svelte'
  import { fieldIds, type DynamicOptions, type SectionDef } from '../lib/forms'
  import ConfigForm from '../components/ConfigForm.svelte'
  import Tabs from '../components/Tabs.svelte'

  // Secrets are never sent back by the camera: like the previous UI, this placeholder is shown
  // and sent back; the script skips the field when it receives it unchanged
  const HIDDEN = '*****'

  const forms: Record<string, SectionDef[]> = {
    properties: [
      {
        fields: [
          { id: 'hostname', label: 'Hostname' },
          { id: 'password', label: 'HTTP root password', type: 'password' },
        ],
      },
    ],
    time: [
      {
        fields: [
          { id: 'timezone', label: 'Time zone', type: 'select', options: 'timezones' },
          { id: 'ntp', label: 'NTP server' },
        ],
      },
    ],
    updates: [{ fields: [{ id: 'github_token', label: 'GitHub token', wide: true }] }],
    network: [
      {
        fields: [
          { id: 'wifi_ssid', label: 'Wifi network SSID' },
          { id: 'wifi_password', label: 'Wifi password', type: 'password' },
          { id: 'connect_timeout', label: 'Wifi connect timeout', type: 'number', min: 30 },
          { id: 'ap_ssid', label: 'Access point SSID' },
          { id: 'ap_password', label: 'Access point password', type: 'password' },
          { id: 'scan_interval', label: 'Access point scan interval', type: 'number', min: 10 },
          { id: 'usb_eth', label: 'Enable USB Ethernet (disables Wifi)', type: 'checkbox', wide: true },
        ],
      },
    ],
    ssh: [
      {
        fields: [
          { id: 'ssh_key', label: 'SSH authorized keys', type: 'textarea', wide: true },
          { id: 'ssh_port', label: 'SSH port', type: 'number' },
          { id: 'ssh_password', label: 'Allow SSH password login', type: 'checkbox', wide: true },
        ],
      },
    ],
  }
  const tabs = { properties: 'Properties', time: 'Time', updates: 'Updates', network: 'Network', ssh: 'SSH' }
  let tab = $state<keyof typeof tabs>('properties')

  // One form spread over the tabs: the whole system configuration is saved at once
  const allFields = fieldIds(Object.values(forms).flat())

  const config = new Config('ui_system.cgi')
  let dynamic = $state<DynamicOptions>({ timezones: [] })
  let currentTime = $state('')

  onMount(() => {
    config.load(false, (raw) => {
      const tz = parseOptions(raw.timezone ?? '')
      dynamic.timezones = tz.options
      currentTime = raw.currenttime ?? ''
      return {
        ...raw,
        timezone: tz.selected,
        password: HIDDEN,
        wifi_password: HIDDEN,
        ap_password: HIDDEN,
      }
    })
  })

  function save() {
    // The key is sent the way the previous UI did: spaces pre-encoded, decoded by the script
    // An empty password field would set an empty password: keep the current one instead
    const keep = (id: string) => config.values[id] || HIDDEN
    config.save(allFields, 'save_config', {
      ssh_key: (config.values.ssh_key ?? '').replace(/ /g, '%20'),
      password: keep('password'),
      wifi_password: keep('wifi_password'),
      ap_password: keep('ap_password'),
    })
  }
</script>

<section class="card">
  <h1>System configuration</h1>
  <Tabs {tabs} bind:active={tab} />
  {#key tab}
    <ConfigForm
      sections={forms[tab]}
      bind:values={config.values}
      {dynamic}
      loading={config.loading}
      error={config.error}
      onsave={save}
    >
      {#if tab === 'time' && currentTime}
        <p class="muted">{currentTime}</p>
      {/if}
      <p class="muted note">Save applies the settings of all the tabs.</p>
    </ConfigForm>
  {/key}
</section>

<style>
  .note {
    font-size: 0.85rem;
    margin: 1rem 0 0;
  }
</style>
