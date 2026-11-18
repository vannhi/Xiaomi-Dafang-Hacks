# Web UI (Svelte 5)

The web interface of the camera, written in [Svelte 5](https://svelte.dev) with Vite and TypeScript. It replaces
the previous jQuery / W3.CSS interface of `firmware_mod/www` and uses the CGI backend of
`firmware_mod/www/cgi-bin`, including `ui_config.cgi` for the **Configuration files** page.

The build is committed in `firmware_mod/www/` (`index.html` and `assets/`), so that installing the firmware
installs the interface: after a change in `src/`, run `pnpm build` and commit the result with the sources.

Compared with the previous UI:

- jQuery, DataTables, FontAwesome, d3, event-drops, smoothie and selectareas are replaced by small components:
  the build is about 145 KB of JavaScript (50 KB gzipped) instead of several MB of libraries.
- Pages load their data only when needed (tabs, log sections), and polling stops when the browser tab is hidden.
- Answers of the camera are always shown as text, never as HTML.
- Light / dark theme with an accent color, and a layout that works on phones.

## Development

Requires Node.js 20 or newer and [pnpm](https://pnpm.io) (`corepack enable` installs the version set in `package.json`).

```sh
cd web
pnpm install
```

### Against a real camera

Copy `.env.example` to `.env.local` and set the address and credentials of the camera:

```sh
CAMERA_URL=https://192.168.1.50
CAMERA_USER=root
CAMERA_PASSWORD=ismart12
```

Then run `pnpm dev` and open the printed URL. The dev server proxies `/cgi-bin` and `/viewer` to the camera
over HTTPS (the self-signed certificate is accepted) and adds the basic auth header.
`.env.local` is ignored by git.

Every button really acts on the camera. Saving the **System** page re-applies all its fields (hostname, time
zone, Wi-Fi and access point settings, SSH keys...) and restarts the SSH server; password fields left as `*****`
(or emptied) keep the current passwords. The **Software night detection** page switches the night mode when a
rule triggers (uncheck "Switch the camera when a rule triggers" to only watch).

### Without a camera

`pnpm dev:mock` serves the UI with a fake backend (`mock/plugin.ts`) answering the CGI calls with sample data.

### Checks

```sh
pnpm check   # svelte-check + TypeScript
pnpm build   # production build in ../firmware_mod/www/
```

## Configuration files page

**Settings → Configuration files** shows the raw files of `/system/sdcard/config` (and of `autostart/`, `cron/`,
`userscripts/`) and lets you edit them. It relies on `cgi-bin/ui_config.cgi`:

- only existing files of the configuration folder can be read or written (no `..`, no absolute path);
- private keys and certificates (`ssl/`, `*.pem`, `*.key`) are never listed nor sent;
- a save writes the request body as is (never decoded nor evaluated) to a temporary copy, then replaces the file,
  keeping its permissions; the previous version is kept as `<file>.bak`, and *Restore previous version* swaps the
  two;
- files are limited to 64 KB, and non-text files are shown read-only.

Files that can cut the access to the camera (`lighttpd.conf`, `lighttpd.user`, `wpa_supplicant.conf`, network and
SSH settings) are flagged and ask for a confirmation before saving. Changes are applied when the related service
restarts or at the next reboot. Unsaved edits are kept while browsing other files or pages, until the browser tab
is closed.

## Build and deployment

`pnpm build` writes `index.html` and `assets/` (one JavaScript and one CSS file) straight into
`../firmware_mod/www/`, after removing the previous build. The rest of that folder (`cgi-bin/`, `json/`) is the
backend and is left untouched. Only file types already known to lighttpd (`html`, `css`, `js`) are produced.

To update a camera, copy `firmware_mod/www/index.html`, `firmware_mod/www/assets/` and
`firmware_mod/www/cgi-bin/` to `/system/sdcard/www/` on the SD card, then force a reload of the page in the
browser.

Asset paths are relative and the backend is called with absolute paths (`/cgi-bin/...`), so the build also works
from a sub-folder of the web root. Pages are addressed with the URL hash, for example `https://<camera>/#/camera`.
