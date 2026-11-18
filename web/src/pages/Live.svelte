<script lang="ts">
  import { onMount } from 'svelte'
  import { cgiUrl, get } from '../lib/api'
  import { Snapshot } from '../lib/snapshot.svelte'
  import { Talk } from '../lib/talk'
  import Icon from '../components/Icon.svelte'
  import CameraSwitches from '../components/CameraSwitches.svelte'

  const snapshot = new Snapshot()

  let hostname = $state('')
  let hasMotor = $state(false)
  let ptz = $state(false)
  let recording = $state(false)
  let talking = $state(false)
  let talk: Talk | undefined
  let panelOpen = $state(false)
  let message = $state('')

  onMount(() => {
    snapshot.start(1000)
    get('ui_live.cgi', { cmd: 'hostname' }).then((h) => (hostname = h.trim()), () => {})
    // Pan / tilt motors only exist on the Dafang
    get('ui_live.cgi', { cmd: 'show_HWmodel' }).then((m) => (hasMotor = m.trim() === 'Xiaomi Dafang'), () => {})
    get('ui_live.cgi', { cmd: 'recording', action: 'status' }).then((r) => (recording = r.trim() === 'ON'), () => {})
    return () => snapshot.destroy()
  })

  function flash(text: string) {
    message = text
    setTimeout(() => message === text && (message = ''), 4000)
  }

  async function move(direction: string) {
    try {
      await get('ui_live.cgi', { cmd: 'motor', move: direction })
      setTimeout(() => snapshot.refresh().catch(() => {}), 500)
    } catch (e) {
      flash(`Motor command failed: ${(e as Error).message}`)
    }
  }

  async function flip() {
    await get('ui_live.cgi', { cmd: 'flip' }).catch((e) => flash(`Flip failed: ${e.message}`))
  }

  async function toggleRecording() {
    const action = recording ? 'off' : 'on'
    try {
      await get('ui_live.cgi', { cmd: 'recording', action })
      recording = action === 'on'
    } catch (e) {
      flash(`Recording command failed: ${(e as Error).message}`)
    }
  }

  async function startTalk(e: PointerEvent) {
    if (talking) return
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    talking = true
    const current = (talk = new Talk())
    try {
      await current.start()
    } catch (err) {
      // Release whatever was opened before the failure
      current.stop().catch(() => {})
      if (talk === current) {
        talk = undefined
        talking = false
      }
      flash(`Microphone unavailable: ${(err as Error).message}`)
    }
  }

  function stopTalk() {
    if (!talking) return
    talking = false
    const current = talk
    talk = undefined
    if (!current) return
    // The camera does not play the last two seconds of a sound: keep recording a bit longer
    setTimeout(() => {
      current.stop().catch((err) => flash(`Unable to send the sound: ${err.message}`))
    }, 2000)
  }
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && (panelOpen = false)} />

