<script lang="ts">
  import Icon from './Icon.svelte'

  let {
    pictures,
    index = $bindable(),
  }: {
    /** Picture URLs, browsable with previous / next */
    pictures: string[]
    /** Shown picture, -1 when closed */
    index: number
  } = $props()

  let dialog: HTMLDialogElement
  const open = $derived(index >= 0 && index < pictures.length)

  $effect(() => {
    if (open && !dialog.open) dialog.showModal()
    else if (!open && dialog.open) dialog.close()
  })

  function go(delta: number) {
    const next = index + delta
    if (next >= 0 && next < pictures.length) index = next
  }

  // Swipe left / right on touch screens
  let touch: { x: number; y: number } | undefined
  let swiped = 0

  function ontouchstart(e: TouchEvent) {
    touch = e.touches.length === 1 ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : undefined
  }

  function ontouchend(e: TouchEvent) {
    if (!touch || e.changedTouches.length !== 1) return
    const dx = e.changedTouches[0].clientX - touch.x
    const dy = e.changedTouches[0].clientY - touch.y
    touch = undefined
    if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5) return
    // The swipe may end on a navigation zone: don't count its click as well
    swiped = Date.now()
    go(dx < 0 ? 1 : -1)
  }

  function navigate(delta: number) {
    if (Date.now() - swiped > 400) go(delta)
  }

  function onkeydown(e: KeyboardEvent) {
    if (e.key === 'ArrowLeft') go(-1)
    else if (e.key === 'ArrowRight') go(1)
    else return
    e.preventDefault()
  }
</script>

<dialog
  bind:this={dialog}
  onclose={() => (index = -1)}
  {onkeydown}
  {ontouchstart}
  {ontouchend}
  ontouchcancel={() => (touch = undefined)}
  onclick={(e) => e.target === dialog && (index = -1)}
>
  {#if open}
    <figure>
      <img src={pictures[index]} alt={pictures[index].split('/').pop()} />
      <figcaption>
        {pictures[index].split('/').pop()} ({index + 1} / {pictures.length})
      </figcaption>
    </figure>
    <button class="nav close" type="button" onclick={() => (index = -1)} aria-label="Close"><Icon name="close" /></button>
    <!-- Each side of the screen is a tap zone, not only the round button drawn in it -->
    {#if index > 0}
      <button class="zone prev" type="button" onclick={() => navigate(-1)} title="Previous picture (left arrow)">
        <span class="nav"><Icon name="left" size={28} /></span>
      </button>
    {/if}
    {#if index < pictures.length - 1}
      <button class="zone next" type="button" onclick={() => navigate(1)} title="Next picture (right arrow)">
        <span class="nav"><Icon name="right" size={28} /></span>
      </button>
    {/if}
  {/if}
</dialog>

<style>
  dialog {
    width: 100vw;
    height: 100vh;
    max-width: none;
    max-height: none;
    margin: 0;
    padding: 0;
    border: 0;
    background: transparent;
  }

  dialog::backdrop {
    background: rgb(0 0 0 / 0.92);
  }

  figure {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    margin: 0;
    padding: 3rem 4rem;
    pointer-events: none;
  }

  img {
    max-width: 100%;
    max-height: calc(100% - 2.5rem);
    object-fit: contain;
    pointer-events: auto;
  }

  figcaption {
    margin-top: 0.75rem;
    color: #eee;
    font-size: 0.9rem;
  }

  .nav {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 48px;
    height: 48px;
    border: 0;
    border-radius: 50%;
    background: rgb(255 255 255 / 0.12);
    color: #fff;
    cursor: pointer;
  }

  .close {
    position: fixed;
    z-index: 1;
    top: 12px;
    right: 12px;
  }

  .close:hover,
  .zone:hover .nav {
    background: rgb(255 255 255 / 0.25);
  }

  /* Tap zones: full height strips on each side, below the close button */
  .zone {
    position: fixed;
    top: 72px;
    bottom: 0;
    display: flex;
    align-items: center;
    width: clamp(72px, 30vw, 280px);
    padding: 0 12px;
    border: 0;
    background: none;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }

  .zone:focus-visible {
    outline: none;
  }

  .zone:focus-visible .nav {
    outline: 2px solid #fff;
  }

  .prev {
    left: 0;
    justify-content: flex-start;
  }

  .next {
    right: 0;
    justify-content: flex-end;
  }

  /* Touch screens: bigger buttons */
  @media (pointer: coarse) {
    .nav {
      width: 56px;
      height: 56px;
    }

    .zone {
      width: max(96px, 35vw);
    }
  }

  @media (max-width: 600px) {
    figure {
      padding: 4.5rem 0.5rem;
    }

    /* Buttons at the bottom, out of the way of the picture; the zones still cover each half */
    .zone {
      width: 50vw;
      align-items: flex-end;
      padding-bottom: 16px;
    }
  }
</style>
