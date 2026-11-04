// bridge 가 앱을 PIXEL_EMBED 로 띄워 join · frame 을 받는지 (실제 pixel 런타임 · Electron 사용).
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { test } from 'node:test'

import type { BridgeState } from '../src/protocol.ts'

// dist/tests/bridge.spec.cjs → dist/bridge.cjs, 저장소 루트 (gnam 저장소 자체를 읽게 한다)
const BRIDGE = path.resolve(__dirname, '..', 'bridge.cjs')
const REPO = path.resolve(__dirname, '..', '..', '..', '..', '..')

test('bridge: launch → open → join · frame (width > 0) → refresh · input → close', { timeout: 90_000 }, async () => {
  const out = execFileSync(process.execPath, [BRIDGE, 'launch', '--cwd', REPO, '--tty', '/dev/null'], { encoding: 'utf8' })
  const report = JSON.parse(out) as { port?: number; token?: string; error?: string }
  assert.ok(report.port, `launch 실패: ${out}`)
  const headers = { authorization: `Bearer ${report.token}`, 'content-type': 'application/json' }
  const url = (p: string) => `http://127.0.0.1:${report.port}${p}`
  const post = (p: string, body: unknown = {}) => fetch(url(p), { method: 'POST', headers, body: JSON.stringify(body) })
  try {
    assert.equal((await fetch(url('/state'))).status, 401, 'token 없으면 거절')
    const opened = (await (await post('/open', { cols: 80, rows: 24 })).json()) as BridgeState
    assert.equal(opened.alive, true)

    let state: BridgeState = opened
    let joinedSeen = false
    const deadline = Date.now() + 60_000
    while (Date.now() < deadline) {
      state = (await (await fetch(url(`/state?version=${state.version}`), { headers })).json()) as BridgeState
      joinedSeen ||= state.joined
      if (state.frame && state.frame.width > 0) break
      if (!state.alive) break
    }
    assert.equal(state.error, null, `앱 오류: ${state.error}`)
    assert.ok(joinedSeen, 'join 메시지')
    assert.ok(state.frame && state.frame.width > 0 && state.frame.height > 0, `frame: ${JSON.stringify(state)}`)
    assert.equal(state.frame.cols, 80)
    assert.equal(state.frame.rows, 24)
    assert.match(state.frame.shm, /^\//)

    // 크기 바꾸면 새 frame 이 그 크기로 온다
    await post('/size', { cols: 60, rows: 20 })
    const before = state.frame.generation
    const until = Date.now() + 20_000
    while (Date.now() < until) {
      state = (await (await fetch(url(`/state?version=${state.version}`), { headers })).json()) as BridgeState
      if (state.frame && state.frame.cols === 60 && state.frame.rows === 20) break
    }
    assert.equal(state.frame?.cols, 60)
    assert.ok(state.frame!.generation !== before || state.frame!.shm !== '')

    assert.equal((await post('/input', { events: [{ type: 'key', key: 'j', text: 'j' }, { type: 'mouse', kind: 'down', button: 'left', x: 3, y: 4 }] })).status, 200)
    assert.equal((await post('/refresh')).status, 200)
  } finally {
    await post('/close').catch(() => {})
  }
})
