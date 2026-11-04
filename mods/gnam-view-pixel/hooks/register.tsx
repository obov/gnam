/* @jsx h */
// gnam-view-pixel: /gnam-pixel → bridge launch (process.run) → state long-poll ($.http.fetch)
// → frame (POSIX shm) 을 Image · $.ui.blit 으로 그림, Client surface 로 키 · 마우스 전달.
// 구조는 terminal-browser claude-code-plugin/hooks/register.tsx (MIT) 를 따른다.
// herdr 안 (HERDR_ENV=1) 에서는 Claude Code pane 의 Image 가 그려지지 않으므로 (libghostty: kitty placeholder 미지원)
// herdr 분할 pane 을 만들어 pixel 앱을 직접 (PIXEL_EMBED 없이) 실행한다: split.ts.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { BridgeState, Frame, PixelNotice } from '../types'
import { isBridgeState, isInputMessage, isLaunchReport, isSizeMessage } from './protocol.ts'
import { herdrContext, openSplit } from './split.ts'
import { MAX_IMAGE_CELLS } from './surface.tsx'

const PANE = 'gnam-pixel'
const COMMAND = 'gnam-pixel'
const TITLE = 'gnam'
const IMAGE_KEY = 'view'
const FALLBACK = '/gnam-view (글자 pane) 를 쓰세요'
const NO_GRAPHICS = `이 터미널은 kitty graphics 그림을 그리지 못합니다 — ${FALLBACK}`
const WATCH_RETRY_MS = 250
const DENIED_REDRAW_MS = 500
const DENIALS_BEFORE_NOTICE = 3

const notice = atom({ plugin: 'gnam-view-pixel', key: 'notice' } as const, null as PixelNotice, { shape: 'notice-1' })

// 모듈 변수는 reload 때 처음으로 돌아간다 (bridge 는 60초 idle 이면 스스로 끝남)
const state = {
  port: null as number | null,
  token: null as string | null,
  open: false,
  /** 크기를 아직 모름: Client 가 size 를 보내면 /open */
  pendingOpen: false,
  region: null as { cols: number; rows: number } | null,
  last: null as BridgeState | null,
  frame: null as Frame | null,
  mounted: null as { cols: number; rows: number } | null,
  watcher: 0,
  starting: null as Promise<boolean> | null,
}

const url = (path: string) => `http://127.0.0.1:${state.port}${path}`
const auth = () => ({ authorization: `Bearer ${state.token}` })

function themeOf(options: Record<string, unknown>): string {
  const t = options.theme
  return t === 'dark' || t === 'light' ? t : 'auto'
}

function directionOf(options: Record<string, unknown>): 'right' | 'down' {
  return options.split === 'down' ? 'down' : 'right'
}

async function setNotice($: EngineInterface, next: PixelNotice): Promise<void> {
  await update($, notice, () => next)
  $.ui.invalidate('ui.render')
}

async function startBridge($: EngineInterface, theme: string): Promise<boolean> {
  const cwd = await $.session.cwd()
  let report: unknown = null
  try {
    const { stdout, stderr, exitCode } = await $.process.run(
      ['node', `${$.plugin.root}/app/dist/bridge.cjs`, 'launch', '--cwd', cwd, '--theme', theme],
      { timeoutMs: 20_000 },
    )
    const line = stdout.split('\n').find(t => t.startsWith('{'))
    report = line ? JSON.parse(line) : { error: stderr.trim() || `bridge 실행 실패 (exit ${exitCode})`, code: 'start' }
  } catch (error) {
    report = { error: `bridge 실행 실패: ${String(error)}`, code: 'start' }
  }
  if (!isLaunchReport(report) || !('port' in report)) {
    const r = isLaunchReport(report) && 'error' in report ? report : { error: 'bridge 응답 없음', code: 'start' }
    await setNotice($, { code: r.code, text: r.error })
    return false
  }
  state.port = report.port
  state.token = report.token
  await setNotice($, null)
  // 환경이 내려가면 (reload · 종료) 대기 중인 sleep 이 거절된다: 버린다
  void watchBridge($).catch(() => {})
  return true
}

async function post($: EngineInterface, path: string, body: unknown = {}): Promise<unknown> {
  if (state.port === null) return null
  try {
    const r = await $.http.fetch(url(path), { method: 'POST', headers: { 'content-type': 'application/json', ...auth() }, body: JSON.stringify(body) })
    return r.ok ? JSON.parse(r.text || '{}') : null
  } catch {
    return null
  }
}

