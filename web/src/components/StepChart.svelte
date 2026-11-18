<script lang="ts">
  // Small real time step chart drawn on a canvas (one point per second)

  let {
    points,
    window: span = 60,
    height = 140,
    thresholds = [],
  }: {
    /** [timestamp in ms, value] */
    points: [number, number][]
    /** Seconds shown */
    window?: number
    height?: number
    /** Horizontal reference lines (user thresholds) */
    thresholds?: number[]
  } = $props()

  let canvas: HTMLCanvasElement
  let width = $state(600)

  $effect(() => {
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const ratio = window.devicePixelRatio || 1
    canvas.width = Math.round(width * ratio)
    canvas.height = Math.round(height * ratio)
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0)

    const style = getComputedStyle(canvas)
    const accent = style.getPropertyValue('--accent').trim() || '#0f8b8d'
    const muted = style.getPropertyValue('--muted').trim() || '#888'
    const border = style.getPropertyValue('--border').trim() || '#ccc'
    const warn = style.getPropertyValue('--warn').trim() || '#e67700'

    ctx.clearRect(0, 0, width, height)
    ctx.strokeStyle = border
    ctx.lineWidth = 1
    for (let i = 1; i < 4; i++) {
      const y = Math.round((height * i) / 4) + 0.5
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(width, y)
      ctx.stroke()
    }
    if (!points.length) return

    const now = points[points.length - 1][0]
    const start = now - span * 1000
    const visible = points.filter(([t]) => t >= start - 1000)
    const values = [...visible.map(([, v]) => v), ...thresholds.filter(isFinite)]
    let min = Math.min(...values)
    let max = Math.max(...values)
    if (min === max) {
      min -= 1
      max += 1
    }
    const pad = (max - min) * 0.1
    min -= pad
    max += pad
    const x = (t: number) => ((t - start) / (span * 1000)) * width
    const y = (v: number) => height - ((v - min) / (max - min)) * height

    ctx.setLineDash([5, 4])
    ctx.strokeStyle = warn
    for (const t of thresholds) {
      if (!isFinite(t)) continue
      ctx.beginPath()
      ctx.moveTo(0, y(t))
      ctx.lineTo(width, y(t))
      ctx.stroke()
    }
    ctx.setLineDash([])

    ctx.beginPath()
    visible.forEach(([t, v], i) => {
      if (i === 0) ctx.moveTo(x(t), y(v))
      else {
        ctx.lineTo(x(t), y(visible[i - 1][1]))
        ctx.lineTo(x(t), y(v))
      }
    })
    ctx.lineTo(width, y(visible[visible.length - 1][1]))
    ctx.strokeStyle = accent
    ctx.lineWidth = 2
    ctx.stroke()
    ctx.lineTo(width, height)
    ctx.lineTo(x(visible[0][0]), height)
    ctx.closePath()
    ctx.globalAlpha = 0.15
    ctx.fillStyle = accent
    ctx.fill()
    ctx.globalAlpha = 1

    ctx.fillStyle = muted
    ctx.font = '11px system-ui, sans-serif'
    ctx.textBaseline = 'top'
    ctx.fillText(String(Math.round(max)), 4, 3)
    ctx.textBaseline = 'bottom'
    ctx.fillText(String(Math.round(min)), 4, height - 3)
  })
</script>

<div class="chart" bind:clientWidth={width}>
  <canvas bind:this={canvas} style:height="{height}px"></canvas>
</div>

<style>
  .chart {
    width: 100%;
  }

  canvas {
    display: block;
    width: 100%;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--surface-2);
  }
</style>
