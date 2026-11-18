<script lang="ts">
  import { onMount } from 'svelte'
  import { parseOptions, post } from '../lib/api'
  import { Config } from '../lib/config.svelte'
  import { colors, fieldIds, onOff, type DynamicOptions, type SectionDef } from '../lib/forms'
  import ConfigForm from '../components/ConfigForm.svelte'
  import Tabs from '../components/Tabs.svelte'

  const rates: [string, string][] = ['8000', '16000', '24000', '44100', '48000'].map((r) => [r, r])

  const forms: Record<string, SectionDef[]> = {
    video: [
      {
        title: 'Format',
        fields: [
          { id: 'codec', label: 'Codec for RTSP server', type: 'select', options: [['H264', 'H264'], ['MJPG', 'MJPEG']] },
          {
            id: 'videoSize',
            label: 'Video size',
            type: 'select',
            options: [
              ['-W640 -H360', '640x360'],
              ['-W768 -H432', '768x432'],
              ['-W960 -H540', '960x540'],
              ['-W1280 -H720', '1280x720'],
              ['-W1600 -H900', '1600x900'],
              ['-W1920 -H1080', '1920x1080'],
            ],
          },
          { id: 'bitRate', label: 'Bitrate (kbps)' },
          {
            id: 'format',
            label: 'Format',
            type: 'select',
            options: [['0', 'FixedQp'], ['1', 'CBR'], ['2', 'VBR'], ['3', 'SMART']],
          },
          { id: 'flip', label: 'Flip image', type: 'select', options: [['OFF', 'Off'], ['ON', 'On']] },
          { id: 'frmRateNum', label: 'Frame rate: images' },
          { id: 'frmRateDen', label: 'Frame rate: per seconds' },
        ],
      },
      {
        title: 'Network / Security',
        fields: [
          { id: 'videoUser', label: 'Username' },
          { id: 'videoPassword', label: 'Password', type: 'password' },
          { id: 'videoPort', label: 'Port (default 8554)', type: 'number' },
          { id: 'multicast', label: 'Multicast address (blank to disable)' },
        ],
      },
      {
        title: 'Auto night',
        fields: [
          { id: 'autoNightMode', label: 'Auto night mode', type: 'select', options: [['hw', 'Hardware'], ['sw', 'Software']] },
          {
            id: 'avg',
            label: 'Measurements averaged before switching',
            type: 'select',
            options: ['1', '2', '3', '4', '5', '10', '15'].map((n) => [n, n]),
          },
        ],
      },
    ],
    audio: [
      {
        fields: [
          {
            id: 'audioinFormat',
            label: 'Audio format',
            type: 'select',
            options: ['OFF', 'OPUS', 'PCM', 'PCMU', 'MP3'].map((f) => [f, f]),
          },
          { id: 'audioinHWVol', label: 'Hardware volume', type: 'range', min: -1, max: 120 },
          { id: 'audioinSWVol', label: 'Software volume', type: 'range', min: -1, max: 1000 },
          { id: 'audioinBR', label: 'Sample rate in', type: 'select', options: rates },
          { id: 'audiooutBR', label: 'Sample rate out', type: 'select', options: rates },
          {
            id: 'audioinFilter',
            label: 'Filter (low filter)',
            type: 'select',
            options: [
              ['0', 'No filter'],
              ['1', 'Filter 1'],
              ['2', 'Filter 2'],
              ['3', 'NS filter low'],
              ['4', 'NS filter moderate'],
              ['5', 'NS filter high'],
              ['6', 'NS filter very high'],
            ],
          },
          { id: 'HFEnabled', label: 'High pass filter', type: 'select', options: onOff },
          { id: 'AECEnabled', label: 'AEC filter', type: 'select', options: onOff },
        ],
      },
    ],
    timelapse: [
      {
        fields: [
          { id: 'tlinterval', label: 'Interval (in seconds)' },
          { id: 'tlduration', label: 'Duration (in minutes)' },
        ],
      },
    ],
    osd: [
      {
        fields: [
          { id: 'osdText', label: 'OSD text (date format)' },
          { id: 'osdEnable', label: 'OSD text', type: 'select', options: onOff },
          { id: 'osdAxis', label: 'OSD axis', type: 'select', options: onOff },
          { id: 'osdColor', label: 'Text color', type: 'select', options: colors },
          { id: 'osdFonts', label: 'Font', type: 'select', options: 'fonts' },
          { id: 'osdSize', label: 'Text size', type: 'number' },
          { id: 'osdPixel', label: 'Pixels between chars' },
          { id: 'osdY', label: 'Y position' },
          { id: 'osdFixW', label: 'Fixed width (only for the default font)', type: 'select', options: onOff },
        ],
      },
    ],
  }

  const tabs = { video: 'Video', audio: 'Audio', timelapse: 'Timelapse', osd: 'OSD' }
  let tab = $state<keyof typeof tabs>('video')

  // Settings the camera can apply immediately (set_config_live), without restarting the stream
  const live = new Set([
    'audioinFilter',
    'HFEnabled',
    'AECEnabled',
    'audioinHWVol',
    'audioinSWVol',
    'frmRateNum',
    'frmRateDen',
    'osdColor',
    'osdSize',
    'osdPixel',
    'osdY',
    'osdFixW',
    'osdFonts',
  ])

  const config = new Config('ui_camera.cgi')
  let dynamic = $state<DynamicOptions>({ fonts: [] })

  onMount(() => {
    config.load(false, (raw) => {
      // The font list comes as <option> HTML with the current font selected
      const fonts = parseOptions(raw.osdFonts ?? '')
      dynamic.fonts = fonts.options
      return { ...raw, osdFonts: fonts.selected }
    })
  })

  function applyLive(id: string) {
    if (!live.has(id)) return
    const params: Record<string, string> = { cmd: 'set_config_live', [id]: config.values[id] ?? '' }
    // The frame rate is set as a pair
    if (id === 'frmRateNum' || id === 'frmRateDen') {
      params.frmRateNum = config.values.frmRateNum ?? ''
      params.frmRateDen = config.values.frmRateDen ?? ''
    }
    post('ui_camera.cgi', params).catch(() => {})
  }
</script>

<section class="card">
  <h1>Camera configuration</h1>
  <Tabs {tabs} bind:active={tab} />
  {#key tab}
    <ConfigForm
      sections={forms[tab]}
      bind:values={config.values}
      {dynamic}
      loading={config.loading}
      error={config.error}
      onchange={applyLive}
      onsave={() => config.save(fieldIds(forms[tab]))}
    />
  {/key}
</section>
