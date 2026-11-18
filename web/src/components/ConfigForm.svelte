<script lang="ts">
  import type { Snippet } from 'svelte'
  import type { DynamicOptions, SectionDef, Values } from '../lib/forms'
  import Field from './Field.svelte'

  let {
    sections,
    values = $bindable(),
    dynamic = {},
    loading = false,
    error = '',
    onsave,
    onchange,
    children,
  }: {
    sections: SectionDef[]
    values: Values
    dynamic?: DynamicOptions
    loading?: boolean
    error?: string
    onsave?: () => void
    onchange?: (id: string) => void
    children?: Snippet
  } = $props()
</script>

<form
  onsubmit={(e) => {
    e.preventDefault()
    onsave?.()
  }}
>
  {#if error}
    <p class="error">Unable to read the configuration: {error}</p>
  {:else if loading}
    <p class="muted"><span class="spinner"></span> Loading configuration…</p>
  {/if}
  {#each sections as section, i (i)}
    {#if section.title}
      <details class="section" open={i === 0}>
        <summary>{section.title}</summary>
        <div class="body grid">
          {#each section.fields as field (field.id)}
            <Field {field} bind:values {dynamic} {onchange} />
          {/each}
        </div>
      </details>
    {:else}
      <div class="grid block">
        {#each section.fields as field (field.id)}
          <Field {field} bind:values {dynamic} {onchange} />
        {/each}
      </div>
    {/if}
  {/each}
  {@render children?.()}
  {#if onsave}
    <div class="actions">
      <button class="btn primary" type="submit" disabled={loading || !!error}>Save</button>
    </div>
  {/if}
</form>

<style>
  .block + .block {
    margin-top: 0.9rem;
  }
</style>
