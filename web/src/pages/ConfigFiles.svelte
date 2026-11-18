<script lang="ts" module>
  // Unsaved edits, kept while browsing other files or pages
  const drafts = new Map<string, { original: string; content: string }>()
</script>

<script lang="ts">
  import { onMount } from 'svelte'
  import { call, cgiUrl } from '../lib/api'
  import { confirm } from '../lib/dialogs.svelte'
  import { href } from '../lib/router.svelte'
  import { parseLs, type LsEntry } from '../lib/ls'
  import Icon from '../components/Icon.svelte'

  // Raw view and edition of the files of /system/sdcard/config (ui_config.cgi)

  const SCRIPT = 'ui_config.cgi'
  const MAX_SIZE = 65536

  // Files whose mistakes can cut the access to the camera
  const warnings: Record<string, string> = {
    'lighttpd.conf': 'Web server configuration: a mistake can make this web interface unreachable.',
    'lighttpd.user': 'Password of this web interface: a mistake locks you out of it.',
    'wpa_supplicant.conf': 'Wi-Fi connection: a mistake disconnects the camera from the network.',
    'hostapd.conf': 'Access point settings: a mistake can make the camera unreachable when it falls back to its access point.',
    'wifi.conf': 'Wi-Fi settings: a mistake can disconnect the camera from the network.',
    'staticip.conf': 'Network address: a mistake makes the camera unreachable.',
    'defaultgw.conf': 'Network gateway: a mistake makes the camera unreachable.',
    'resolv.conf': 'DNS servers: a mistake breaks name resolution (updates, notifications).',
    'usb_eth_driver.conf': 'USB Ethernet: enabling it disables the Wi-Fi.',
    'ssh.conf': 'SSH server: a mistake can block the SSH access.',
  }

  interface ConfigFile extends LsEntry {
    hasBackup: boolean
  }

  let files = $state<ConfigFile[]>([])
  let listState = $state<'loading' | 'ready' | string>('loading')
  let filter = $state('')

  let selected = $state<string>()
  let original = $state('')
  let content = $state('')
  let fileState = $state<'idle' | 'loading' | 'ready' | string>('idle')
  let saving = $state(false)
  let message = $state<{ text: string; error: boolean }>()
  // Drafts are kept in a plain map: bump this to refresh the "modified" markers
  let draftsVersion = $state(0)

  const current = $derived(files.find((f) => f.path === selected))
  const dirty = $derived(fileState === 'ready' && content !== original)
  // Not valid UTF-8 text: saving would corrupt it
  const binary = $derived(/[\0�]/.test(original))
  const tooLarge = $derived(new Blob([content]).size > MAX_SIZE)
  const warning = $derived(selected ? warnings[selected] : undefined)

  const groups = $derived.by(() => {
    const needle = filter.trim().toLowerCase()
    const map = new Map<string, ConfigFile[]>()
    for (const f of files) {
      if (needle && !f.path.toLowerCase().includes(needle)) continue
      const dir = f.path.includes('/') ? f.path.slice(0, f.path.lastIndexOf('/')) : ''
      map.set(dir, [...(map.get(dir) ?? []), f])
    }
    return [...map].sort(([a], [b]) => (a === '' ? -1 : b === '' ? 1 : a.localeCompare(b)))
  })

  const name = (path: string) => path.slice(path.lastIndexOf('/') + 1)

  function hasDraft(path: string) {
    void draftsVersion
    return drafts.has(path)
  }

  async function loadList() {
    try {
      const entries = parseLs(await call(SCRIPT, { cmd: 'list' })).map((e) => ({ ...e, path: e.path.replace(/^\.\//, '') }))
      const paths = new Set(entries.map((e) => e.path))
      files = entries
        .filter((e) => !e.path.endsWith('.bak'))
        .map((e) => ({ ...e, hasBackup: paths.has(e.path + '.bak') }))
        .sort((a, b) => a.path.localeCompare(b.path))
      listState = 'ready'
    } catch (e) {
      listState = (e as Error).message
    }
  }

  async function open(path: string) {
    keepDraft()
    selected = path
    message = undefined
    fileState = 'loading'
    try {
      const text = await call(SCRIPT, { cmd: 'read', file: path })
      if (selected !== path) return
      original = text
      const draft = drafts.get(path)
      if (draft && draft.original === text) content = draft.content
      else {
        content = text
        if (draft) {
          drafts.delete(path)
          draftsVersion++
          message = { text: 'The file changed on the camera: your unsaved edits were discarded.', error: true }
        }
      }
      fileState = 'ready'
    } catch (e) {
      if (selected === path) fileState = (e as Error).message
    }
  }

  function keepDraft() {
    if (!selected || fileState !== 'ready') return
    if (content !== original) drafts.set(selected, { original, content })
    else drafts.delete(selected)
    draftsVersion++
  }

  async function save() {
    if (!selected || !dirty || saving || binary || tooLarge) return
    const path = selected
    if (
      warning &&
      !(await confirm(`${warning}\n\nSave ${path} anyway?`, { title: 'Sensitive file', action: 'Save', danger: true }))
    )
      return
    saving = true
    try {
      const text = content
      const answer = await call(SCRIPT, { cmd: 'write', file: path }, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        body: text,
      })
      original = text
      drafts.delete(path)
      draftsVersion++
      message = { text: answer.trim(), error: false }
      loadList()
    } catch (e) {
      message = { text: `Not saved: ${(e as Error).message}`, error: true }
    } finally {
      saving = false
    }
  }

  async function restore() {
    if (!selected || !current?.hasBackup) return
    const path = selected
    const ok = await confirm(
      `Replace ${path} by its previous version (${path}.bak)?\nThe current version becomes the backup, so this can be undone.` +
        (dirty ? '\nYour unsaved edits will be lost.' : ''),
      { title: 'Restore previous version', action: 'Restore', danger: !!warning },
    )
    if (!ok) return
    try {
      const answer = await call(SCRIPT, { cmd: 'restore', file: path }, { method: 'POST' })
      drafts.delete(path)
      draftsVersion++
      fileState = 'idle'
      await open(path)
      message = { text: answer.trim(), error: false }
      loadList()
    } catch (e) {
      message = { text: `Not restored: ${(e as Error).message}`, error: true }
    }
  }

  async function revert() {
    if (dirty && !(await confirm('Discard your unsaved edits?', { action: 'Discard', danger: true }))) return
    if (selected) {
      drafts.delete(selected)
      draftsVersion++
      fileState = 'idle'
      open(selected)
    }
  }

  function onkeydown(e: KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' && selected) {
      e.preventDefault()
      save()
    }
  }

  function onbeforeunload(e: BeforeUnloadEvent) {
    keepDraft()
    if (drafts.size) e.preventDefault()
  }

  onMount(() => {
    loadList()
    return keepDraft
  })
</script>

<svelte:window {onkeydown} {onbeforeunload} />

<section class="card">
  <h1>Configuration files</h1>
  <p class="muted intro">
    Raw content of <code>/system/sdcard/config</code>. Each save keeps the previous version as a <code>.bak</code>
    file. Changes are applied when the related service restarts (<a href={href('control')}>Control</a>) or at the
    next reboot.
  </p>

  <div class="layout" class:has-file={selected}>
    <nav class="files" aria-label="Configuration files">
      <input type="search" placeholder="Filter files" bind:value={filter} />
      {#if listState === 'loading'}
        <p class="muted"><span class="spinner"></span> Loading…</p>
      {:else if listState !== 'ready'}
        <p class="error">Unable to list the files: {listState}</p>
      {:else}
        {#each groups as [dir, list] (dir)}
          {#if dir}<h3>{dir}/</h3>{/if}
          <ul>
            {#each list as f (f.path)}
              <li>
                <button type="button" class:active={f.path === selected} onclick={() => open(f.path)} title={f.path}>
                  <Icon name="file" size={16} />
                  <span class="file-name">{name(f.path)}</span>
                  {#if hasDraft(f.path) && f.path !== selected}<span class="dot" title="Unsaved edits"></span>{/if}
                  {#if warnings[f.path]}<span class="sensitive" title="Sensitive file">!</span>{/if}
                </button>
              </li>
            {/each}
          </ul>
        {:else}
          <p class="muted">No matching file.</p>
        {/each}
      {/if}
    </nav>

    <div class="editor">
      {#if !selected}
        <p class="muted empty">Select a file to view or edit it.</p>
      {:else}
        <div class="editor-head">
          <button class="icon-btn back" type="button" onclick={() => (keepDraft(), (selected = undefined))} aria-label="Back to the list">
            <Icon name="left" />
          </button>
          <div class="title">
            <strong>{selected}</strong>{#if dirty}<span class="muted">&nbsp;· modified</span>{/if}
            {#if current}<div class="muted meta">{current.size} bytes · {current.date}</div>{/if}
          </div>
          <a
            class="icon-btn"
            href={cgiUrl(SCRIPT, { cmd: 'read', file: selected })}
            download={name(selected)}
            title="Download"><Icon name="download" size={18} /></a
          >
        </div>

        {#if warning}
          <p class="warning"><strong>Sensitive file.</strong> {warning}</p>
        {/if}

        {#if fileState === 'loading'}
          <p class="muted"><span class="spinner"></span> Loading…</p>
        {:else if fileState !== 'ready'}
          <p class="error">Unable to read the file: {fileState}</p>
        {:else}
          {#if binary}
            <p class="warning">This file is not plain text: it can only be viewed.</p>
          {/if}
          <textarea
            bind:value={content}
            readonly={binary}
            spellcheck="false"
            autocomplete="off"
            autocapitalize="off"
            wrap="off"
            aria-label="Content of {selected}"
          ></textarea>
          {#if tooLarge}<p class="error">The file is too large to be saved (limit: 64 KB).</p>{/if}
          <div class="actions">
            <button class="btn primary" type="button" onclick={save} disabled={!dirty || saving || binary || tooLarge}>
              {#if saving}<span class="spinner"></span>{/if} Save
            </button>
            <button class="btn" type="button" onclick={revert} disabled={!dirty}>Discard edits</button>
            {#if current?.hasBackup}
              <button class="btn" type="button" onclick={restore}>
                <Icon name="restore" size={16} /> Restore previous version
              </button>
            {/if}
          </div>
        {/if}
        {#if message}
          <p class="message" class:error={message.error}>{message.text}</p>
        {/if}
      {/if}
    </div>
  </div>
</section>

<style>
  .intro {
    margin-top: -0.5rem;
  }

  .layout {
    display: grid;
    grid-template-columns: minmax(200px, 260px) 1fr;
    gap: 1.25rem;
    align-items: start;
  }

  .files {
    min-width: 0;
  }

  .files h3 {
    margin: 0.9rem 0 0.2rem;
    font-size: 0.8rem;
    color: var(--muted);
    font-family: var(--mono);
    font-weight: 600;
  }

  ul {
    list-style: none;
    margin: 0.4rem 0 0;
    padding: 0;
  }

  li button {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    width: 100%;
    min-height: 36px;
    padding: 0.3rem 0.5rem;
    border: 0;
    border-radius: 6px;
    background: none;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  li button:hover {
    background: var(--surface-2);
  }

  li button.active {
    background: color-mix(in srgb, var(--accent) 15%, transparent);
    color: var(--text);
  }

  .file-name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: var(--mono);
    font-size: 0.85rem;
  }

  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--accent);
  }

  .sensitive {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: color-mix(in srgb, var(--warn) 25%, transparent);
    color: var(--warn);
    font-size: 0.7rem;
    font-weight: 700;
  }

  .editor {
    min-width: 0;
  }

  .empty {
    padding: 2rem 0;
    text-align: center;
  }

  .editor-head {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.6rem;
  }

  .title {
    flex: 1;
    min-width: 0;
    font-family: var(--mono);
    font-size: 0.9rem;
    overflow-wrap: anywhere;
  }

  .meta {
    font-family: inherit;
    font-size: 0.8rem;
  }

  .back {
    display: none;
  }

  textarea {
    display: block;
    min-height: 55vh;
    font-family: var(--mono);
    font-size: 0.85rem;
    line-height: 1.5;
    tab-size: 4;
    white-space: pre;
    overflow: auto;
    resize: vertical;
  }

  .warning {
    padding: 0.6rem 0.8rem;
    border-left: 4px solid var(--warn);
    border-radius: 6px;
    background: color-mix(in srgb, var(--warn) 12%, transparent);
    margin: 0 0 0.75rem;
  }

  .actions {
    margin-top: 0.75rem;
  }

  .message {
    margin: 0.75rem 0 0;
    white-space: pre-line;
    color: var(--ok);
  }

  .message.error {
    color: var(--danger);
  }

  /* Small screens: the list, or the selected file */
  @media (max-width: 760px) {
    .layout {
      grid-template-columns: 1fr;
    }

    .layout.has-file .files {
      display: none;
    }

    .back {
      display: inline-flex;
    }

    .empty {
      display: none;
    }

    textarea {
      min-height: 50vh;
    }
  }
</style>
