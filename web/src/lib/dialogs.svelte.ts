// Application wide dialogs: result of an action, confirmation

import { htmlToText } from './api'

export const result = $state({ open: false, title: '', text: '', busy: false, error: false })

/** Show the answer of a save / action call in a dialog, as plain text */
export async function showResult(title: string, action: () => Promise<string>, empty = 'Nothing to update') {
  Object.assign(result, { open: true, title, text: '', busy: true, error: false })
  try {
    const text = htmlToText(await action())
    result.text = text || empty
  } catch (e) {
    result.text = `Request failed: ${(e as Error).message}`
    result.error = true
  } finally {
    result.busy = false
  }
}

export const confirmation = $state({
  open: false,
  title: '',
  message: '',
  action: 'Confirm',
  danger: false,
  resolve: (_: boolean) => {},
})

export function confirm(
  message: string,
  { title = 'Please confirm', action = 'Confirm', danger = false } = {},
): Promise<boolean> {
  confirmation.resolve(false)
  return new Promise((resolve) => {
    Object.assign(confirmation, { open: true, title, message, action, danger, resolve })
  })
}
