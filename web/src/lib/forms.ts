// Declarative description of the configuration forms

import type { Option } from './api'

export interface FieldDef {
  /** Parameter name sent to / returned by the CGI script */
  id: string
  label: string
  type?: 'text' | 'password' | 'number' | 'select' | 'range' | 'checkbox' | 'textarea'
  /** Choices of a select: [value, label] pairs, or the id of a dynamic list */
  options?: [string, string][] | string
  min?: number
  max?: number
  step?: number
  placeholder?: string
  /** Take the whole row */
  wide?: boolean
}

export interface SectionDef {
  /** Collapsible section title, none for a plain block */
  title?: string
  fields: FieldDef[]
}

export type Values = Record<string, string>
export type DynamicOptions = Record<string, Option[]>

export const onOff: [string, string][] = [
  ['false', 'Deactivate'],
  ['true', 'Activate'],
]

export const colors: [string, string][] = [
  ['0', 'White'],
  ['1', 'Black'],
  ['2', 'Red'],
  ['3', 'Green'],
  ['4', 'Blue'],
  ['5', 'Cyan'],
  ['6', 'Yellow'],
  ['7', 'Purple'],
]

export function fieldIds(sections: SectionDef[]): string[] {
  return sections.flatMap((s) => s.fields.map((f) => f.id))
}

/** Values of the given fields, the way the previous UI posted a whole form */
export function pick(values: Values, ids: string[]): Values {
  return Object.fromEntries(ids.map((id) => [id, values[id] ?? '']))
}
