<script lang="ts" generics="T extends string">
  let {
    tabs,
    active = $bindable(),
  }: {
    tabs: Record<T, string>
    active: T
  } = $props()

  const entries = $derived(Object.entries(tabs) as [T, string][])
</script>

<div class="tabs" role="tablist">
  {#each entries as [id, label] (id)}
    <button
      type="button"
      role="tab"
      aria-selected={active === id}
      class:active={active === id}
      onclick={() => (active = id)}
    >
      {label}
    </button>
  {/each}
</div>

<style>
  .tabs {
    display: flex;
    gap: 0.25rem;
    overflow-x: auto;
    border-bottom: 1px solid var(--border);
    margin-bottom: 1.1rem;
    scrollbar-width: thin;
  }

  button {
    flex: none;
    padding: 0.55rem 0.9rem;
    border: 0;
    border-bottom: 3px solid transparent;
    background: none;
    color: var(--muted);
    font: inherit;
    font-weight: 500;
    cursor: pointer;
  }

  button:hover {
    color: var(--text);
  }

  button.active {
    color: var(--text);
    border-bottom-color: var(--accent);
  }
</style>
