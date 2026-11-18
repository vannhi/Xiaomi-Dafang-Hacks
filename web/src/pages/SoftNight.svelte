<script lang="ts">
  import { onMount } from 'svelte'
  import { get, post } from '../lib/api'
  import { showResult } from '../lib/dialogs.svelte'
  import { poll } from '../lib/poll'
  import StepChart from '../components/StepChart.svelte'

  // Tuning of the software night detection (autonight -S): the page reads the ISP values every
  // second, runs the same rules as the detection service and shows which ones would trigger.

  const p = $state({
    jitter: 3,
    wait: 3,
    exposureNight: 1200000,
    rule2: true,
    exposureDay: 930000,
    rule2Iridix: true,
    iridixDay2: 14,
    count2: 10,
    rule3: true,
    wbDay: 3000,
    rule3Iridix: true,
    iridixDay3: 17,
    count3: 8,
  })

  // Same command line as the autonight service options
  const commandLine = $derived(
    `-S -j ${p.jitter} -w ${p.wait} -1 ${p.exposureNight}` +
      ` -2 ${p.rule2 ? `${p.exposureDay},${p.rule2Iridix ? p.iridixDay2 : 9999},${p.count2}` : '0,0,1'}` +
      ` -3 ${p.rule3 ? `${p.wbDay},${p.rule3Iridix ? p.iridixDay3 : 0},${p.count3}` : '0,0,1'}`,
  )

  function parseConfig(text: string) {
    const option = (flag: string) => text.match(new RegExp(`-${flag}\\s+([^\\s-][^\\s]*)`))?.[1]
    const num = (v: string | undefined, fallback: number) => {
      const n = parseInt(v ?? '', 10)
      return isNaN(n) ? fallback : n
    }
    p.jitter = num(option('j'), p.jitter)
    p.wait = num(option('w'), p.wait)
    p.exposureNight = num(option('1'), p.exposureNight)
    const r2 = option('2')?.split(',')
    if (r2) {
      if (num(r2[0], 0) === 0) p.rule2 = false
      else {
        p.exposureDay = num(r2[0], p.exposureDay)
        p.rule2Iridix = num(r2[1], 0) !== 9999
        if (p.rule2Iridix) p.iridixDay2 = num(r2[1], p.iridixDay2)
        p.count2 = num(r2[2], p.count2)
      }
    }
    const r3 = option('3')?.split(',')
    if (r3) {
      if (num(r3[0], 0) === 0) p.rule3 = false
      else {
        p.wbDay = num(r3[0], p.wbDay)
        p.rule3Iridix = num(r3[1], 0) !== 0
        if (p.rule3Iridix) p.iridixDay3 = num(r3[1], p.iridixDay3)
        p.count3 = num(r3[2], p.count3)
      }
    }
  }

  // Live values -------------------------------------------------------------

  const keys = {
    exposure: 'ISP exposure log2 id',
    wb: 'ISP WB Temperature',
    iridix: 'ISP Iridix strength',
  } as const
  type Key = keyof typeof keys

  let current = $state<Record<Key, number>>({ exposure: NaN, wb: NaN, iridix: NaN })
  let history = $state<Record<Key, [number, number][]>>({ exposure: [], wb: [], iridix: [] })

  let day = $state(true)
  let applyToCamera = $state(true)
  let ready = $state(false)
  let error = $state('')
  let seconds = $state(0)
  let waitCount = $state(0)
  let count2 = $state(0)
  let count3 = $state(0)
  let jittering = $state(false)
  let lastExposure = 0

  const pass = $derived({
    exposureNight: current.exposure > p.exposureNight,
    exposureDay: current.exposure < p.exposureDay,
    iridix2: current.iridix < p.iridixDay2,
    wbDay: current.wb < p.wbDay,
    iridix3: current.iridix > p.iridixDay3,
  })
  const rule2Active = $derived(!day && p.rule2 && pass.exposureDay && (!p.rule2Iridix || pass.iridix2))
  const rule3Active = $derived(!day && p.rule3 && pass.wbDay && (!p.rule3Iridix || pass.iridix3))

  function parseIsp(text: string) {
    const now = Date.now()
    for (const line of text.split('\n')) {
      for (const key of Object.keys(keys) as Key[]) {
        if (!line.startsWith(keys[key])) continue
        const value = parseFloat(line.split(':')[1])
        if (isNaN(value)) continue
        current[key] = value
        history[key] = [...history[key].slice(-180), [now, value]]
      }
    }
  }

  function setMode(night: boolean) {
    day = !night
    waitCount = p.wait
    count2 = 0
    count3 = 0
    if (!applyToCamera) return
    const cmd = (c: string) => get('action.cgi', { cmd: c }).catch(() => {})
    // IR LEDs are only needed at night; the IR filter is removed at night
    cmd(night ? 'ir_led_on' : 'ir_led_off')
    if (night) {
      cmd('toggle-rtsp-nightvision-on')
      cmd('ir_cut_off')
    } else {
      cmd('ir_cut_on')
      cmd('toggle-rtsp-nightvision-off')
    }
  }

  function evaluate() {
    seconds = (seconds + 1) % 60
    const exposure = current.exposure
    if (isNaN(exposure)) return
    jittering = (Math.abs(exposure - lastExposure) / exposure) * 100 >= p.jitter
    lastExposure = exposure
    if (jittering) {
      count2 = 0
      count3 = 0
      return
    }
    if (waitCount > 0) {
      waitCount--
      return
    }
    if (day) {
      if (pass.exposureNight) setMode(true)
      return
    }
    count2 = rule2Active ? count2 + 1 : 0
    count3 = rule3Active ? count3 + 1 : 0
    if (count2 > p.count2 || count3 > p.count3) setMode(false)
  }

  onMount(() => {
    let stop: (() => void) | undefined
    let cancelled = false
    ;(async () => {
      try {
        parseConfig(await get('action.cgi', { cmd: 'get_sw_night_config' }))
        // Start from the current mode of the camera: opening the page must not change it
        day = (await get('state.cgi', { cmd: 'night_mode' })).trim() !== 'ON'
        waitCount = p.wait
        ready = true
      } catch (e) {
        error = (e as Error).message
        return
      }
      if (cancelled) return
      stop = poll(async () => {
        try {
          parseIsp(await get('ui_softnight.cgi'))
          error = ''
          evaluate()
        } catch (e) {
          error = (e as Error).message
          throw e
        }
      }, 1000)
    })()
    return () => {
      cancelled = true
      stop?.()
    }
  })

  function save() {
    showResult('Save configuration', () => post('action.cgi', { val: commandLine }, { cmd: 'save_sw_night_config' }))
  }

  const fmt = (n: number) => (isNaN(n) ? '–' : String(n))
