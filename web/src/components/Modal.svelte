<script lang="ts">
  import type { Snippet } from 'svelte'
  import Icon from './Icon.svelte'

  let {
    open = $bindable(false),
    title,
    wide = false,
    onclose,
    children,
    footer,
  }: {
    open?: boolean
    title: string
    wide?: boolean
    onclose?: () => void
    children: Snippet
    footer?: Snippet
  } = $props()

  let dialog: HTMLDialogElement

  $effect(() => {
    if (open && !dialog.open) dialog.showModal()
    else if (!open && dialog.open) dialog.close()
  })

  function close() {
    open = false
    onclose?.()
  }
</script>

<dialog
  bind:this={dialog}
  class:wide
  onclose={() => open && close()}
  onclick={(e) => e.target === dialog && close()}
>
  <header>
    <h2>{title}</h2>
    <button class="icon-btn" type="button" onclick={close} aria-label="Close"><Icon name="close" /></button>
  </header>
  <div class="content">
    {@render children()}
  </div>
  {#if footer}
    <footer>{@render footer()}</footer>
  {/if}
</dialog>

<style>
  dialog {
    width: min(560px, calc(100vw - 32px));
    max-height: calc(100vh - 32px);
    padding: 0;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
    color: var(--text);
    box-shadow: 0 10px 40px rgb(0 0 0 / 0.3);
  }

  dialog.wide {
    width: min(900px, calc(100vw - 32px));
  }

  dialog::backdrop {
    background: rgb(0 0 0 / 0.45);
  }

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.75rem 0.75rem 0.75rem 1.25rem;
    border-bottom: 1px solid var(--border);
  }

  h2 {
    margin: 0;
  }

  .content {
    padding: 1rem 1.25rem;
  }

  footer {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    padding: 0 1.25rem 1rem;
  }
</style>
