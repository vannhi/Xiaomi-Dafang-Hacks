// Push to talk: record the microphone and play it on the camera speaker
// The camera plays a WAV file: mono, 16 bits PCM, 8 kHz (audio_upload.cgi + audioplay)

import { CGI } from './api'

const SAMPLE_RATE = 8000

// Capture raw samples in an AudioWorklet, loaded from a blob: no extra file to serve
const workletSource = `
registerProcessor('capture', class extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0] && inputs[0][0]
    if (channel) this.port.postMessage(channel.slice(0))
    return true
  }
})`

/** One recording: create a new one for each press */
export class Talk {
  private stream?: MediaStream
  private context?: AudioContext
  private chunks: Float32Array[] = []
  private starting?: Promise<void>

  start(): Promise<void> {
    this.starting = this.open()
    return this.starting
  }

  private async open() {
    // Recording requires a secure context: the camera UI is served over HTTPS
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
    // Use the native rate of the device (Firefox can't mix rates) and resample at the end
    this.context = new AudioContext()
    const url = URL.createObjectURL(new Blob([workletSource], { type: 'text/javascript' }))
    try {
      await this.context.audioWorklet.addModule(url)
    } finally {
      URL.revokeObjectURL(url)
    }
    const source = this.context.createMediaStreamSource(this.stream)
    const node = new AudioWorkletNode(this.context, 'capture')
    node.port.onmessage = (e) => this.chunks.push(e.data as Float32Array)
    source.connect(node)
  }

  /** Stop recording and send the sound to the camera */
  async stop(): Promise<string> {
    // Released while the microphone was still being opened (e.g. permission prompt)
    await this.starting?.catch(() => {})
    const context = this.context
    this.stream?.getTracks().forEach((t) => t.stop())
    this.stream = undefined
    this.context = undefined
    if (!context) return ''
    const rate = context.sampleRate
    await context.close()

    const length = this.chunks.reduce((n, c) => n + c.length, 0)
    const samples = new Float32Array(length)
    let offset = 0
    for (const chunk of this.chunks) {
      samples.set(chunk, offset)
      offset += chunk.length
    }
    this.chunks = []
    if (!length) return ''

    const body = new FormData()
    body.append('audio_data', encodeWav(resample(samples, rate, SAMPLE_RATE), SAMPLE_RATE), 'recording.wav')
    const res = await fetch(CGI + 'audio_upload.cgi', { method: 'POST', body })
    return res.text()
  }
}

/** Downsample by averaging the input samples covered by each output sample */
function resample(input: Float32Array, from: number, to: number): Float32Array {
  if (from === to) return input
  const ratio = from / to
  const output = new Float32Array(Math.floor(input.length / ratio))
  for (let i = 0; i < output.length; i++) {
    const start = Math.floor(i * ratio)
    const end = Math.min(input.length, Math.floor((i + 1) * ratio))
    let sum = 0
    for (let j = start; j < end; j++) sum += input[j]
    output[i] = sum / Math.max(1, end - start)
  }
  return output
}

function encodeWav(samples: Float32Array, rate: number): Blob {
  const view = new DataView(new ArrayBuffer(44 + samples.length * 2))
  const text = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i))
  }
  text(0, 'RIFF')
  view.setUint32(4, 36 + samples.length * 2, true)
  text(8, 'WAVE')
  text(12, 'fmt ')
  view.setUint32(16, 16, true) // format chunk length
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, 1, true) // mono
  view.setUint32(24, rate, true)
  view.setUint32(28, rate * 2, true) // byte rate
  view.setUint16(32, 2, true) // block align
  view.setUint16(34, 16, true) // bits per sample
  text(36, 'data')
  view.setUint32(40, samples.length * 2, true)
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true)
  }
  return new Blob([view], { type: 'audio/wav' })
}