<section class="card live">
  <h1>{hostname || 'Live view'}</h1>
  <div class="stage" class:ptz>
    <div class="viewer">
      {#if snapshot.src}
        <img src={snapshot.src} alt="Live view of the camera" />
      {:else if !snapshot.error}
        <div class="placeholder"><span class="spinner"></span></div>
      {/if}
      {#if snapshot.error}
        <div class="placeholder error-overlay">
          <Icon name="camera" size={40} />
          <span>Unable to load the picture, retrying…</span>
        </div>
      {/if}

      {#if ptz}
        <button class="ctl pos-left" type="button" onclick={() => move('left')} title="Left"><Icon name="left" /></button>
        <button class="ctl pos-right" type="button" onclick={() => move('right')} title="Right"><Icon name="right" /></button>
        <button class="ctl pos-up" type="button" onclick={() => move('up')} title="Up"><Icon name="up" /></button>
        <button class="ctl pos-down" type="button" onclick={() => move('down')} title="Down"><Icon name="down" /></button>
        <div class="ptz-extra">
          <button class="pill" type="button" onclick={() => move('reset_pos_count')} title="Calibrate the motors">
            <Icon name="target" size={16} /> Calibrate
          </button>
          <button class="pill" type="button" onclick={flip} title="Flip the image"><Icon name="flip" size={16} /> Flip</button>
        </div>
      {/if}
    </div>

    <div class="toolbar">
      <button
        class="ctl"
        class:on={talking}
        type="button"
        title="Push to talk (hold)"
        onpointerdown={startTalk}
        onpointerup={stopTalk}
        onpointercancel={stopTalk}
        oncontextmenu={(e) => e.preventDefault()}
      >
        <Icon name="mic" />
      </button>
      <button class="ctl" class:on={recording} type="button" onclick={toggleRecording} title="Recording on / off">
        <Icon name="video" />
      </button>
      <a class="ctl" href={cgiUrl('downloadpic.cgi')} download title="Download a screenshot"><Icon name="image" /></a>
      {#if hasMotor}
        <button class="ctl" class:active={ptz} type="button" onclick={() => (ptz = !ptz)} title="Pan / tilt control">
          <Icon name="move" />
        </button>
      {/if}
      <button class="ctl" type="button" onclick={() => (panelOpen = true)} title="Camera settings">
        <Icon name="settings" />
      </button>
    </div>
  </div>
  {#if message}
    <p class="error message">{message}</p>
  {/if}
</section>

{#if panelOpen}
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="overlay" onclick={() => (panelOpen = false)}></div>
  <aside class="panel" aria-label="Camera settings">
    <header>
      <h2>Camera controls</h2>
      <button class="icon-btn" type="button" onclick={() => (panelOpen = false)} aria-label="Close">
        <Icon name="close" />
      </button>
    </header>
    <CameraSwitches />
  </aside>
{/if}

<style>
  .live h1 {
    margin-bottom: 0.75rem;
  }

  .stage {
    position: relative;
  }

  .viewer {
    position: relative;
    background: #000;
    border-radius: 8px;
    overflow: hidden;
    aspect-ratio: 16 / 9;
  }

  img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

  .placeholder {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    color: #ccc;
  }

  .error-overlay {
    background: rgb(0 0 0 / 0.55);
  }

  .ctl {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    border: 0;
    border-radius: 50%;
    background: rgb(0 0 0 / 0.6);
    color: #fff;
    cursor: pointer;
    text-decoration: none;
    touch-action: none;
    user-select: none;
    -webkit-user-select: none;
  }

  .ctl:hover {
    background: rgb(0 0 0 / 0.8);
  }

  .ctl.active {
    background: var(--accent);
  }

  .ctl.on {
    color: #ff6b6b;
  }

  .pos-left,
  .pos-right,
  .pos-up,
  .pos-down {
    position: absolute;
  }

  .pos-left {
    left: 12px;
    top: 50%;
    transform: translateY(-50%);
  }

  .pos-right {
    right: 12px;
    top: 50%;
    transform: translateY(-50%);
  }

  .pos-up {
    top: 12px;
    left: 50%;
    transform: translateX(-50%);
  }

  .pos-down {
    bottom: 12px;
    left: 50%;
    transform: translateX(-50%);
  }

  .ptz-extra {
    position: absolute;
    top: 12px;
    right: 12px;
    display: flex;
    gap: 0.4rem;
  }

  .pill {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    height: 34px;
    padding: 0 0.75rem;
    border: 0;
    border-radius: 17px;
    background: rgb(0 0 0 / 0.6);
    color: #fff;
    font: inherit;
    font-size: 0.85rem;
    cursor: pointer;
  }

  .toolbar {
    position: absolute;
    right: 12px;
    bottom: 12px;
    display: flex;
    gap: 0.4rem;
    opacity: 0;
    transition: opacity 0.2s;
  }

  .stage.ptz .toolbar {
    bottom: 64px;
  }

  .stage:hover .toolbar,
  .stage:focus-within .toolbar {
    opacity: 1;
  }

  /* No hover on touch screens: always show the controls */
  @media (hover: none) {
    .toolbar {
      opacity: 1;
    }
  }

  .message {
    margin: 0.75rem 0 0;
  }

  .overlay {
    position: fixed;
    inset: 0;
    z-index: 20;
    background: rgb(0 0 0 / 0.4);
  }

  .panel {
    position: fixed;
    top: 0;
    bottom: 0;
    left: 0;
    z-index: 21;
    width: min(320px, 88vw);
    overflow-y: auto;
    padding: 0.75rem 1.25rem 1.25rem;
    background: var(--surface);
    box-shadow: 4px 0 24px rgb(0 0 0 / 0.25);
    animation: slide 0.2s ease-out;
  }

  .panel header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .panel h2 {
    margin: 0;
  }

  @keyframes slide {
    from {
      transform: translateX(-100%);
    }
  }

  /* Small screens: controls below the picture, always visible */
  @media (max-width: 600px) {
    .ctl {
      width: 38px;
      height: 38px;
    }

    .toolbar,
    .stage.ptz .toolbar {
      position: static;
      justify-content: center;
      margin-top: 0.75rem;
      opacity: 1;
    }

    .toolbar .ctl {
      background: var(--surface-2);
      color: var(--text);
    }

    .toolbar .ctl.active {
      background: var(--accent);
      color: var(--on-accent);
    }

    .toolbar .ctl.on {
      color: var(--danger);
    }
  }
</style>
