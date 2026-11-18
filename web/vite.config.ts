import { rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig, loadEnv, type Plugin, type ProxyOptions } from 'vite'
import { mockCamera } from './mock/plugin.ts'

// The build goes straight into the web root of the firmware: installing the firmware
// (copying firmware_mod to the SD card) installs the interface
const OUT_DIR = resolve(import.meta.dirname, '../firmware_mod/www')

// The web root also holds the CGI backend (cgi-bin, json): only remove the previous build
function cleanPreviousBuild(): Plugin {
  return {
    name: 'clean-previous-build',
    apply: 'build',
    buildStart() {
      rmSync(resolve(OUT_DIR, 'assets'), { recursive: true, force: true })
      rmSync(resolve(OUT_DIR, 'index.html'), { force: true })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'CAMERA_')
  const target = env.CAMERA_URL

  // The camera serves the API over HTTPS with a self-signed certificate and basic auth.
  // Plain HTTP answers with a redirect to the camera itself, which would bypass the proxy.
  const proxy: ProxyOptions = {
    target,
    changeOrigin: true,
    secure: false,
    headers: env.CAMERA_USER
      ? {
          Authorization:
            'Basic ' + Buffer.from(`${env.CAMERA_USER}:${env.CAMERA_PASSWORD ?? ''}`).toString('base64'),
        }
      : {},
  }

  return {
    // Relative asset paths: the build works from any folder of the camera web root
    base: './',
    plugins: [svelte(), mode === 'mock' ? mockCamera() : null, cleanPreviousBuild()],
    build: {
      outDir: OUT_DIR,
      emptyOutDir: false,
      // Keep everything in a few files: every request costs a lot on the camera
      assetsInlineLimit: 0,
      modulePreload: { polyfill: false },
    },
    server: {
      host: true,
      proxy: mode !== 'mock' && target ? { '/cgi-bin': proxy, '/viewer': proxy } : undefined,
    },
  }
})
