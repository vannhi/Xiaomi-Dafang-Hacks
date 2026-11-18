<script lang="ts" module>
  export interface TimelineEvent {
    time: number
    url: string
  }
</script>

<script lang="ts">
  // Motion events on a time axis: wheel or buttons to zoom, drag to pan, click an event to open it

  let {
    events,
    onopen,
  }: {
    /** Sorted by time */
    events: TimelineEvent[]
    onopen: (index: number) => void
  } = $props()

  const HEIGHT = 120
  const AXIS = 28
  let width = $state(800)

  const bounds = $derived.by(() => {
    if (!events.length) return { start: 0, end: 1 }
    const start = events[0].time
    const end = events[events.length - 1].time
    // Some margin, and at least one minute shown
    const margin = Math.max((end - start) * 0.02, 30_000)
    return { start: start - margin, end: end + margin }
  })

  let view = $state({ start: 0, end: 1 })
  $effect(() => {
    view = { ...bounds }
  })

  const x = (t: number) => ((t - view.start) / (view.end - view.start)) * width

  const visible = $derived(
    events.map((e, i) => ({ ...e, index: i })).filter((e) => e.time >= view.start && e.time <= view.end),
  )

  // Axis ticks: pick a round step giving about one tick per 110 px
  const steps = [1, 5, 15, 30, 60, 300, 900, 1800, 3600, 3 * 3600, 6 * 3600, 12 * 3600, 86400, 7 * 86400, 30 * 86400].map(
    (s) => s * 1000,
  )
  const ticks = $derived.by(() => {
    const span = view.end - view.start
    const wanted = span / Math.max(1, width / 110)
    const step = steps.find((s) => s >= wanted) ?? steps[steps.length - 1]
    // Align on local time
    const offset = new Date().getTimezoneOffset() * 60_000
    const first = Math.ceil((view.start - offset) / step) * step + offset
    const list: { time: number; label: string }[] = []
    for (let t = first; t <= view.end; t += step) {
      const d = new Date(t)
      const label =
        step >= 86400_000
          ? d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
          : d.getHours() === 0 && d.getMinutes() === 0 && step >= 3600_000
            ? d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
            : d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: step < 60_000 ? '2-digit' : undefined })
      list.push({ time: t, label })
    }
    return list
  })

  function zoom(factor: number, center = (view.start + view.end) / 2) {
    const minSpan = 10_000
    const maxSpan = bounds.end - bounds.start
    const span = Math.min(maxSpan, Math.max(minSpan, (view.end - view.start) * factor))
    const ratio = (center - view.start) / (view.end - view.start)
    let start = center - span * ratio
    start = Math.max(bounds.start, Math.min(bounds.end - span, start))
    view = { start, end: start + span }
  }

  function pan(delta: number) {
    const span = view.end - view.start
    const start = Math.max(bounds.start, Math.min(bounds.end - span, view.start + delta))
    view = { start, end: start + span }
  }

  let svg: SVGSVGElement
  let dragging: { x: number; start: number; moved: boolean } | undefined

  // Not passive: the page must not scroll while zooming
  $effect(() => {
    svg.addEventListener('wheel', onwheel, { passive: false })
    return () => svg.removeEventListener('wheel', onwheel)
  })

  function onwheel(e: WheelEvent) {
    e.preventDefault()
    const rect = svg.getBoundingClientRect()
    const center = view.start + ((e.clientX - rect.left) / rect.width) * (view.end - view.start)
    zoom(e.deltaY > 0 ? 1.25 : 0.8, center)
  }

  function onpointerdown(e: PointerEvent) {
    dragging = { x: e.clientX, start: view.start, moved: false }
    svg.setPointerCapture(e.pointerId)
  }

  function onpointermove(e: PointerEvent) {
    if (!dragging) return
    const dx = e.clientX - dragging.x
    if (Math.abs(dx) > 3) dragging.moved = true
    if (!dragging.moved) return
    const span = view.end - view.start
    pan(dragging.start - (dx / width) * span - view.start)
  }

  function onpointerup(e: PointerEvent) {
    const click = dragging && !dragging.moved
    dragging = undefined
    if (!click || !visible.length) return
    // Open the event closest to the click
    const rect = svg.getBoundingClientRect()
    const px = e.clientX - rect.left
    let best = visible[0]
    for (const ev of visible) if (Math.abs(x(ev.time) - px) < Math.abs(x(best.time) - px)) best = ev
    if (Math.abs(x(best.time) - px) <= 12) onopen(best.index)
  }

  const formatRange = (t: number) =>
    new Date(t).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
</script>

<div class="timeline">
  <div class="controls">
    <span class="muted range">{formatRange(view.start)} – {formatRange(view.end)}</span>
    <button class="btn" type="button" onclick={() => zoom(0.5)} title="Zoom in">+</button>
    <button class="btn" type="button" onclick={() => zoom(2)} title="Zoom out">−</button>
    <button class="btn" type="button" onclick={() => (view = { ...bounds })}>Show all</button>
  </div>
  <div class="plot" bind:clientWidth={width}>
    <svg
      bind:this={svg}
      {width}
      height={HEIGHT}
      role="application"
      aria-label="Motion events timeline"
      {onpointerdown}
      {onpointermove}
      {onpointerup}
      onpointercancel={() => (dragging = undefined)}
    >
      {#each ticks as tick (tick.time)}
        <line class="grid" x1={x(tick.time)} x2={x(tick.time)} y1="0" y2={HEIGHT - AXIS} />
        {#if x(tick.time) > 24 && x(tick.time) < width - 24}
          <text class="tick" x={x(tick.time)} y={HEIGHT - 8} text-anchor="middle">{tick.label}</text>
        {/if}
      {/each}
      <line class="axis" x1="0" x2={width} y1={HEIGHT - AXIS} y2={HEIGHT - AXIS} />
      {#each visible as ev (ev.index)}
        <circle class="event" cx={x(ev.time)} cy={(HEIGHT - AXIS) / 2} r="6">
          <title>{new Date(ev.time).toLocaleString()}</title>
        </circle>
      {/each}
    </svg>
  </div>
  <p class="muted hint">{events.length} events. Scroll to zoom, drag to move, click an event to open the picture.</p>
</div>

<style>
  .controls {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.4rem;
    margin-bottom: 0.5rem;
  }

  .range {
    margin-right: auto;
    font-size: 0.9rem;
  }

  .controls .btn {
    min-height: 32px;
    padding: 0.2rem 0.75rem;
  }

  .plot {
    width: 100%;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--surface-2);
    overflow: hidden;
  }

  svg {
    display: block;
    cursor: grab;
    touch-action: none;
    user-select: none;
  }

  .grid {
    stroke: var(--border);
  }

  .axis {
    stroke: var(--muted);
  }

  .tick {
    fill: var(--muted);
    font-size: 11px;
  }

  .event {
    fill: var(--accent);
    fill-opacity: 0.45;
    stroke: var(--accent);
    cursor: pointer;
  }

  .event:hover {
    fill-opacity: 0.9;
  }

  .hint {
    font-size: 0.85rem;
    margin: 0.5rem 0 0;
  }
</style>
