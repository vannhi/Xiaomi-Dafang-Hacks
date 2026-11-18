<script lang="ts">
  import { onMount } from 'svelte'
  import { get, htmlToText } from './lib/api'
  import { href, pages, route, type Page } from './lib/router.svelte'
  import { accents, applyTheme, theme, type Accent } from './lib/theme.svelte'
  import Icon from './components/Icon.svelte'
  import Modal from './components/Modal.svelte'
  import Dialogs from './components/Dialogs.svelte'
  import Live from './pages/Live.svelte'
  import System from './pages/System.svelte'
  import Camera from './pages/Camera.svelte'
  import NetServices from './pages/NetServices.svelte'
  import Motion from './pages/Motion.svelte'
  import SoftNight from './pages/SoftNight.svelte'
  import Control from './pages/Control.svelte'
  import Info from './pages/Info.svelte'
  import SdCard from './pages/SdCard.svelte'
  import ConfigFiles from './pages/ConfigFiles.svelte'

  const components = {
    live: Live,
    system: System,
    camera: Camera,
    net_services: NetServices,
    motion: Motion,
    softnight: SoftNight,
    control: Control,
    info: Info,
    sdcard: SdCard,
    config_files: ConfigFiles,
  }
  const settingsPages: Page[] = ['system', 'camera', 'net_services', 'motion', 'softnight', 'config_files']

  const PageComponent = $derived(components[route.page])

  let hostname = $state('')
  let version = $state('')
  let sdcardReadOnly = $state(false)
  let settingsOpen = $state(false)
  let notificationsOpen = $state(false)
  let aboutOpen = $state(false)
  let themeOpen = $state(false)

  $effect(() => {
    document.title = hostname ? `${hostname} · ${pages[route.page]}` : pages[route.page]
  })

  $effect(() => {
    // Track the theme so every change is applied and remembered
    void theme.scheme
    void theme.accent
    applyTheme()
  })

  onMount(() => {
    get('state.cgi', { cmd: 'hostname' })
      .then((h) => (hostname = h.trim()))
      .catch(() => {})
    get('ui_sdcard.cgi', { cmd: 'check_sdcard' })
      .then((r) => (sdcardReadOnly = r.trim() === 'nok'))
      .catch(() => {})
  })

  function openAbout() {
    aboutOpen = true
    if (!version)
      get('state.cgi', { cmd: 'version' })
        .then((v) => (version = htmlToText(v)))
        .catch((e) => (version = `Unavailable (${e.message})`))
  }

  // Close the menus when clicking anywhere else
  function closeMenus(e: MouseEvent) {
    if (!(e.target as Element).closest('.menu')) {
      settingsOpen = false
      notificationsOpen = false
    }
  }
</script>

<svelte:window onclick={closeMenus} onhashchange={() => (settingsOpen = false)} />

