// Fake camera backend for `npm run dev:mock`: answers the CGI calls with sample data,
// so the UI can be developed without a camera. Writes are acknowledged and forgotten.

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'

const kv = (o: Record<string, string>) =>
  Object.entries(o)
    .map(([k, v]) => `${k}#:#${v}`)
    .join('\n') + '\n'

const switches: Record<string, string> = {
  auto_night_mode: 'ON',
  night_mode: 'OFF',
  ir_led: 'OFF',
  ir_cut: 'ON',
  blue_led: 'ON',
  yellow_led: 'OFF',
  motion_detection: 'ON',
  motion_mail: 'OFF',
  motion_telegram: 'OFF',
  motion_led: 'OFF',
  motion_snapshot: 'ON',
  motion_mqtt: 'OFF',
  motion_mqtt_snapshot: 'OFF',
  motion_mqtt_video: 'OFF',
}

const services = new Map(
  'auto-night-detection debug-on-osd ftp-server mdns-responder mqtt-control mqtt-status onvif-srvd recording rtsp sound-on-startup dropbear telegram-bot timelapse lighttpd'
    .split(' ')
    .map((s, i) => [s, { started: i % 3 !== 1, autostart: i % 2 === 0 }]),
)

let frame = 0
function picture(): string {
  frame++
  const t = new Date().toLocaleTimeString('en-GB')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3b5b6b"/><stop offset="1" stop-color="#1d2b33"/></linearGradient></defs>
  <rect width="1920" height="1080" fill="url(#g)"/>
  <rect x="${300 + ((frame * 40) % 1200)}" y="620" width="220" height="140" rx="16" fill="#e8b04a"/>
  <circle cx="1500" cy="260" r="110" fill="#f4e7b5" opacity="0.8"/>
  <text x="40" y="80" font-family="monospace" font-size="56" fill="#fff">MOCK CAMERA ${t}</text>
</svg>`
}

function files(dir: string): string {
  const lines: string[] = []
  const now = new Date()
  for (let i = 0; i < (dir === 'motion' ? 40 : 6); i++) {
    const d = new Date(now.getTime() - i * 3_700_000)
    const name = `${d.toISOString().slice(0, 19).replace(/[T:]/g, '-')}.${dir === 'recording' ? 'mp4' : i % 2 ? 'mp4' : 'jpg'}`
    const month = d.toLocaleString('en-US', { month: 'short' })
    const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
    lines.push(`-rw-r--r--    1 root     root       ${(i * 37) % 900}.${i % 10}K ${month} ${String(d.getDate()).padStart(2)} ${time} /system/sdcard/DCIM/${dir}/${name}`)
  }
  return lines.join('\n') + '\n'
}

function events(): string {
  const now = Date.now()
  const list = Array.from({ length: 60 }, (_, i) => {
    const d = new Date(now - Math.round(Math.random() * 3 * 86400_000) - i * 1000)
    const pad = (n: number) => String(n).padStart(2, '0')
    const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.000000000`
    return `{"file" : "viewer/motion/mock-${i}.jpg", "date" : "${date}"}`
  })
  return `[\n${list.join(',')}]\n`
}

// Configuration folder of ui_config.cgi: written files are kept until the server restarts
const configFiles = new Map<string, string>([
  ['autonight.conf', "autonight_mode=hw\nsw_parameters='-S -j 3 -w 3'\n"],
  ['hostname.conf', 'DAFANG-MOCK\n'],
  ['lighttpd.conf', 'server.document-root = "/system/sdcard/www"\nserver.port = 80\n'],
  ['motion.conf', '# Motion detection\nmotion_detection=on\nmotion_sensitivity=2\nsave_snapshot=true\n'],
  ['mqtt.conf', 'HOST=broker.local\nPORT=1883\nUSER="cam"\nPASS="secret"\n'],
  ['rtspserver.conf', 'RTSPOPTS="-W1920 -H1080"\nBITRATE=1000\n'],
  ['wpa_supplicant.conf', 'ctrl_interface=/var/run/wpa_supplicant\nnetwork={\n\tssid="MyWifi"\n\tpsk="password"\n}\n'],
  ['autostart/rtsp', '#!/bin/sh\n/system/sdcard/controlscripts/rtsp\n'],
  ['autostart/dropbear', '#!/bin/sh\n/system/sdcard/controlscripts/dropbear\n'],
  ['cron/crontabs/root', '*/15 * * * * /system/sdcard/bin/busybox run-parts /system/sdcard/config/cron/periodic/15min\n'],
  ['motion.conf.bak', '# Motion detection\nmotion_detection=off\n'],
])

