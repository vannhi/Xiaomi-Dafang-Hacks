// Configuration read with a get_config command and saved with a save_config command

import { get, parseKV, post, type Params } from './api'
import { showResult } from './dialogs.svelte'
import { pick, type Values } from './forms'

export class Config {
  values = $state<Values>({})
  loading = $state(false)
  error = $state('')
  private loaded = false

  constructor(
    private script: string,
    private getCmd = 'get_config',
  ) {}

  /** Read the configuration once (or again with force) */
  async load(force = false, transform?: (raw: Record<string, string>) => Values) {
    if (this.loading || (this.loaded && !force)) return
    this.loading = true
    this.error = ''
    try {
      const raw = parseKV(await get(this.script, { cmd: this.getCmd }))
      this.values = transform ? transform(raw) : raw
      this.loaded = true
    } catch (e) {
      this.error = (e as Error).message
    } finally {
      this.loading = false
    }
  }

  /** Post the given fields with the save command and show the answer */
  save(ids: string[], cmd = 'save_config', extra: Params = {}) {
    return showResult('Save configuration', () => post(this.script, { cmd, ...pick(this.values, ids), ...extra }))
  }
}
