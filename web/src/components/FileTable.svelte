<script lang="ts" module>
  export interface FileEntry {
    name: string
    /** Path as returned by the camera, used for deletion */
    path: string
    /** URL to download / view the file */
    url: string
    size: string
    date: string
    /** Date as a timestamp, for sorting */
    time: number
  }

  const units: Record<string, number> = { '': 1, K: 1e3, M: 1e6, G: 1e9 }

  /** Size as printed by ls -h ("12.3K") in bytes, for sorting */
  function bytes(size: string): number {
    const m = size.match(/^([\d.]+)([KMG]?)/)
    return m ? parseFloat(m[1]) * units[m[2]] : 0
  }
</script>

<script lang="ts">
  import Icon from './Icon.svelte'

  let {
    files,
    ondelete,
    onview,
  }: {
    files: FileEntry[]
    ondelete: (files: FileEntry[]) => void
    /** Open a picture, given the pictures in the displayed order */
    onview: (file: FileEntry, pictures: FileEntry[]) => void
  } = $props()

  type Column = 'name' | 'size' | 'date'
  let sort = $state<{ column: Column; desc: boolean }>({ column: 'name', desc: true })
  let filter = $state('')
  let pageSize = $state(100)
  let page = $state(0)
  let selected = $state(new Set<string>())

  const sorted = $derived.by(() => {
    const needle = filter.trim().toLowerCase()
    const list = needle
      ? files.filter((f) => f.name.toLowerCase().includes(needle) || f.date.toLowerCase().includes(needle))
      : [...files]
    const key = sort.column
    list.sort((a, b) =>
      key === 'size' ? bytes(a.size) - bytes(b.size) : key === 'date' ? a.time - b.time : a.name.localeCompare(b.name),
    )
    if (sort.desc) list.reverse()
    return list
  })

  const pages = $derived(pageSize > 0 ? Math.max(1, Math.ceil(sorted.length / pageSize)) : 1)
  const shown = $derived(pageSize > 0 ? sorted.slice(page * pageSize, (page + 1) * pageSize) : sorted)
  const allShownSelected = $derived(shown.length > 0 && shown.every((f) => selected.has(f.path)))

  $effect(() => {
    // Back to a valid page when the list shrinks
    if (page >= pages) page = pages - 1
  })

  $effect(() => {
    // Forget the selection of files that are gone
    const paths = new Set(files.map((f) => f.path))
    if ([...selected].some((p) => !paths.has(p))) selected = new Set([...selected].filter((p) => paths.has(p)))
  })

  function sortBy(column: Column) {
    sort = { column, desc: sort.column === column ? !sort.desc : column !== 'name' }
  }

  function toggle(path: string, on: boolean) {
    const next = new Set(selected)
    if (on) next.add(path)
    else next.delete(path)
    selected = next
  }

  function toggleShown(on: boolean) {
    const next = new Set(selected)
    for (const f of shown) {
      if (on) next.add(f.path)
      else next.delete(f.path)
    }
    selected = next
  }

  const isPicture = (f: FileEntry) => /\.jpe?g$/i.test(f.name)
</script>

<div class="toolbar">
  <input class="filter" type="search" placeholder="Filter by name or date" bind:value={filter} oninput={() => (page = 0)} />
  <button
    class="btn danger"
    type="button"
    disabled={!selected.size}
    onclick={() => ondelete(files.filter((f) => selected.has(f.path)))}
  >
    <Icon name="trash" size={16} /> Delete selected ({selected.size})
  </button>
</div>

<div class="table-wrap">
  <table class="data">
    <thead>
      <tr>
        <th class="sel">
          <input
            type="checkbox"
            aria-label="Select the files of this page"
            checked={allShownSelected}
            onchange={(e) => toggleShown(e.currentTarget.checked)}
          />
        </th>
        {#each [['name', 'File name'], ['size', 'Size'], ['date', 'Date']] as [column, label] (column)}
          <th
            class:wide-only={column !== 'name'}
            aria-sort={sort.column === column ? (sort.desc ? 'descending' : 'ascending') : undefined}
          >
            <button class="sort" type="button" onclick={() => sortBy(column as Column)}>
              {label}
              {#if sort.column === column}<Icon name={sort.desc ? 'down' : 'up'} size={14} />{/if}
            </button>
          </th>
        {/each}
        <th>Actions</th>
      </tr>
    </thead>
    <tbody>
      {#each shown as file (file.path)}
        <tr class:selected={selected.has(file.path)}>
          <td class="sel">
            <input
              type="checkbox"
              aria-label="Select {file.name}"
              checked={selected.has(file.path)}
              onchange={(e) => toggle(file.path, e.currentTarget.checked)}
            />
          </td>
          <td class="name">
            {file.name}
            <span class="meta muted">{file.size} · {file.date}</span>
          </td>
          <td class="nowrap wide-only">{file.size}</td>
          <td class="nowrap wide-only">{file.date}</td>
          <td class="nowrap">
            {#if isPicture(file)}
              <button class="icon-btn" type="button" title="View picture" onclick={() => onview(file, sorted.filter(isPicture))}>
                <Icon name="eye" size={18} />
              </button>
            {/if}
            <a class="icon-btn" href={file.url} download title="Download"><Icon name="download" size={18} /></a>
            <button class="icon-btn danger" type="button" title="Delete" onclick={() => ondelete([file])}>
              <Icon name="trash" size={18} />
            </button>
          </td>
        </tr>
      {:else}
        <tr><td colspan="5" class="muted">No matching file</td></tr>
      {/each}
    </tbody>
  </table>
</div>

<div class="footer">
  <span class="muted">{sorted.length} file{sorted.length === 1 ? '' : 's'}</span>
  <label class="muted">
    Show
    <select bind:value={pageSize} onchange={() => (page = 0)}>
      <option value={25}>25</option>
      <option value={50}>50</option>
      <option value={100}>100</option>
      <option value={0}>All</option>
    </select>
  </label>
  {#if pages > 1}
    <div class="pager">
      <button class="icon-btn" type="button" disabled={page === 0} onclick={() => page--} aria-label="Previous page">
        <Icon name="left" />
      </button>
      <span>{page + 1} / {pages}</span>
      <button class="icon-btn" type="button" disabled={page >= pages - 1} onclick={() => page++} aria-label="Next page">
        <Icon name="right" />
      </button>
    </div>
  {/if}
</div>

<style>
  .toolbar,
  .footer {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.75rem;
  }

  .toolbar {
    margin-bottom: 0.75rem;
  }

  .footer {
    margin-top: 0.75rem;
  }

  .filter {
    flex: 1 1 220px;
    max-width: 360px;
  }

  .footer select {
    width: auto;
    min-height: 32px;
    margin-left: 0.3rem;
  }

  .pager {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    margin-left: auto;
  }

  .sel {
    width: 36px;
  }

  .sort {
    display: inline-flex;
    align-items: center;
    gap: 0.2rem;
    padding: 0;
    border: 0;
    background: none;
    color: inherit;
    font: inherit;
    cursor: pointer;
  }

  tr.selected {
    background: color-mix(in srgb, var(--accent) 10%, transparent);
  }

  .name {
    word-break: break-all;
  }

  .nowrap {
    white-space: nowrap;
  }

  .meta {
    display: none;
    font-size: 0.8rem;
  }

  /* Small screens: size and date under the name */
  @media (max-width: 600px) {
    .wide-only {
      display: none;
    }

    .meta {
      display: block;
    }

    .name {
      word-break: normal;
      overflow-wrap: anywhere;
    }

    table.data td,
    table.data th {
      padding: 0.4rem 0.3rem;
    }
  }
</style>
