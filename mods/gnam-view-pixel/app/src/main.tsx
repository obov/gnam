// pixel 앱 entry (pixel CLI 가 Electron 안에서 require). PIXEL_EMBED 면 bridge 에 frame 을 보낸다.
import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import net from 'node:net'

import { createRoot } from '@zenbu-labs/pixel'

import { Loader, type Exec, type Files } from './model.ts'
import { Controller, pollMs, startPolling } from './store.ts'
import type { TerminalColors } from './theme.ts'
import { App } from './view.tsx'

const cwd = process.env.GNAM_VIEW_CWD || process.cwd()
const pref = process.env.GNAM_VIEW_THEME === 'light' ? 'light' : process.env.GNAM_VIEW_THEME === 'dark' ? 'dark' : null

const exec: Exec = (argv, dir) =>
  new Promise(resolve => {
    execFile(argv[0]!, argv.slice(1), { cwd: dir, maxBuffer: 64 * 1024 * 1024, timeout: 60_000, env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined } }, (error, stdout, stderr) => {
      const code = error ? (typeof (error as { code?: unknown }).code === 'number' ? ((error as { code: number }).code) : 1) : 0
      resolve({ code, stdout: String(stdout), stderr: String(stderr || (error && code === 1 ? error.message : '')) })
    })
  })

const files: Files = {
  read: p => fs.readFile(p, 'utf8').catch(() => null),
  mtime: p => fs.stat(p).then(st => st.mtimeMs, () => null),
  list: d => fs.readdir(d).catch(() => null),
}

const controller = new Controller(new Loader(cwd, exec, files), pref)

const root = createRoot({
  name: 'gnam',
  devtools: false,
  onKey(event) {
    if (event.kind === 'release') return
    if (event.mods.ctrl && event.key === 'c') {
      root.stop()
      return true
    }
    return controller.key(event) || undefined
  },
  onColors(colors) {
    controller.setColors(colors as TerminalColors)
  },
  onResize({ basePx, width }) {
    controller.setBasePx(basePx)
    controller.setWidth(width)
  },
})

controller.setBasePx(root.info.basePx)
controller.setWidth(root.info.width)
if (root.info.colors?.background || root.info.colors?.foreground) controller.setColors(root.info.colors as TerminalColors)
root.render(<App controller={controller} />)
void controller.refresh()

// bridge 제어 소켓: { type: 'refresh' } 이면 바뀐 경우에만 다시 읽기.
// 제어 소켓이 없으면 독립 실행 (herdr 분할 pane 등): 주기적으로 확인해 바뀔 때만 다시 읽는다
const control = process.env.GNAM_VIEW_CONTROL
if (!control) startPolling(controller, pollMs(process.env.GNAM_VIEW_POLL_MS))
if (control) {
  const sock = net.connect(control)
  let buf = ''
  sock.on('data', chunk => {
    buf += chunk.toString('utf8')
    let at = buf.indexOf('\n')
    while (at !== -1) {
      const line = buf.slice(0, at)
      buf = buf.slice(at + 1)
      at = buf.indexOf('\n')
      try {
        if (JSON.parse(line).type === 'refresh') void controller.refresh()
      } catch {}
    }
  })
  sock.on('error', () => {})
}
