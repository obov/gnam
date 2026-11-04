// gnam-view-pixel bridge: Claude Code mod 와 pixel 앱 사이 중계 (별도 node 프로세스).
//
//   mod ── http 127.0.0.1 (Bearer token) ──▶ bridge ── PIXEL_EMBED unix 소켓 (ndjson) ──▶ pixel 앱
//                                                   └─ GNAM_VIEW_CONTROL unix 소켓 (refresh) ─┘
//
// 앱은 frame 을 POSIX shm 이름으로 보내고, bridge 는 그 이름을 /state 로 mod 에 넘긴다.
// mod 는 Image · $.ui.blit 으로 그 shm 을 터미널에 그리게 한다 (pixel 은 터미널에 직접 쓰지 않음).
// 구조는 terminal-browser cli/src/claude-bridge.ts (MIT) 를 따른다.
//
//   node dist/bridge.cjs launch --cwd <repo> [--tty <path>] [--theme auto|dark|light]   serve 를 detach 로 띄우고 { port, token } 한 줄
//   node dist/bridge.cjs serve  --cwd <repo> --tty <path> --socket <path> --token <t> [--theme …]

import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'

import { isFrame, isInputEvent, isSize, type BridgeState, type Frame, type LaunchReport } from './protocol.ts'

const APP_DIR = path.resolve(__dirname, '..')
const APP_ENTRY = path.join(APP_DIR, 'dist', 'main.cjs')
const PIXEL_BIN = path.join(APP_DIR, 'node_modules', '@zenbu-labs', 'pixel', 'dist', 'bin.js')
const ELECTRON_MARKER = path.join(APP_DIR, 'node_modules', '@zenbu-labs', 'pixel', 'electron', 'dist', '.zenbu-electron-sha256')
const STATE_DIR = path.join(process.env.XDG_STATE_HOME ?? path.join(os.homedir(), '.local', 'state'), 'gnam-view-pixel')
const LOG_FILE = path.join(STATE_DIR, 'bridge.log')
const DEFAULT_CELL: [number, number] = [9, 18]
const STATE_WAIT_MS = 1000
const IDLE_EXIT_MS = 60_000
const MAX_IMAGE_PX = 4096

function flag(argv: string[], name: string): string | undefined {
  const at = argv.indexOf(name)
  return at >= 0 ? argv[at + 1] : undefined
}

function log(event: string, detail?: unknown): void {
  process.stderr.write(`${new Date().toISOString()} ${event}${detail === undefined ? '' : ' ' + JSON.stringify(detail)}\n`)
}

function report(value: LaunchReport, exitCode = 0): never {
  process.stdout.write(JSON.stringify(value) + '\n')
  process.exit(exitCode)
}

/** 부모를 따라 올라가며 처음 만나는 tty (Claude Code 가 붙은 터미널) */
export function callerTty(): string | null {
  let pid = process.pid
  for (let hops = 0; hops < 30 && pid > 1; hops++) {
    let out: string
    try {
      out = execFileSync('ps', ['-o', 'ppid=,tty=', '-p', String(pid)], { encoding: 'utf8' }).trim()
    } catch {
      return null
    }
    const [ppid, tty] = out.split(/\s+/)
    if (tty && tty !== '??' && tty !== '?') return `/dev/${tty}`
    pid = Number(ppid)
    if (!Number.isFinite(pid)) return null
  }
  return null
}

/** 설치 상태 문제 (없으면 null) */
export function installProblem(): string | null {
  if (!fs.existsSync(PIXEL_BIN) || !fs.existsSync(ELECTRON_MARKER)) return `pixel 런타임 없음: (cd ${APP_DIR} && npm run setup)`
  if (!fs.existsSync(APP_ENTRY)) return `앱 빌드 없음: (cd ${APP_DIR} && npm run build)`
  return null
}