<header class="topbar">
  <nav>
    <a class="brand" href={href('live')} title="Live view">
      <Icon name="camera" size={22} />
      <span class="hostname">{hostname || 'Dafang Hacks'}</span>
    </a>
    <a class="nav-item" class:active={route.page === 'live'} href={href('live')} title="Live view">
      <Icon name="home" /><span class="text">Live</span>
    </a>
    <div class="menu">
      <button
        class="nav-item"
        class:active={settingsPages.includes(route.page)}
        type="button"
        aria-expanded={settingsOpen}
        onclick={() => ((settingsOpen = !settingsOpen), (notificationsOpen = false))}
        title="Settings"
      >
        <Icon name="settings" /><span class="text">Settings</span><Icon name="down" size={14} />
      </button>
      {#if settingsOpen}
        <div class="dropdown">
          {#each settingsPages as page (page)}
            <a href={href(page)} class:active={route.page === page} onclick={() => (settingsOpen = false)}>
              {pages[page]}
            </a>
          {/each}
        </div>
      {/if}
    </div>
    <a class="nav-item" class:active={route.page === 'control'} href={href('control')} title="System control">
      <Icon name="tools" /><span class="text">Control</span>
    </a>
    <a class="nav-item" class:active={route.page === 'info'} href={href('info')} title="System information">
      <Icon name="info" /><span class="text">Info</span>
    </a>
    <a class="nav-item" class:active={route.page === 'sdcard'} href={href('sdcard')} title="Files on the SD card">
      <Icon name="sdcard" /><span class="text">SD card</span>
    </a>
    <div class="menu right">
      <button
        class="nav-item"
        class:alert={sdcardReadOnly}
        type="button"
        aria-expanded={notificationsOpen}
        onclick={() => ((notificationsOpen = !notificationsOpen), (settingsOpen = false))}
        title="Notifications"
      >
        <Icon name="bell" label="Notifications" />
        {#if sdcardReadOnly}<span class="badge"></span>{/if}
      </button>
      {#if notificationsOpen}
        <div class="dropdown notifications">
          {#if sdcardReadOnly}
            <p>
              <strong>The SD card is mounted read-only.</strong> Settings can't be saved.
            </p>
            <p>
              Please try rebooting. If the problem persists, please
              <a
                target="_blank"
                rel="noreferrer"
                href="https://github.com/EliasKotlyar/Xiaomi-Dafang-Hacks/search?q=read+only+sdcard&type=Issues"
                >search for possible solutions</a
              >.
            </p>
          {:else}
            <p class="muted">No notifications</p>
          {/if}
        </div>
      {/if}
    </div>
  </nav>
</header>

<main>
  {#key route.page}
    <PageComponent />
  {/key}
</main>

<footer class="bottombar">
  <a
    class="icon-btn"
    href="https://github.com/EliasKotlyar/Xiaomi-Dafang-Hacks"
    target="_blank"
    rel="noreferrer"
    title="GitHub project page"><Icon name="github" label="GitHub" /></a
  >
  <button class="icon-btn" type="button" onclick={openAbout} title="About"><Icon name="info" label="About" /></button>
  <button class="icon-btn" type="button" onclick={() => (themeOpen = true)} title="Theme">
    <Icon name="palette" label="Theme" />
  </button>
</footer>

<Modal bind:open={aboutOpen} title="About">
  <p><strong>Dafang Hacks</strong></p>
  <p>Version: {version || '…'}</p>
  <p>
    <a href="https://github.com/EliasKotlyar/Xiaomi-Dafang-Hacks/issues" target="_blank" rel="noreferrer"
      >Report and view issues</a
    >
  </p>
</Modal>

<Modal bind:open={themeOpen} title="Theme">
  <div class="field">
    <span>Appearance</span>
    <div class="segmented">
      {#each [['auto', 'Automatic'], ['light', 'Light'], ['dark', 'Dark']] as [value, label] (value)}
        <label class:active={theme.scheme === value}>
          <input type="radio" name="scheme" {value} bind:group={theme.scheme} class="sr-only" />
          {#if value === 'light'}<Icon name="sun" size={16} />{:else if value === 'dark'}<Icon
              name="moon"
              size={16}
            />{/if}
          {label}
        </label>
      {/each}
    </div>
  </div>
  <div class="field accent-field">
    <span>Accent color</span>
    <div class="swatches">
      {#each Object.entries(accents) as [name, color] (name)}
        <button
          type="button"
          class="swatch"
          class:active={theme.accent === name}
          style:background={color}
          title={name}
          aria-label={name}
          onclick={() => (theme.accent = name as Accent)}
        ></button>
      {/each}
    </div>
  </div>
</Modal>

<Dialogs />

<style>
  .topbar {
    position: sticky;
    top: 0;
    z-index: 10;
    background: var(--accent);
    color: var(--on-accent);
    box-shadow: var(--shadow);
  }

  nav {
    display: flex;
    align-items: center;
    gap: 0.15rem;
    max-width: 1200px;
    margin: 0 auto;
    padding: 0.35rem 16px;
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-right: 0.75rem;
    color: inherit;
    text-decoration: none;
    font-weight: 700;
    min-width: 0;
  }

  .hostname {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 22ch;
  }

  .nav-item {
    position: relative;
    display: flex;
    align-items: center;
    gap: 0.35rem;
    height: 38px;
    padding: 0 0.65rem;
    border: 0;
    border-radius: 8px;
    background: none;
    color: inherit;
    font: inherit;
    text-decoration: none;
    cursor: pointer;
    opacity: 0.85;
  }

  .nav-item:hover,
  .nav-item.active {
    background: rgb(255 255 255 / 0.16);
    opacity: 1;
  }

  .nav-item.alert {
    color: #ffe066;
  }

  .badge {
    position: absolute;
    top: 7px;
    right: 7px;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #ff6b6b;
  }

  .menu {
    position: relative;
  }

  .menu.right {
    margin-left: auto;
  }

  .dropdown {
    position: absolute;
    top: calc(100% + 6px);
    left: 0;
    min-width: 230px;
    padding: 0.35rem;
    background: var(--surface);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    box-shadow: 0 8px 24px rgb(0 0 0 / 0.18);
  }

  .menu.right .dropdown {
    left: auto;
    right: 0;
  }

  .dropdown a {
    display: block;
    padding: 0.5rem 0.75rem;
    border-radius: 6px;
    color: inherit;
    text-decoration: none;
  }

  .dropdown a:hover,
  .dropdown a.active {
    background: var(--surface-2);
  }

  .notifications {
    width: min(300px, calc(100vw - 32px));
    padding: 0.25rem 0.9rem;
  }

  main {
    max-width: 1200px;
    margin: 0 auto;
    padding: 1rem 16px;
  }

  .bottombar {
    display: flex;
    justify-content: center;
    gap: 0.5rem;
    padding: 0.5rem 0 1.5rem;
    color: var(--muted);
  }

  .segmented {
    display: flex;
    border: 1px solid var(--border);
    border-radius: 8px;
    overflow: hidden;
  }

  .segmented label {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.35rem;
    padding: 0.45rem;
    cursor: pointer;
  }

  .segmented label + label {
    border-left: 1px solid var(--border);
  }

  .segmented label.active {
    background: var(--accent);
    color: var(--on-accent);
  }

  .accent-field {
    margin-top: 1rem;
  }

  .swatches {
    display: flex;
    flex-wrap: wrap;
    gap: 0.6rem;
  }

  .swatch {
    width: 34px;
    height: 34px;
    border-radius: 50%;
    border: 3px solid var(--surface);
    box-shadow: 0 0 0 1px var(--border);
    cursor: pointer;
  }

  .swatch.active {
    box-shadow: 0 0 0 2px var(--text);
  }

  @media (max-width: 760px) {
    .text,
    .hostname {
      display: none;
    }

    .brand {
      margin-right: 0.25rem;
    }

    .nav-item {
      padding: 0 0.55rem;
    }
  }
</style>