async function fetchState($: EngineInterface, version: number): Promise<BridgeState | null> {
  if (state.port === null) return null
  try {
    const r = await $.http.fetch(url(`/state?version=${version}`), { headers: auth() })
    const parsed: unknown = r.ok ? JSON.parse(r.text) : null
    return isBridgeState(parsed) ? parsed : null
  } catch {
    return null
  }
}

const imageSource = (f: Frame) => ({ shm: f.shm, format: f.format, width: f.width, height: f.height, generation: f.generation })

function imageGrid(f: Frame, cols: number, rows: number) {
  return {
    cols: Math.max(1, Math.min(f.cols, cols, MAX_IMAGE_CELLS)),
    rows: Math.max(1, Math.min(f.rows, rows, MAX_IMAGE_CELLS)),
  }
}

function fitsMounted(f: Frame): boolean {
  if (!state.mounted || !state.region) return false
  const g = imageGrid(f, state.region.cols, state.region.rows)
  return g.cols === state.mounted.cols && g.rows === state.mounted.rows
}

async function watchBridge($: EngineInterface): Promise<void> {
  const watcher = ++state.watcher
  const live = () => state.watcher === watcher && state.port !== null
  let version = -1
  let denials = 0
  let lastRedraw = 0
  let failures = 0
  while (live()) {
    const fresh = await fetchState($, version)
    if (!live()) return
    if (!fresh) {
      // bridge 가 끝났으면 (idle · 오류) 다음 /gnam-pixel 이 새로 띄운다
      if (++failures >= 8) {
        state.port = null
        state.frame = null
        state.last = null
        if (state.open) await setNotice($, { code: 'start', text: 'bridge 연결 끊김 — /gnam-pixel 로 다시 열기' })
        return
      }
      await $.clock.sleep(WATCH_RETRY_MS)
      continue
    }
    failures = 0
    version = fresh.version
    const prev = state.last
    state.last = fresh
    if (!state.open) continue
    if (fresh.error && fresh.error !== prev?.error) await setNotice($, { code: 'app', text: fresh.error })
    const gone = fresh.frame === null && state.frame !== null
    if (gone) state.frame = null
    if (!prev || gone || prev.alive !== fresh.alive) $.ui.invalidate('ui.render')
    const f = fresh.frame
    if (!f || f.generation === state.frame?.generation) continue
    state.frame = f
    if (!fitsMounted(f)) {
      $.ui.invalidate('ui.render')
      continue
    }
    const r = await $.ui.blit({ requestId: PANE, key: IMAGE_KEY, source: imageSource(f) })
    if (!r.deny) {
      denials = 0
      continue
    }
    denials += 1
    if (denials === DENIALS_BEFORE_NOTICE) $.ui.log(`gnam-view-pixel: frame blit 거절: ${r.deny}`)
    const now = Date.now()
    if (now - lastRedraw >= DENIED_REDRAW_MS) {
      lastRedraw = now
      $.ui.invalidate('ui.render')
    }
  }
}

async function openPane($: EngineInterface, theme: string): Promise<{ ok: boolean; text: string }> {
  state.open = true
  await $.ui.open({ id: PANE, title: TITLE, focus: true })
  $.ui.invalidate('ui.render')
  if (state.port === null) {
    state.starting ??= startBridge($, theme).finally(() => {
      state.starting = null
    })
    if (!(await state.starting)) return { ok: false, text: (await read($, notice))?.text ?? 'bridge 시작 실패' }
  }
  if (state.region) await post($, '/open', state.region)
  else state.pendingOpen = true
  return { ok: true, text: 'gnam pane 을 열었습니다 (클릭 후 j/k · Enter · 1-5)' }
}

async function closePane($: EngineInterface): Promise<void> {
  state.open = false
  state.pendingOpen = false
  state.region = null
  state.frame = null
  state.mounted = null
  await post($, '/hide')
}