async function launch(argv: string[]): Promise<never> {
  const cwd = path.resolve(flag(argv, '--cwd') ?? process.cwd())
  const tty = flag(argv, '--tty') ?? callerTty()
  const theme = flag(argv, '--theme') ?? 'auto'
  if (!tty) report({ error: 'tty 없음: Claude Code 가 터미널에서 실행 중이 아님', code: 'tty' }, 2)
  const problem = installProblem()
  if (problem) report({ error: problem, code: 'install' }, 2)
  const token = crypto.randomBytes(24).toString('hex')
  // macOS unix 소켓 경로 104 바이트 제한: 짧은 /tmp
  const base = process.platform === 'darwin' ? '/tmp' : os.tmpdir()
  const socket = path.join(base, `gnam-pixel-${process.pid}-${Date.now().toString(36)}.sock`)
  fs.mkdirSync(STATE_DIR, { recursive: true })
  const logFd = fs.openSync(LOG_FILE, 'a')
  const child = spawn(
    process.execPath,
    [process.argv[1]!, 'serve', '--cwd', cwd, '--tty', tty, '--socket', socket, '--token', token, '--theme', theme],
    { detached: true, stdio: ['ignore', 'pipe', logFd], cwd },
  )
  let line = ''
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('bridge 가 port 를 알리지 않음')), 10_000)
      child.stdout!.on('data', (chunk: Buffer) => {
        line += chunk.toString()
        if (line.includes('\n')) {
          clearTimeout(timer)
          resolve()
        }
      })
      child.once('exit', code => {
        clearTimeout(timer)
        reject(new Error(`bridge 종료 (exit ${code}), 로그 ${LOG_FILE}`))
      })
    })
  } catch (error) {
    report({ error: error instanceof Error ? error.message : String(error), code: 'start' }, 1)
  }
  const { port } = JSON.parse(line.split('\n')[0]!) as { port: number }
  child.stdout!.destroy()
  child.unref()
  report({ port, token, pid: child.pid ?? 0, tty })
}

type Size = { cols: number; rows: number }

export class Bridge {
  port: number | null = null
  size: Size = { cols: 80, rows: 24 }
  frame: Frame | null = null
  version = 0
  joined = false
  alive = false
  title = ''
  error: string | null = null
  private waiters: Array<() => void> = []
  private conn: net.Socket | null = null
  private controls = new Set<net.Socket>()
  private child: ChildProcess | null = null
  private pixelServer: net.Server | null = null
  private controlServer: net.Server | null = null
  private measuredCell: [number, number] | null = null
  private stopping = false

  constructor(
    readonly cwd: string,
    readonly tty: string,
    readonly socketPath: string,
    readonly theme: string = 'auto',
  ) {}

  get controlPath(): string {
    return `${this.socketPath}.ctl`
  }

  state(): BridgeState {
    return { version: this.version, frame: this.frame, joined: this.joined, alive: this.alive, title: this.title, error: this.error }
  }

  changed(): void {
    this.version += 1
    const waiters = this.waiters
    this.waiters = []
    for (const wake of waiters) wake()
  }

  stateAfter(version: number): Promise<BridgeState> {
    if (version !== this.version) return Promise.resolve(this.state())
    return new Promise(resolve => {
      const wake = () => {
        clearTimeout(timer)
        resolve(this.state())
      }
      const timer = setTimeout(() => {
        this.waiters = this.waiters.filter(w => w !== wake)
        resolve(this.state())
      }, STATE_WAIT_MS)
      this.waiters.push(wake)
    })
  }

  private cell(): [number, number] {
    return this.measuredCell ?? DEFAULT_CELL
  }

  private fit(size: Size): Size {
    const [cw, ch] = this.cell()
    return {
      cols: Math.max(1, Math.min(size.cols, 255, Math.floor(MAX_IMAGE_PX / cw))),
      rows: Math.max(1, Math.min(size.rows, 255, Math.floor(MAX_IMAGE_PX / ch))),
    }
  }

  private send(message: unknown): void {
    if (!this.conn) return
    try {
      this.conn.write(JSON.stringify(message) + '\n')
    } catch {}
  }

  listen(): void {
    for (const p of [this.socketPath, this.controlPath]) fs.rmSync(p, { force: true })
    this.pixelServer = net.createServer(conn => {
      if (this.conn) {
        conn.destroy()
        return
      }
      this.conn = conn
      let buf = ''
      conn.on('data', (data: Buffer) => {
        buf += data.toString('utf8')
        let at = buf.indexOf('\n')
        while (at !== -1) {
          this.onPixelLine(buf.slice(0, at))
          buf = buf.slice(at + 1)
          at = buf.indexOf('\n')
        }
      })
      conn.on('error', () => {})
      conn.on('close', () => {
        if (this.conn !== conn) return
        this.conn = null
        this.joined = false
        this.frame = null
        this.changed()
      })
    })
    this.pixelServer.listen(this.socketPath)
    this.controlServer = net.createServer(conn => {
      this.controls.add(conn)
      conn.on('error', () => {})
      conn.on('close', () => this.controls.delete(conn))
    })
    this.controlServer.listen(this.controlPath)
  }