</script>

{#snippet live(value: number, ok: boolean)}
  <output class="live" class:ok class:ko={!ok && !isNaN(value)}>{fmt(value)}</output>
{/snippet}

<section class="card">
  <h1>Software night detection</h1>
  <p class="muted">Please stop the auto night detection service while tuning, if it is running.</p>
  {#if error}<p class="error">Camera unreachable: {error}</p>{/if}

  <div class="status">
    <div class="mode" class:night={!day}>{day ? 'Day mode' : 'Night mode'}</div>
    <div class="muted">Seconds: <strong>{seconds}</strong></div>
    <label class="check">
      <input type="checkbox" bind:checked={applyToCamera} />
      Switch the camera when a rule triggers
    </label>
  </div>

  <div class="field cmd">
    <label for="cmdline">Command line</label>
    <div class="cmd-row">
      <input id="cmdline" readonly value={commandLine} />
      <button class="btn primary" type="button" onclick={save} disabled={!ready}>Save</button>
    </div>
  </div>

  <div class="rules">
    <div class="rule" class:active={jittering}>
      If the exposure changes by more than
      <input type="number" bind:value={p.jitter} min="0" class="small" /> %, ignore the measure
    </div>

    <div class="rule" class:active={waitCount > 0}>
      Wait <input type="number" bind:value={p.wait} min="0" class="small" /> seconds after changing mode
      {#if waitCount > 0}<span class="muted">({waitCount} left)</span>{/if}
    </div>

    <div class="rule" class:active={day && pass.exposureNight}>
      <h3>Day → night</h3>
      If exposure {@render live(current.exposure, pass.exposureNight)} &gt;
      <input type="number" bind:value={p.exposureNight} class="medium" /> enable night mode
    </div>

    <div class="rule" class:active={rule2Active} class:disabled={!p.rule2}>
      <h3><label class="check"><input type="checkbox" bind:checked={p.rule2} /> Night → day (exposure)</label></h3>
      If exposure {@render live(current.exposure, pass.exposureDay)} &lt;
      <input type="number" bind:value={p.exposureDay} class="medium" disabled={!p.rule2} />
      <span class:disabled={!p.rule2Iridix}>
        <label class="check inline">
          <input type="checkbox" bind:checked={p.rule2Iridix} disabled={!p.rule2} /> and
        </label>
        Iridix {@render live(current.iridix, pass.iridix2)} &lt;
        <input type="number" bind:value={p.iridixDay2} class="small" disabled={!p.rule2 || !p.rule2Iridix} />
      </span>
      then increment the count ({count2}); if count &gt;
      <input type="number" bind:value={p.count2} class="small" disabled={!p.rule2} /> switch to day mode
    </div>

    <div class="rule" class:active={rule3Active} class:disabled={!p.rule3}>
      <h3><label class="check"><input type="checkbox" bind:checked={p.rule3} /> Night → day (white balance)</label></h3>
      If white balance temperature {@render live(current.wb, pass.wbDay)} &lt;
      <input type="number" bind:value={p.wbDay} class="medium" disabled={!p.rule3} />
      <span class:disabled={!p.rule3Iridix}>
        <label class="check inline">
          <input type="checkbox" bind:checked={p.rule3Iridix} disabled={!p.rule3} /> and
        </label>
        Iridix {@render live(current.iridix, pass.iridix3)} &gt;
        <input type="number" bind:value={p.iridixDay3} class="small" disabled={!p.rule3 || !p.rule3Iridix} />
      </span>
      then increment the count ({count3}); if count &gt;
      <input type="number" bind:value={p.count3} class="small" disabled={!p.rule3} /> switch to day mode
    </div>
  </div>

  <h2>ISP exposure log2 id</h2>
  <StepChart points={history.exposure} thresholds={[p.exposureNight, p.rule2 ? p.exposureDay : NaN]} />
  <h2>ISP white balance temperature</h2>
  <StepChart points={history.wb} thresholds={[p.rule3 ? p.wbDay : NaN]} />
  <h2>ISP Iridix strength</h2>
  <StepChart
    points={history.iridix}
    thresholds={[p.rule2 && p.rule2Iridix ? p.iridixDay2 : NaN, p.rule3 && p.rule3Iridix ? p.iridixDay3 : NaN]}
  />
</section>

<style>
  .status {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.75rem 1.5rem;
    margin-bottom: 1rem;
  }

  .mode {
    padding: 0.3rem 0.8rem;
    border: 1px solid var(--border);
    border-radius: 20px;
    background: #fff;
    color: #111;
    font-weight: 600;
  }

  .mode.night {
    background: #111;
    color: #fff;
  }

  .cmd-row {
    display: flex;
    gap: 0.5rem;
  }

  .cmd-row input {
    font-family: var(--mono);
  }

  .rules {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    margin: 1.25rem 0;
  }

  .rule {
    padding: 0.75rem 1rem;
    border: 1px solid var(--border);
    border-left: 4px solid var(--border);
    border-radius: 8px;
    line-height: 2.4;
    transition: border-color 0.2s, background 0.2s;
  }

  .rule.active {
    border-left-color: var(--warn);
    background: color-mix(in srgb, var(--warn) 10%, transparent);
  }

  .rule h3 {
    margin: 0;
    font-size: 0.95rem;
    line-height: 1.8;
  }

  .disabled {
    opacity: 0.6;
  }

  .rule input.small,
  .rule input.medium {
    display: inline-block;
    min-height: 32px;
    padding: 0.2rem 0.4rem;
    vertical-align: middle;
  }

  .rule input.small {
    width: 5.5em;
  }

  .rule input.medium {
    width: 9em;
  }

  .check.inline {
    display: inline-flex;
  }

  .live {
    display: inline-block;
    min-width: 4em;
    padding: 0 0.4rem;
    border-radius: 4px;
    background: var(--surface-2);
    font-family: var(--mono);
    text-align: center;
  }

  .live.ok {
    color: var(--ok);
  }

  .live.ko {
    color: var(--danger);
  }
</style>