export const register: Register = (on, options) => {
  const theme = themeOf(options as Record<string, unknown>)
  const direction = directionOf(options as Record<string, unknown>)

  on('session.start', async ($, e, next) => {
    const r = await next(e)
    await $.command.register({ name: COMMAND, description: 'gnam 진행 화면 (pixel 그림 pane) 열기 · 닫기 · setup (런타임 설치)', argumentHint: '[close|setup]', immediate: true }).catch(err =>
      $.ui.log(`gnam-view-pixel: /${COMMAND} 등록 실패: ${err}`),
    )
    return r
  })

  on('command.run', { command: COMMAND }, async ($, e) => {
    const arg = e.args.trim()
    if (arg === 'setup') {
      // pixel 런타임 (Electron, 약 300MB) 내려받기 + 앱 빌드. 처음 한 번
      const app = `${$.plugin.root}/app`
      try {
        const r = await $.process.run(['npm', 'run', 'setup'], { cwd: app, timeoutMs: 600_000 })
        if (r.exitCode !== 0) return { text: `setup 실패 (exit ${r.exitCode}): ${(r.stderr || r.stdout).trim().split('\n').slice(-3).join(' · ')}` }
      } catch (error) {
        return { text: `setup 실패: ${String(error)} — 셸에서 (cd ${app} && npm run setup)` }
      }
      await update($, notice, () => null)
      return { text: 'setup 끝: /gnam-pixel 로 열기' }
    }
    if (arg === 'close' || (!arg && state.open && !(await read($, notice)))) {
      await $.ui.close({ id: PANE })
      await closePane($)
      return { text: 'gnam pane 을 닫았습니다' }
    }
    const surfaces = await $.session.surfaces().catch(() => [] as readonly string[])
    if (surfaces.length > 0 && !surfaces.includes('terminal')) {
      state.open = true
      await $.ui.open({ id: PANE, title: TITLE })
      return { text: `gnam-pixel 은 터미널에서만 그립니다 — ${FALLBACK}` }
    }
    const herdr = await herdrContext($)
    if (herdr) return { text: (await openSplit($, herdr, { cwd: await $.session.cwd(), theme, direction })).text }
    const opened = await openPane($, theme)
    return { text: opened.text }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const shown = await read($, notice)
    if (e.surface !== 'terminal') {
      const { Box, Text } = $.ui.resolve(e)
      return (
        <Box flexDirection="column">
          <Text>gnam-pixel 은 터미널 Claude Code 에서 kitty graphics 로 그립니다.</Text>
          <Text dimColor>{FALLBACK}</Text>
        </Box>
      )
    }
    const { Box, Client, Image, Text } = $.ui.resolve(e)
    const rows = e.props.scroll.bodyRows > 0 ? e.props.scroll.bodyRows : Math.max(8, (e.viewport?.rows ?? 30) - 8)
    const cols = Math.max(1, e.props.bodyColumns > 0 ? e.props.bodyColumns : (e.viewport?.columns ?? 80))
    if (shown) {
      state.mounted = null
      return (
        <Box flexDirection="column" width={cols}>
          <Text color="red">{`gnam-pixel 을 그릴 수 없음: ${shown.text}`}</Text>
          <Text dimColor>{FALLBACK}</Text>
        </Box>
      )
    }
    const f = state.frame
    const grid = f ? imageGrid(f, cols, rows) : null
    state.mounted = grid
    return (
      <Box flexDirection="column" width={cols} height={rows}>
        {f && grid ? (
          <Image key={IMAGE_KEY} source={imageSource(f)} columns={grid.cols} rows={grid.rows} alt={NO_GRAPHICS} />
        ) : (
          <Text dimColor>{state.port === null ? 'bridge 시작 중…' : 'gnam 화면 그리는 중…'}</Text>
        )}
        <Box position="absolute" top={0} left={0} width={cols} height={rows}>
          <Client key="input" module="./surface.tsx" width={cols} height={rows} />
        </Box>
      </Box>
    )
  })

  on('ui.message', async ($, e, next) => {
    if (e.requestId !== PANE || state.port === null) return next(e)
    if (isSizeMessage(e.data)) {
      state.region = { cols: e.data.cols, rows: e.data.rows }
      if (state.pendingOpen) {
        state.pendingOpen = false
        await post($, '/open', state.region)
      } else await post($, '/size', state.region)
    } else if (isInputMessage(e.data)) {
      await post($, '/input', { events: e.data.events })
    }
    return next(e)
  })

  on('ui.scroll', { requestId: PANE }, async ($, e) => {
    if (state.port === null || !state.open || e.by === 0) return {}
    const kind = e.by < 0 ? 'scrollup' : 'scrolldown'
    const ticks = Math.min(Math.round(Math.abs(e.by)) || 1, 10)
    const x = e.pointer?.column ?? Math.floor((state.region?.cols ?? 0) / 2)
    const y = e.pointer?.row ?? Math.floor((state.region?.rows ?? 0) / 2)
    await post($, '/input', { events: Array.from({ length: ticks }, () => ({ type: 'mouse', kind, x, y })) })
    return {}
  })

  // 턴이 끝나면 앱에 알림: 앱은 HEAD · gnam.json · specs/ 가 바뀌었을 때만 다시 읽는다
  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    if (state.port !== null && state.open) await post($, '/refresh')
    return r
  })

  on('ui.close', { id: PANE }, async ($, e, next) => {
    const r = await next(e)
    await closePane($)
    await update($, notice, () => null)
    return r
  })

  on('session.end', async ($, e, next) => {
    const r = await next(e)
    await post($, '/close')
    state.port = null
    return r
  })
}