  private onPixelLine(line: string): void {
    let m: Record<string, unknown>
    try {
      m = JSON.parse(line)
    } catch {
      return
    }
    switch (m.type) {
      case 'join':
        this.joined = true
        this.send({ type: 'init', cols: this.size.cols, rows: this.size.rows, transport: 'host', focused: true })
        this.changed()
        break
      case 'frame': {
        const cell = m.cell
        if (Array.isArray(cell) && cell.length === 2 && cell.every(n => Number.isInteger(n) && n > 0)) {
          this.measuredCell = [cell[0] as number, cell[1] as number]
        }
        const frame = { shm: m.shm, format: m.format, width: m.width, height: m.height, generation: m.generation, cols: m.cols, rows: m.rows }
        if (!isFrame(frame)) return
        this.frame = frame
        this.changed()
        break
      }
      case 'title':
        if (typeof m.text === 'string' && m.text !== this.title) {
          this.title = m.text
          this.changed()
        }
        break
      case 'clipboard':
        if (typeof m.text === 'string' && process.platform === 'darwin') {
          try {
            spawn('pbcopy', { stdio: ['pipe', 'ignore', 'ignore'] }).stdin!.end(m.text)
          } catch {}
        }
        break
    }
  }

  /** 앱이 없으면 띄우고, 있으면 크기 · 표시만 알린다 */
  open(size: Size | null): void {
    if (size) this.size = this.fit(size)
    if (this.alive) {
      this.send({ type: 'size', cols: this.size.cols, rows: this.size.rows })
      this.send({ type: 'visible', value: true })
      return
    }
    this.error = null
    this.alive = true
    this.frame = null
    this.changed()
    const env: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: 'production' }
    delete env.PIXEL_PANE
    delete env.ELECTRON_RUN_AS_NODE
    env.PIXEL_EMBED = this.socketPath
    env.PIXEL_TTY = this.tty
    env.GNAM_VIEW_CONTROL = this.controlPath
    env.GNAM_VIEW_CWD = this.cwd
    env.GNAM_VIEW_THEME = this.theme
    const child = spawn(process.execPath, [PIXEL_BIN, APP_ENTRY], { env, cwd: this.cwd, stdio: ['ignore', 'ignore', 'pipe'] })
    let stderr = ''
    child.stderr!.on('data', (chunk: Buffer) => {
      stderr = (stderr + chunk.toString()).slice(-2000)
    })
    child.on('error', error => {
      this.alive = false
      this.error = error.message
      this.changed()
    })
    child.on('exit', code => {
      if (this.child !== child) return
      this.child = null
      this.alive = false
      this.frame = null
      if (code && !this.stopping) {
        this.error = stderr.trim().split('\n').at(-1) || `앱 종료 (exit ${code})`
        log('app exited', { code, stderr: stderr.trim().slice(-300) })
      }
      this.changed()
    })
    this.child = child
  }

  resize(size: Size): void {
    const fitted = this.fit(size)
    if (fitted.cols === this.size.cols && fitted.rows === this.size.rows) return
    this.size = fitted
    this.send({ type: 'size', cols: fitted.cols, rows: fitted.rows })
  }

  /** 셀 좌표 입력 → 앱 픽셀 좌표 */
  input(events: unknown[]): void {
    const [cw, ch] = this.cell()
    for (const event of events) {
      if (!isInputEvent(event)) continue
      if (event.type === 'mouse') {
        // 정수 = 셀 번호 (셀 가운데), 소수 = 셀 안 위치까지 아는 터미널
        const x = Math.max(0, Math.round(event.x * cw + (Number.isInteger(event.x) ? cw / 2 : 0)))
        const y = Math.max(0, Math.round(event.y * ch + (Number.isInteger(event.y) ? ch / 2 : 0)))
        this.send({ type: 'mouse', kind: event.kind, button: event.button ?? 'none', mods: event.mods ?? {}, x, y })
      } else {
        this.send({ type: 'key', key: event.key, kind: 'press', text: event.text, mods: event.mods ?? {} })
      }
    }
  }

  refresh(): void {
    for (const conn of this.controls) {
      try {
        conn.write(JSON.stringify({ type: 'refresh' }) + '\n')
      } catch {}
    }
  }

  hide(): void {
    this.send({ type: 'visible', value: false })
  }

  close(): void {
    if (this.stopping) return
    this.stopping = true
    const finish = () => {
      try {
        this.pixelServer?.close()
        this.controlServer?.close()
      } catch {}
      for (const p of [this.socketPath, this.controlPath]) fs.rmSync(p, { force: true })
      process.exit(0)
    }
    const child = this.child
    if (child && child.exitCode === null) {
      child.kill('SIGTERM')
      child.once('exit', () => setTimeout(finish, 100))
      setTimeout(() => {
        try {
          child.kill('SIGKILL')
        } catch {}
        finish()
      }, 3500).unref()
    } else {
      setTimeout(finish, 100).unref()
    }
  }
}

