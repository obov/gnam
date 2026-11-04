import { expect, mock, test } from 'claude-code/testing'

// herdr 안 (HERDR_ENV=1): /gnam-pixel 은 bridge 대신 herdr 분할 pane 에서 pixel 앱을 직접 실행한다
const HERDR = { HERDR_ENV: '1', HERDR_PANE_ID: 'w1:p1', HERDR_BIN_PATH: '/bin/herdr' }
const CHECK = JSON.stringify({ pixel: '/plug/app/node_modules/.bin/pixel', entry: '/plug/app/dist/main.cjs' })

type Herdr = { panes: Set<string>; next: number; fail?: string }

function engine(on: any, env: Record<string, string>, herdr: Herdr = { panes: new Set(), next: 2 }) {
  const runs: string[][] = []
  mock.clock(on)
  mock.env(on, env)
  on('command.register', () => ({ value: { command: 'gnam-pixel' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.close', () => ({ value: undefined }))
  on('session.start', (_: unknown, e: any) => ({ cwd: e.cwd }))
  on('session.end', () => ({}))
  on('session.cwd', () => ({ value: '/repo' }))
  on('session.surfaces', () => ({ value: ['terminal'] }))
  on('http.fetch', () => ({ value: { status: 500, ok: false, headers: {}, text: '' } }))
  on('process.run', (_: unknown, e: any) => {
    const argv: string[] = [...e.argv]
    runs.push(argv)
    const out = (stdout: string, exitCode = 0) => ({ value: { exitCode, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } })
    if (argv[0] === 'node' && argv[2] === 'check') return out(CHECK + '\n')
    if (argv[0] === 'node' && argv[2] === 'launch') return out(JSON.stringify({ port: 4321, token: 'tok', pid: 9, tty: '/dev/ttys001' }) + '\n')
    if (argv[0] !== '/bin/herdr') return out('', 1)
    const [, noun, verb, target] = argv
    if (herdr.fail && `${noun} ${verb}` === herdr.fail) return out(JSON.stringify({ error: { code: 'x', message: `${verb} 거절` } }), 1)
    if (noun === 'pane' && verb === 'split') {
      const id = `w1:p${herdr.next++}`
      herdr.panes.add(id)
      return out(JSON.stringify({ result: { pane: { pane_id: id, tab_id: 'w1:t1' }, type: 'pane_info' } }))
    }
    if (noun === 'pane' && verb === 'get')
      return herdr.panes.has(target!) ? out(JSON.stringify({ result: { pane: { pane_id: target, tab_id: 'w1:t1' } } })) : out(JSON.stringify({ error: { code: 'pane_not_found', message: 'not found' } }), 1)
    if (noun === 'pane' && verb === 'close') {
      herdr.panes.delete(target!)
      return out(JSON.stringify({ result: {} }))
    }
    return out(JSON.stringify({ result: {} }))
  })
  return { runs, herdr: (verb: string) => runs.filter(r => r[0] === '/bin/herdr' && `${r[1]} ${r[2]}` === verb) }
}

test('herdr 안: /gnam-pixel 이 herdr pane split · pane run (pixel main.cjs) 을 부르고 bridge launch 는 부르지 않는다', async ($, on) => {
  const { runs, herdr } = engine(on, HERDR)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  const r = await $.command.run({ command: 'gnam-pixel', args: '' } as any)
  expect(r.text).toContain('herdr pane 에 열었습니다')
  expect(r.text).toContain('/gnam-pixel close')

  const split = herdr('pane split')
  expect(split).toHaveLength(1)
  expect(split[0]!.slice(1)).toEqual([
    'pane', 'split', '--pane', 'w1:p1', '--direction', 'right', '--cwd', '/repo',
    '--env', 'GNAM_VIEW_CWD=/repo', '--env', 'GNAM_VIEW_THEME=auto', '--no-focus',
  ])
  const run = herdr('pane run')
  expect(run).toHaveLength(1)
  expect(run[0]![3]).toBe('w1:p2')
  expect(run[0]![4]).toBe(`'/plug/app/node_modules/.bin/pixel' '/plug/app/dist/main.cjs' && exit`)
  expect(runs.some(a => a.includes('launch'))).toBe(false)
})

test('herdr 안: 분할 방향 설정 down', { options: { split: 'down', theme: 'dark' } }, async ($, on) => {
  const { herdr } = engine(on, HERDR)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  const r = await $.command.run({ command: 'gnam-pixel', args: '' } as any)
  expect(r.text).toContain('아래')
  const split = herdr('pane split')[0]!
  expect(split[split.indexOf('--direction') + 1]).toBe('down')
  expect(split).toContain('GNAM_VIEW_THEME=dark')
})

test('herdr pane split 실패: 이유 1줄, pane run 없음', async ($, on) => {
  const { herdr } = engine(on, HERDR, { panes: new Set(), next: 2, fail: 'pane split' })
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  const r = await $.command.run({ command: 'gnam-pixel', args: '' } as any)
  expect(r.text).toContain('split 거절')
  expect(herdr('pane run')).toHaveLength(0)
})

test('herdr pane run 실패: 만든 pane 을 닫는다', async ($, on) => {
  const { herdr } = engine(on, HERDR, { panes: new Set(), next: 2, fail: 'pane run' })
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  const r = await $.command.run({ command: 'gnam-pixel', args: '' } as any)
  expect(r.text).toContain('앱을 실행할 수 없음')
  expect(herdr('pane close').map(a => a[3])).toEqual(['w1:p2'])
})

for (const [name, env] of [['HERDR_ENV 없음', {}], ['HERDR_PANE_ID 없음', { HERDR_ENV: '1' }]] as const) {
  test(`비 herdr (${name}): 기존 bridge 경로, herdr 호출 없음`, async ($, on) => {
    const { runs } = engine(on, env)
    await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
    await $.command.run({ command: 'gnam-pixel', args: '' } as any)
    expect(runs.some(a => a[0] === 'node' && a[2] === 'launch')).toBe(true)
    expect(runs.some(a => a[0] === '/bin/herdr' || a[0] === 'herdr')).toBe(false)
  })
}
