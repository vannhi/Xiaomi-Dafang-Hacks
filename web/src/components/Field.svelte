<script lang="ts">
  import type { DynamicOptions, FieldDef, Values } from '../lib/forms'

  let {
    field,
    values = $bindable(),
    dynamic = {},
    onchange,
  }: {
    field: FieldDef
    values: Values
    dynamic?: DynamicOptions
    onchange?: (id: string) => void
  } = $props()

  const uid = $props.id()
  const type = $derived(field.type ?? 'text')
  const options = $derived(
    typeof field.options === 'string'
      ? (dynamic[field.options] ?? []).map((o) => [o.value, o.label] as [string, string])
      : (field.options ?? []),
  )
  // Keep a value the camera returned even if it is not one of the known choices
  const unknown = $derived(
    type === 'select' && values[field.id] && !options.some(([v]) => v === values[field.id]),
  )
</script>

{#if type === 'checkbox'}
  <label class="check" class:wide={field.wide}>
    <input
      type="checkbox"
      checked={values[field.id] === 'on'}
      onchange={(e) => {
        values[field.id] = e.currentTarget.checked ? 'on' : 'off'
        onchange?.(field.id)
      }}
    />
    {field.label}
  </label>
{:else}
  <div class="field" class:wide={field.wide}>
    <label for={uid}>{field.label}</label>
    {#if type === 'select'}
      <select id={uid} bind:value={values[field.id]} onchange={() => onchange?.(field.id)}>
        {#each options as [value, label] (value)}
          <option {value}>{label}</option>
        {/each}
        {#if unknown}
          <option value={values[field.id]}>{values[field.id]}</option>
        {/if}
      </select>
    {:else if type === 'range'}
      <div class="range">
        <input
          id={uid}
          type="range"
          min={field.min}
          max={field.max}
          step={field.step ?? 1}
          bind:value={values[field.id]}
          onchange={() => onchange?.(field.id)}
        />
        <output for={uid}>{values[field.id]}</output>
      </div>
    {:else if type === 'textarea'}
      <textarea id={uid} rows="4" bind:value={values[field.id]} placeholder={field.placeholder}></textarea>
    {:else}
      <input
        id={uid}
        {type}
        min={field.min}
        max={field.max}
        placeholder={field.placeholder}
        autocomplete={type === 'password' ? 'new-password' : 'off'}
        value={values[field.id] ?? ''}
        oninput={(e) => (values[field.id] = e.currentTarget.value)}
        onchange={() => onchange?.(field.id)}
      />
    {/if}
  </div>
{/if}

<style>
  .field label {
    font-size: 0.85rem;
    color: var(--muted);
  }

  .wide {
    grid-column: 1 / -1;
  }

  .range {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    min-height: 38px;
  }

  output {
    min-width: 3.5ch;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
</style>