function configCgi(cmd: string, file: string | null, method: string, body: string) {
  const reply = (status: number, text: string) => ({ status, body: text + '\n' })
  if (cmd === 'list') {
    const month = new Date().toLocaleString('en-US', { month: 'short' })
    return {
      body:
        [...configFiles]
          .map(([path, text]) => `-rw-r--r--    1 root     root    ${Buffer.byteLength(text)} ${month} 10 12:00 ./${path}`)
          .join('\n') + '\n',
    }
  }
  if (!file || file.startsWith('/') || file.includes('..') || /[^\w./-]/.test(file)) return reply(400, 'Invalid file name')
  if (/^ssl\/|\.pem/.test(file)) return reply(403, "This file can't be viewed from the web interface")
  const text = configFiles.get(file)
  if (text === undefined) return reply(404, `No such file: ${file}`)
  if (cmd === 'read') return { type: 'text/plain; charset=utf-8', body: text }
  if (file.endsWith('.bak')) return reply(400, "Backup files can't be modified")
  if (method !== 'POST') return reply(405, 'Use POST')
  if (cmd === 'write') {
    configFiles.set(file + '.bak', text)
    configFiles.set(file, body)
    return reply(200, `Saved ${file} (previous version kept in ${file}.bak)`)
  }
  if (cmd === 'restore') {
    const backup = configFiles.get(file + '.bak')
    if (backup === undefined) return reply(404, `No backup of ${file}`)
    configFiles.set(file + '.bak', text)
    configFiles.set(file, backup)
    return reply(200, `Restored the previous version of ${file} (the replaced version is now ${file}.bak)`)
  }
  return reply(400, `Unsupported command '${cmd}'`)
}

