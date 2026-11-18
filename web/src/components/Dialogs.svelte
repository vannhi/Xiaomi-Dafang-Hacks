<script lang="ts">
  import { confirmation, result } from '../lib/dialogs.svelte'
  import Modal from './Modal.svelte'

  function answer(value: boolean) {
    confirmation.open = false
    confirmation.resolve(value)
    confirmation.resolve = () => {}
  }
</script>

<Modal bind:open={result.open} title={result.title}>
  {#if result.busy}
    <p><span class="spinner"></span> Waiting for the camera…</p>
  {:else}
    <pre class="output" class:error={result.error}>{result.text}</pre>
  {/if}
  {#snippet footer()}
    <button class="btn" type="button" onclick={() => (result.open = false)}>Close</button>
  {/snippet}
</Modal>

<Modal bind:open={confirmation.open} title={confirmation.title} onclose={() => answer(false)}>
  <p class="message">{confirmation.message}</p>
  {#snippet footer()}
    <button class="btn" type="button" onclick={() => answer(false)}>Cancel</button>
    <button class="btn primary" class:danger={confirmation.danger} type="button" onclick={() => answer(true)}>
      {confirmation.action}
    </button>
  {/snippet}
</Modal>

<style>
  .message {
    white-space: pre-line;
    margin: 0;
  }

  .btn.primary.danger {
    background: var(--danger);
    border-color: var(--danger);
    color: #fff;
  }
</style>
