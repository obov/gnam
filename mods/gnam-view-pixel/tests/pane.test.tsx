import { expect, mock, test } from 'claude-code/testing'

const PANE = {
  plugin: 'gnam-view-pixel',
  component: 'Pane',
  requestId: 'gnam-pixel',
  props: { title: 'gnam', isFocused: true, bodyColumns: 80, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} },
} as const

const FRAME = { shm: '/px-1-0-3', format: 'rgba', width: 1280, height: 1020, generation: 3, cols: 80, rows: 30 }
const STATE = { version: 4, frame: FRAME, joined: true, alive: true, title: '', error: null }

type Calls = { run: string[][]; http: { url: string; body: unknown }[]; blits: unknown[] }

function engine($: any, on: any, launch: { stdout: string; exitCode: number }, surfaces: string[] = ['terminal']): Calls {
  const calls: Calls = { run: [], http: [], blits: [] }
  const clock = mock.clock(on)
  mock.env(on, {})
  let polls = 0
  on('command.register', () => ({ value: { command: 'gnam-pixel' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.close', () => ({ value: undefined }))
  on('session.start', (_: unknown, e: any) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: '/repo' }))
  on('session.surfaces', () => ({ value: surfaces }))
  on('turn.complete', () => ({ text: '' }))
  on('process.run', (_: unknown, e: any) => {
    calls.run.push([...e.argv])
    return { value: { exitCode: launch.exitCode, stdout: launch.stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('http.fetch', async (_: unknown, e: any) => {
    const path = new URL(e.url).pathname
    calls.http.push({ url: e.url, body: e.init?.body ? JSON.parse(e.init.body) : null })
    expect(e.init?.headers?.authorization).toBe('Bearer tok')
    // long-poll: 첫 응답 뒤로는 테스트가 시계를 움직일 때까지 기다린다
    if (path === '/state' && polls++ > 0) await clock.sleep(60_000)
    return { value: { status: 200, ok: true, headers: {}, text: JSON.stringify(path === '/state' ? STATE : {}) } }
  })
  on('ui.blit', (_: unknown, e: any) => {
    calls.blits.push(e)
    return { value: {} }
  })
  void $
  return calls
}

const OK = { stdout: JSON.stringify({ port: 4321, token: 'tok', pid: 9, tty: '/dev/ttys001' }) + '\n', exitCode: 0 }

test('/gnam-pixel: bridge launch → frame state 로 Image, Client 로 크기 · 키, 턴 끝에 refresh', async ($, on) => {
  const calls = engine($, on, OK)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  const r = await $.command.run({ command: 'gnam-pixel', args: '' } as any)
  expect(r.text).toContain('열었습니다')

  const launch = calls.run[0]!
  expect(launch[0]).toBe('node')
  expect(launch[1]).toMatch(/app\/dist\/bridge\.cjs$/)
  expect(launch.slice(2)).toEqual(['launch', '--cwd', '/repo', '--theme', 'auto'])

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const image = await ui.find({ type: 'Image', key: 'view' })
  expect(image).toBeDefined()
  expect(image!.props).toMatchObject({ columns: 80, rows: 30, source: { shm: '/px-1-0-3', format: 'rgba', width: 1280, height: 1020, generation: 3 } })
  expect(await ui.find({ type: 'Client', key: 'input' })).toBeDefined()

  // Client 가 크기를 알리면 앱을 그 크기로 연다
  await ui.resize({ columns: 80, rows: 30 })
  expect(calls.http.find(c => c.url.endsWith('/open'))?.body).toEqual({ cols: 80, rows: 30 })

  // 키 · 클릭은 모아서 /input
  await ui.key({ key: 'j' })
  await ui.key({ key: 'return' })
  await ui.pointer({ type: 'down', x: 4, y: 7, button: 'left' })
  await ui.advance(40)
  const events = calls.http.filter(c => c.url.endsWith('/input')).flatMap(c => (c.body as { events: unknown[] }).events)
  expect(events).toContainEqual(expect.objectContaining({ type: 'key', key: 'j', text: 'j' }))
  expect(events).toContainEqual(expect.objectContaining({ type: 'key', key: 'enter' }))
  expect(events).toContainEqual(expect.objectContaining({ type: 'mouse', kind: 'down', button: 'left', x: 4, y: 7 }))

  // 턴이 끝나면 앱에 refresh (앱이 바뀐 것만 다시 읽음)
  await $.turn.complete({ answer: 'ok', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' } as any)
  expect(calls.http.some(c => c.url.endsWith('/refresh'))).toBe(true)
  await ui.unmount()
})

test('bridge launch 실패: pane 에 이유 1줄 + /gnam-view 안내', async ($, on) => {
  const calls = engine($, on, { stdout: JSON.stringify({ error: 'pixel 런타임 없음: (cd app && npm run setup)', code: 'install' }) + '\n', exitCode: 2 })
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  const r = await $.command.run({ command: 'gnam-pixel', args: '' } as any)
  expect(r.text).toContain('pixel 런타임 없음')
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /그릴 수 없음: pixel 런타임 없음/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /\/gnam-view/ })).toBeDefined()
  expect(await ui.find({ type: 'Image' })).toBeUndefined()
  await ui.unmount()

  // /gnam-pixel setup 은 앱 폴더에서 npm run setup
  const s = await $.command.run({ command: 'gnam-pixel', args: 'setup' } as any)
  expect(s.text).toContain('setup 실패')
  expect(calls.run.at(-1)).toEqual(['npm', 'run', 'setup'])
})

test('터미널이 아닌 surface: 안내 Text', async ($, on) => {
  engine($, on, OK)
  for (const surface of ['desktop', 'vscode', 'mobile'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ type: 'Text', text: /\/gnam-view/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /kitty graphics/ })).toBeDefined()
    await ui.unmount()
  }
})

test('desktop 세션의 /gnam-pixel 은 bridge 를 띄우지 않는다', async ($, on) => {
  const calls = engine($, on, OK, ['desktop'])
  await $.session.start({ cwd: '/repo', surface: 'desktop', isInteractive: true })
  const r = await $.command.run({ command: 'gnam-pixel', args: '' } as any)
  expect(r.text).toContain('/gnam-view')
  expect(calls.run).toHaveLength(0)
})