function cgi(script: string, q: URLSearchParams, method = 'GET', raw = ''): { type?: string; body: string; status?: number } {
  const cmd = q.get('cmd') ?? ''
  switch (script) {
    case 'ui_config.cgi':
      return configCgi(cmd, q.get('file'), method, raw)
    case 'currentpic.cgi':
    case 'downloadpic.cgi':
      return { type: 'image/svg+xml', body: picture() }
    case 'state.cgi':
      if (cmd === 'hostname') return { body: 'DAFANG-MOCK\n' }
      if (cmd === 'version') return { body: 'commit <b>261690e</b> from the <b>master</b> branch\n' }
      if (cmd === 'night_mode') return { body: switches.night_mode + '\n' }
      return { body: '' }
    case 'ui_live.cgi':
      if (cmd === 'status_all') return { body: Object.entries(switches).map(([k, v]) => `${k}:${v}`).join('\n') + '\n' }
      if (cmd === 'hostname') return { body: 'DAFANG-MOCK\n' }
      if (cmd === 'show_HWmodel') return { body: 'Xiaomi Dafang\n' }
      if (cmd === 'recording') return { body: 'OFF\n' }
      if (cmd in switches) switches[cmd] = q.get('action') === 'on' ? 'ON' : 'OFF'
      return { body: '' }
    case 'ui_sdcard.cgi':
      if (cmd === 'check_sdcard') return { body: 'ok' }
      if (cmd === 'getFiles') return { body: files(q.get('dir') ?? '') }
      if (cmd === 'events') return { body: events() }
      return { body: `Removed ${q.get('files')}\n` }
    case 'ui_camera.cgi':
      if (cmd === 'get_config')
        return {
          body: kv({
            multicast: '',
            flip: 'OFF',
            codec: 'H264',
            videoSize: '-W1920 -H1080',
            bitRate: '1000',
            format: '1',
            frmRateNum: '25',
            frmRateDen: '1',
            videoUser: '',
            videoPassword: '',
            videoPort: '8554',
            autoNightMode: 'hw',
            avg: '3',
            audioinFormat: 'OPUS',
            audioinBR: '48000',
            audiooutBR: '48000',
            audioinFilter: '2',
            HFEnabled: 'true',
            AECEnabled: 'false',
            audioinHWVol: '50',
            audioinSWVol: '-1',
            tlinterval: '2.0',
            tlduration: '60',
            osdEnable: 'true',
            osdText: 'Dafang %Y-%m-%d %H:%M:%S',
            osdAxis: 'false',
            osdColor: '0',
            osdSize: '0',
            osdPixel: '-2',
            osdY: '0',
            osdFixW: 'false',
            osdFonts:
              '<option value=""selected\n>Default fonts </option><option value="/system/sdcard/fonts/Lato.ttf" selected\n>Lato.ttf </option><option value="/system/sdcard/fonts/Mono.ttf" >Mono.ttf </option>',
          }),
        }
      return { type: 'text/html', body: `Mock: ${cmd} ${[...q.keys()].filter((k) => k !== 'cmd').join(', ')}<br/>` }
    case 'ui_motion.cgi':
      if (cmd === 'get_config')
        return {
          body: kv({
            currentRegions: '100,100,700,500,1000,300,1500,800',
            motionSensitivity: '2',
            motionIndicatorColor: '2',
            motionDetection: 'on',
            motionTimeout: '60',
            motionTracking: 'off',
            saveSnapshot: 'true',
            saveVideo: 'false',
            maxSnaphotDays: '7',
            maxVideoDays: '7',
            ftpSnapshot: 'false',
            ftpVideo: 'false',
            ftpHost: '',
            ftpPort: '21',
            sendEmail: 'false',
            sendTelegram: 'false',
            telegramAlertType: 'image',
            sendMatrix: 'false',
            matrixAlertType: 'text',
            nightModeEventDelay: '10',
          }),
        }
      return { body: `Regions set to ${q.get('regions') ?? '(unchanged)'}<br/>Motion detection set to ${q.get('motionDetection')}<br/>` }
    case 'ui_net_services.cgi':
      if (cmd === 'get_config_mqtt')
        return { body: kv({ mqttHost: 'broker.local', mqttPort: '1883', mqttUser: 'cam', mqttPass: 'secret', mqttLocation: 'home', mqttDeviceName: 'dafang', mqttAutodiscoveryPrefix: 'homeassistant', mqttStatusInterval: '30' }) }
      if (cmd.startsWith('get_config_')) return { body: kv({ server: 'smtp.example.com', port: '465', host: 'matrix.org', portM: '443', apiToken: '', userChatID: '' }) }
      return { type: 'text/html', body: `Mock ${cmd}: <b>saved</b><br/>` }
    case 'ui_system.cgi':
      if (cmd === 'get_config')
        return {
          body: kv({
            hostname: 'DAFANG-MOCK',
            theme: '',
            ntp: 'pool.ntp.org',
            timezone:
              '<option value="Europe/London">Europe/London</option><option value="Europe/Paris"\nselected>Europe/Paris</option><option value="America/New_York">America/New_York</option>',
            currenttime: `Current time is ${new Date().toString()} - CET-1CEST`,
            github_token: '',
            wifi_ssid: 'MyWifi',
            connect_timeout: '60',
            scan_interval: '30',
            ap_ssid: 'DAFANG-AP',
            usb_eth: 'off',
            ssh_key: 'ssh-ed25519 AAAAC3Nza first@host\nssh-rsa AAAAB3Nza second@host',
            ssh_port: '22',
            ssh_password: 'on',
          }),
        }
      return { type: 'text/html', body: `<p>Mock: would set hostname to '${q.get('hostname')}'</p><p>SSH key: ${q.get('ssh_key')}</p>` }
    case 'ui_info.cgi':
      if (cmd === 'get_config')
        return {
          body: kv({
            hostname: 'DAFANG-MOCK',
            model: 'Xiaomi Dafang',
            fwDate: '2026-10-01',
            fwBranch: 'master',
            fwCommit: '261690e',
            kernel: '#1 PREEMPT',
            bootLoader: 'U-Boot 2013.07',
            localTime: new Date().toString(),
            uptime: '3d, 4h',
            loadAvg: '0.42, 0.51, 0.60',
            ssid: 'MyWifi',
            linkQuality: '62',
            ip: '192.168.1.50',
            mac: '78:11:dc:00:00:00',
            netmask: '255.255.255.0',
            gateway: '192.168.1.1',
            dns: '192.168.1.1\n8.8.8.8',
            bootMD5: '0123456789abcdef',
            bootVersion: 'U-Boot 2013.07',
            bootCMD: 'console=ttyS1,115200n8 mem=104M@0x0',
          }),
        }
      return { body: `Mock output of ${q.get('info')}\n<script>alert(1)</script> must show as text\n` }
    case 'ui_control.cgi':
      if (cmd === 'get_services')
        return {
          body: [...services]
            .map(([s, v]) => `${s}#:#${v.started ? 'started' : 'stopped'}#:#${v.autostart}#:#false`)
            .join('\n') + '\n',
        }
      if (cmd === 'services') services.get(q.get('service') ?? '')!.started = q.get('action') === 'start'
      if (cmd === 'autoStartService') services.get(q.get('service') ?? '')!.autostart = q.get('action') === 'true'
      if (cmd === 'getFiles') return { body: 'config-2026-10-01.tgz#:#2.1K#:#Oct-1-12:00#:#viewer/config/config-2026-10-01.tgz\n' }
      return { body: `Mock ${cmd}\n` }
    case 'ui_softnight.cgi': {
      const exposure = 900000 + Math.round(Math.sin(Date.now() / 20000) * 400000)
      return {
        body: `ISP exposure log2 id: ${exposure}\nISP WB Temperature: ${2900 + Math.round(Math.random() * 200)}\nISP Iridix strength: ${12 + Math.round(Math.random() * 8)}\n`,
      }
    }
    case 'action.cgi':
      if (cmd === 'get_sw_night_config') return { body: '-S -j 3 -w 3 -1 1200000 -2 930000,14,10 -3 3000,0,8\n' }
      if (cmd === 'check_update') return { body: 'EliasKotlyar:master:3\n' }
      if (cmd === 'show_updateProgress') return { body: '-1' }
      return { type: 'text/html', body: `Mock ${cmd} ${q.get('val') ?? ''}<hr/><button>Back</button>` }
    case 'audio_upload.cgi':
      return { body: 'Mock: sound received\n' }
  }
  return { body: `Unsupported command '${cmd}'\n` }
}

async function readBody(req: IncomingMessage): Promise<string> {
  let body = ''
  for await (const chunk of req) body += chunk
  return body
}

export function mockCamera(): Plugin {
  return {
    name: 'mock-camera',
    configureServer(server) {
      server.middlewares.use(async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
        const url = new URL(req.url ?? '/', 'http://mock')
        if (url.pathname.startsWith('/viewer/')) {
          res.setHeader('Content-Type', 'image/svg+xml')
          return res.end(picture())
        }
        const match = url.pathname.match(/^\/cgi-bin\/([\w.]+)$/)
        if (!match) return next()
        const query = new URLSearchParams(url.search)
        const raw = req.method === 'POST' ? await readBody(req) : ''
        if (String(req.headers['content-type']).startsWith('application/x-www-form-urlencoded')) {
          for (const [k, v] of new URLSearchParams(raw)) query.set(k, v)
        }
        const { type = 'text/plain', body, status = 200 } = cgi(match[1], query, req.method, raw)
        // A bit of latency, like the real camera
        setTimeout(() => {
          res.statusCode = status
          res.setHeader('Content-Type', type)
          res.setHeader('Cache-Control', 'no-store')
          res.end(body)
        }, 150)
      })
    },
  }
}
