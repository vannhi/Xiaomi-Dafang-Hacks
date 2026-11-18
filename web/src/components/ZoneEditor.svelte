<script lang="ts" module>
  /** Rectangle in picture pixels */
  export interface Zone {
    x1: number
    y1: number
    x2: number
    y2: number
  }
</script>

<script lang="ts">
  let {
    src,
    width,
    height,
    zones = $bindable(),
    max = 5,
  }: {
    src: string
    /** Size of the picture in pixels: zones are expressed in this space */
    width: number
    height: number
    zones: Zone[]
    max?: number
  } = $props()

  type Drag =
    | { kind: 'create'; index: number; x: number; y: number }
    | { kind: 'move'; index: number; dx: number; dy: number }
    | { kind: 'resize'; index: number; corner: 'x1y1' | 'x2y1' | 'x1y2' | 'x2y2' }

  let svg: SVGSVGElement
  let drag: Drag | undefined
  let selected = $state(-1)

  // Sizes in picture pixels that look the same whatever the displayed size
  let displayed = $state(640)
  const unit = $derived(width / Math.max(displayed, 1))
  const minSize = $derived(10 * unit)

  function point(e: PointerEvent) {
    const rect = svg.getBoundingClientRect()
    return {
      x: Math.round(Math.min(width, Math.max(0, ((e.clientX - rect.left) / rect.width) * width))),
      y: Math.round(Math.min(height, Math.max(0, ((e.clientY - rect.top) / rect.height) * height))),
    }
  }

  function normalize(z: Zone): Zone {
    return { x1: Math.min(z.x1, z.x2), y1: Math.min(z.y1, z.y2), x2: Math.max(z.x1, z.x2), y2: Math.max(z.y1, z.y2) }
  }

  function start(e: PointerEvent, next: Drag) {
    e.stopPropagation()
    e.preventDefault()
    svg.setPointerCapture(e.pointerId)
    drag = next
    selected = next.index
  }

  function onBackground(e: PointerEvent) {
    selected = -1
    if (zones.length >= max) return
    const p = point(e)
    zones.push({ x1: p.x, y1: p.y, x2: p.x, y2: p.y })
    start(e, { kind: 'create', index: zones.length - 1, ...p })
  }

  function onZone(e: PointerEvent, index: number) {
    const p = point(e)
    start(e, { kind: 'move', index, dx: p.x - zones[index].x1, dy: p.y - zones[index].y1 })
  }

  function onMove(e: PointerEvent) {
    if (!drag) return
    const p = point(e)
    const zone = zones[drag.index]
    if (drag.kind === 'create') {
      zones[drag.index] = { x1: drag.x, y1: drag.y, x2: p.x, y2: p.y }
    } else if (drag.kind === 'move') {
      const w = zone.x2 - zone.x1
      const h = zone.y2 - zone.y1
      const x1 = Math.min(width - w, Math.max(0, p.x - drag.dx))
      const y1 = Math.min(height - h, Math.max(0, p.y - drag.dy))
      zones[drag.index] = { x1, y1, x2: x1 + w, y2: y1 + h }
    } else {
      const c = drag.corner
      zones[drag.index] = {
        ...zone,
        [c.startsWith('x1') ? 'x1' : 'x2']: p.x,
        [c.endsWith('y1') ? 'y1' : 'y2']: p.y,
      }
    }
  }

  function onUp() {
    if (!drag) return
    const index = drag.index
    drag = undefined
    const zone = normalize(zones[index])
    if (zone.x2 - zone.x1 < minSize || zone.y2 - zone.y1 < minSize) {
      // Too small: a click, or a mistake
      zones.splice(index, 1)
      selected = -1
    } else {
      zones[index] = zone
    }
  }

  function remove(index: number) {
    zones.splice(index, 1)
    selected = -1
  }
</script>

<div class="editor" bind:clientWidth={displayed}>
  <img {src} alt="Current view of the camera" draggable="false" />
  <!-- Pointer editor; zones can also be deleted with the keyboard once selected -->
  <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
  <svg
    bind:this={svg}
    viewBox="0 0 {width} {height}"
    preserveAspectRatio="none"
    role="application"
    aria-label="Motion detection zones: drag on the picture to add a zone"
    tabindex="0"
    onpointerdown={onBackground}
    onpointermove={onMove}
    onpointerup={onUp}
    onpointercancel={onUp}
    onkeydown={(e) => (e.key === 'Delete' || e.key === 'Backspace') && selected >= 0 && remove(selected)}
  >
    {#each zones as zone, i (i)}
      {@const z = normalize(zone)}
      <g class:selected={selected === i}>
        <rect
          class="zone"
          x={z.x1}
          y={z.y1}
          width={z.x2 - z.x1}
          height={z.y2 - z.y1}
          stroke-width={2 * unit}
          role="presentation"
          onpointerdown={(e) => onZone(e, i)}
        />
        {#each [['x1y1', z.x1, z.y1], ['x2y1', z.x2, z.y1], ['x1y2', z.x1, z.y2], ['x2y2', z.x2, z.y2]] as const as [corner, cx, cy] (corner)}
          <rect
            class="handle"
            x={cx - 5 * unit}
            y={cy - 5 * unit}
            width={10 * unit}
            height={10 * unit}
            role="presentation"
            onpointerdown={(e) => start(e, { kind: 'resize', index: i, corner })}
          />
        {/each}
        <g
          class="delete"
          role="button"
          tabindex="-1"
          aria-label="Delete zone"
          transform="translate({z.x2 - 14 * unit} {z.y1 + 14 * unit}) scale({unit})"
          onpointerdown={(e) => {
            e.stopPropagation()
            remove(i)
          }}
        >
          <circle r="9" />
          <path d="M-4 -4L4 4M4 -4L-4 4" />
        </g>
      </g>
    {/each}
  </svg>
</div>
<p class="muted hint">
  Drag on the picture to add a zone (up to {max}), drag a zone to move it, its corners to resize it.
  {#if zones.length >= max}<strong>Maximum number of zones reached.</strong>{/if}
</p>

<style>
  .editor {
    position: relative;
    max-width: 640px;
    line-height: 0;
    user-select: none;
    -webkit-user-select: none;
  }

  img {
    width: 100%;
    border-radius: 6px;
  }

  svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    cursor: crosshair;
    touch-action: none;
    outline: none;
  }

  .zone {
    fill: color-mix(in srgb, var(--accent) 25%, transparent);
    stroke: var(--accent);
    cursor: move;
  }

  .selected .zone {
    fill: color-mix(in srgb, var(--accent) 40%, transparent);
    stroke: #fff;
  }

  .handle {
    fill: #fff;
    stroke: var(--accent);
    cursor: nwse-resize;
  }

  .delete {
    cursor: pointer;
  }

  .delete circle {
    fill: rgb(0 0 0 / 0.65);
  }

  .delete path {
    stroke: #fff;
    stroke-width: 2;
  }

  .hint {
    font-size: 0.85rem;
    margin: 0.5rem 0 0;
  }
</style>
