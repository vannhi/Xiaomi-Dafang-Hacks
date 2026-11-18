<script lang="ts">
  import { get, parseColon } from '../lib/api'
  import { poll } from '../lib/poll'

  // Switches of the side panel (ui_live.cgi status_all / <id> action=on|off)
  const groups: [string, [string, string][]][] = [
    [
      'Camera',
      [
        ['auto_night_mode', 'Auto night detection'],
        ['night_mode', 'Night mode'],
        ['ir_led', 'IR LED'],
        ['ir_cut', 'IR filter'],
        ['blue_led', 'Blue LED'],
        ['yellow_led', 'Yellow LED'],
      ],
    ],
    [
      'Motion',
      [
        ['motion_detection', 'Detection'],
        ['motion_mail', 'Send emails'],
        ['motion_telegram', 'Send Telegram'],
        ['motion_led', 'Yellow LED'],
        ['motion_snapshot', 'Snapshots'],
        ['motion_mqtt', 'MQTT message'],
        ['motion_mqtt_snapshot', 'MQTT snapshot'],
        ['motion_mqtt_video', 'MQTT video'],
      ],
    ],
  ]

  let states = $state<Record<string, boolean>>({})
  let loaded = $state(false)
  let error = $state('')
  // Status requests started before a toggle must not revert it
  let generation = 0

  $effect(() =>
    poll(async () => {
      const started = generation
      try {
        const status = parseColon(await get('ui_live.cgi', { cmd: 'status_all' }))
        if (started !== generation) return
        states = Object.fromEntries(Object.entries(status).map(([k, v]) => [k, v === 'ON']))
        loaded = true
        error = ''
      } catch (e) {
        error = (e as Error).message
        throw e
      }
    }, 2000),
  )

  async function toggle(id: string, on: boolean) {
    generation++
    states[id] = on
    try {
      await get('ui_live.cgi', { cmd: id, action: on ? 'on' : 'off' })
    } catch (e) {
      error = (e as Error).message
    }
  }
</script>

{#if error}
  <p class="error">Camera unreachable: {error}</p>
{/if}
{#each groups as [title, switches] (title)}
  <h3>{title}</h3>
  {#each switches as [id, label] (id)}
    <label class="switch-row">
      <span>{label}</span>
      <input
        type="checkbox"
        role="switch"
        class="switch"
        disabled={!loaded}
        checked={states[id] ?? false}
        onchange={(e) => toggle(id, e.currentTarget.checked)}
      />
    </label>
  {/each}
{/each}

<style>
  h3 {
    margin: 1rem 0 0.25rem;
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--muted);
  }

  .switch-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.45rem 0;
    cursor: pointer;
  }
</style>