function readJson(request: http.IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise(resolve => {
    let body = ''
    request.on('data', (chunk: Buffer) => {
      body += chunk.toString()
    })
    request.on('end', () => {
      try {
        const v = body ? JSON.parse(body) : {}
        resolve(typeof v === 'object' && v !== null ? v : {})
      } catch {
        resolve({})
      }
    })
    request.on('error', () => resolve({}))
  })
}

type Reply = [number, unknown]

function serve(argv: string[]): void {
  const cwd = flag(argv, '--cwd') ?? process.cwd()
  const tty = flag(argv, '--tty')
  const socket = flag(argv, '--socket')
  const token = flag(argv, '--token') ?? ''
  if (!tty || !socket || !token) {
    process.stderr.write('bridge serve 에 --tty · --socket · --token 필요\n')
    process.exit(2)
  }
  const bridge = new Bridge(cwd, tty, socket, flag(argv, '--theme') ?? 'auto')
  bridge.listen()
  let lastSeen = Date.now()
  const routes: Record<string, (body: Record<string, unknown>, query: URLSearchParams) => Reply | Promise<Reply>> = {
    'GET /state': async (_b, q) => {
      const v = Number(q.get('version'))
      return [200, await bridge.stateAfter(Number.isFinite(v) ? v : -1)]
    },
    'POST /open': b => {
      bridge.open(isSize(b) ? b : null)
      return [200, bridge.state()]
    },
    'POST /size': b => {
      if (isSize(b)) bridge.resize(b)
      return [200, bridge.state()]
    },
    'POST /input': b => {
      if (Array.isArray(b.events)) bridge.input(b.events)
      return [200, {}]
    },
    'POST /refresh': () => {
      bridge.refresh()
      return [200, {}]
    },
    'POST /hide': () => {
      bridge.hide()
      return [200, bridge.state()]
    },
    'POST /close': () => {
      setTimeout(() => bridge.close(), 0)
      return [200, {}]
    },
  }
  const server = http.createServer(async (request, response) => {
    if (request.headers.authorization !== `Bearer ${token}`) {
      response.writeHead(401, { 'content-type': 'application/json' })
      response.end('{"error":"unauthorized"}')
      return
    }
    lastSeen = Date.now()
    const url = new URL(request.url ?? '/', 'http://127.0.0.1')
    const handler = routes[`${request.method} ${url.pathname}`]
    const [status, value] = handler ? await handler(request.method === 'POST' ? await readJson(request) : {}, url.searchParams) : [404, { error: 'not found' }]
    response.writeHead(status, { 'content-type': 'application/json' })
    response.end(JSON.stringify(value))
  })
  server.listen(0, '127.0.0.1', () => {
    const address = server.address()
    if (!address || typeof address === 'string') process.exit(1)
    bridge.port = address.port
    process.stdout.write(JSON.stringify({ port: address.port }) + '\n')
  })
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) process.on(signal, () => bridge.close())
  // mod 가 사라지면 (long-poll 끊김) 정리
  setInterval(() => {
    if (Date.now() - lastSeen > IDLE_EXIT_MS) bridge.close()
  }, 5_000).unref()
}

if (require.main === module) {
  const [mode, ...rest] = process.argv.slice(2)
  if (mode === 'launch') void launch(rest)
  else if (mode === 'serve') serve(rest)
  else {
    process.stderr.write('usage: bridge.cjs launch|serve ...\n')
    process.exit(2)
  }
}
