<script lang="ts">
  import { get, post, viewerUrl } from '../lib/api'
  import { confirm } from '../lib/dialogs.svelte'
  import { parseLs } from '../lib/ls'
  import FileTable, { type FileEntry } from '../components/FileTable.svelte'
  import EventTimeline, { type TimelineEvent } from '../components/EventTimeline.svelte'
  import PictureViewer from '../components/PictureViewer.svelte'
  import Tabs from '../components/Tabs.svelte'

  type Dir = 'motion' | 'recording' | 'timelapse'
  const tabs = { motion: 'Motion', recording: 'Recording', timelapse: 'Timelapse', events: 'Motion events' }
  let tab = $state<keyof typeof tabs>('motion')

  function files(text: string): FileEntry[] {
    return parseLs(text).map(({ path, ...entry }) => ({
      ...entry,
      name: path.split('/').pop() ?? path,
      path: viewerUrl(path),
      url: viewerUrl(path),
    }))
  }

  let lists = $state<Record<Dir, { files: FileEntry[]; loading: boolean; error: string; loaded: boolean }>>({
    motion: { files: [], loading: false, error: '', loaded: false },
    recording: { files: [], loading: false, error: '', loaded: false },
    timelapse: { files: [], loading: false, error: '', loaded: false },
  })

  async function load(dir: Dir) {
    const list = lists[dir]
    list.loading = true
    list.error = ''
    try {
      list.files = files(await get('ui_sdcard.cgi', { cmd: 'getFiles', dir }))
      list.loaded = true
    } catch (e) {
      list.error = (e as Error).message
    } finally {
      list.loading = false
    }
  }

  async function remove(dir: Dir, files: FileEntry[]) {
    const message =
      files.length === 1 ? `Delete the file ${files[0].name}?` : `Delete the ${files.length} selected files?`
    if (!(await confirm(message, { title: 'Delete files', action: 'Delete', danger: true }))) return
    // One request for all the files: del_files takes a comma separated list of /viewer/... paths
    await post('ui_sdcard.cgi', { cmd: 'del_files', files: files.map((f) => f.path).join(',') }).catch(() => {})
    await load(dir)
  }

  // Motion events (pictures of the whole DCIM folder, by date)
  let events = $state<TimelineEvent[]>([])
  let eventsState = $state<'idle' | 'loading' | 'ready' | string>('idle')

  /** "2024-01-31 12:34:56.000000000" in local time */
  function fullTime(date: string): number {
    const m = date.match(/(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/)
    return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime() : Date.parse(date)
  }

  async function loadEvents() {
    eventsState = 'loading'
    try {
      const data = JSON.parse(await get('ui_sdcard.cgi', { cmd: 'events' })) as { file: string; date: string }[]
      events = data
        .filter((e) => /\.jpe?g$/i.test(e.file))
        .map((e) => ({ time: fullTime(e.date), url: viewerUrl(e.file) }))
        .filter((e) => !isNaN(e.time))
        .sort((a, b) => a.time - b.time)
      eventsState = 'ready'
    } catch (e) {
      eventsState = (e as Error).message
    }
  }

  $effect(() => {
    if (tab === 'events') {
      if (eventsState === 'idle') loadEvents()
    } else if (!lists[tab].loaded && !lists[tab].loading && !lists[tab].error) {
      load(tab)
    }
  })

  // Picture viewer
  let pictures = $state<string[]>([])
  let pictureIndex = $state(-1)

  function view(file: FileEntry, list: FileEntry[]) {
    pictures = list.map((f) => f.url)
    pictureIndex = pictures.indexOf(file.url)
  }
</script>

<section class="card">
  <h1>SD card files</h1>
  <Tabs {tabs} bind:active={tab} />

  {#if tab === 'events'}
    {#if eventsState === 'loading' || eventsState === 'idle'}
      <p class="muted"><span class="spinner"></span> Loading events…</p>
    {:else if eventsState !== 'ready'}
      <p class="error">Unable to read the events: {eventsState}</p>
    {:else if !events.length}
      <p class="muted">No motion picture found.</p>
    {:else}
      <EventTimeline
        {events}
        onopen={(i) => {
          pictures = events.map((e) => e.url)
          pictureIndex = i
        }}
      />
    {/if}
  {:else}
    {@const list = lists[tab]}
    {#if list.error}
      <p class="error">Unable to list the files: {list.error}</p>
    {:else if list.loading && !list.loaded}
      <p class="muted"><span class="spinner"></span> Loading files…</p>
    {:else if !list.files.length}
      <p class="muted">No files found.</p>
    {:else}
      {@const dir = tab}
      <FileTable files={list.files} ondelete={(files) => remove(dir, files)} onview={view} />
    {/if}
  {/if}
</section>

<PictureViewer {pictures} bind:index={pictureIndex} />
