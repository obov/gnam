import { expect, test } from 'claude-code/testing'

const PANE = {
  plugin: 'gnam-view',
  component: 'Pane',
  requestId: 'gnam-view',
  props: { title: 'gnam', isFocused: false, bodyColumns: 80, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
} as const

const plan = (sha: string, status: string, done: number, total: number) => ({
  sha, subject: `spec.x.plan: plan ${sha}`, status,
  steps: Array.from({ length: total }, (_, i) => ({ n: i + 1, title: `단계 ${i + 1}`, impls: i < done ? ['i'] : [] })),
})

const TREE = {
  gnam: { version: '0.4.0', source: 'package', format: 1 },
  project: '/repo',
  config: { raw: { format: 1, plugins: ['@gnam/lore'] } },
  plugins: { lore: { version: '0.1.0', kind: 'builtin', commands: [], skills: ['gnam-lore'], sections: { entries: [{ file: 'a.md', summary: '노하우 A' }] } } },
  builtins: [{ id: 'lore', active: true }, { id: 'run', active: false }],
  kinds: [{ label: 'chore: …', subject: '^chore: \\S', owner: 'core' }, { label: 'spec.<topic>.impl: …', subject: '^spec\\.([A-Za-z0-9_-]+)\\.impl: \\S', owner: 'core' }],
  install: { hooks: { hooksPath: '.githooks', expected: '.githooks', commitMsg: true }, skills: [], agentsMd: { exists: true, inSync: true }, claudeMd: { exists: true, importsAgents: true } },
  problems: [],
  handoff: { exists: false },
  env: { branch: 'main' },
  trace: {
    requests: [],
    items: [{ kind: 'remaining', text: '실측 남음', sha: 'abcdef1234' }, { kind: 'risk', text: '토큰 만료', sha: '1234567aaa' }],
    decisions: { blocking: [], open: [{ path: 'specs/api.md', line: 3, text: '보존 기간' }] },
    topics: {
      api: { path: 'specs/api.md', unimplemented: [], open: [{ line: 3, text: '보존 기간' }], plans: [plan('aaaaaaa1', 'superseded', 0, 2), { ...plan('bbbbbbb2', 'partial', 1, 3), summary: '앱이 목록을 한 번에 받는다' }], chores: [] },
      done: { path: 'specs/done.md', unimplemented: [], open: [], plans: [plan('ccccccc3', 'done', 2, 2)], chores: [] },
      '': { path: 'specs/.md', unimplemented: [], open: [], plans: [], chores: [{}] },
    },
  },
}
const LOG = 'ddddddd\x1fspec.api.impl: 단계 1\x1f2 hours ago\neeeeeee\x1fchore: 의존성\x1f3 hours ago\n'

const VIEWS = [{ id: 'remain', title: '남은 일', source: 'trace.items', where: { kind: 'remaining' }, view: 'list', fields: { title: 'text', meta: 'sha' }, icon: null, owner: 'project' }]
const written: string[] = []

async function boot($: any, on: any) {
  on('store.get', () => ({ value: undefined }))
  on('store.set', () => ({ value: undefined }))
  on('fs.write', (_: unknown, e: any) => {
    written.push(e.text)
    return { value: undefined }
  })
  on('ui.toast', () => ({ value: undefined }))
  on('command.register', () => ({ value: { command: 'gnam-view' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_: unknown, e: any) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: '/repo' }))
  on('clock.now', () => ({ value: 1000 }))
  on('fs.exists', (_: unknown, e: any) => ({ value: ['/repo/node_modules/.bin/gnam', '/repo/specs/api.md', '/repo/README.md'].includes(e.path) }))
  on('fs.read', (_: unknown, e: any) => ({ value: e.path === '/repo/gnam.json' ? '{ "format": 1, "plugins": [] }' : e.path === '/repo/README.md' ? '# repo — 예시 저장소\n\n할 일을 기록한다.\n' : '# api — 외부 API 설계\n\n앱이 쓰는 API 를 정한다.\n\n## 절\n' }))
  on('process.run', (_: unknown, e: any) => {
    const a = e.argv as string[]
    if (a[0] !== 'git' && a[2] === 'views') return { value: { exitCode: 0, stdout: JSON.stringify(VIEWS), stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
    if (a[0] !== 'git' && a[2] === 'trace.items') return { value: { exitCode: 0, stdout: JSON.stringify(TREE.trace.items), stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
    const stdout = a[0] === 'git' ? (a[1] === 'show' ? 'bbbbbbb2\x1fspec.api.plan: x\n\nGoal:\n앱이 목록을 한 번에\n받는다.\n\nPlan:\n1. a\n\x1e' : LOG) : a.includes('--json') ? JSON.stringify(TREE) : 'gnam 0.4.0 · plugins lore\nplan       api bbbbbbb 1/3\n'
    return { value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await $.command.run({ command: 'gnam-view', args: '' })
}

test('spec 진행 · 필터 · 펼치기 · 커밋 topic 필터', async ($, on) => {
  await boot($, on)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })

  expect(await ui.find({ type: 'Text', text: /^spec 2개 · 진행 중 1 · 시작 전 0 · 다음 계획 필요 0 · 끝남 1$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^예시 저장소 · 할 일을 기록한다\. +\(README\.md\)$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^  외부 API 설계$/ })).toBeDefined()
  expect((await ui.find({ key: 'topic:api' }))?.text).toBe('▸ api')
  expect(await ui.find({ type: 'Text', text: /^   미결 1$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^\uf110 진행 중$/ })).toBeDefined()
  expect(await ui.find({ key: 'topic:done' })).toBeUndefined()

  await ui.select({ key: 'filter', value: 'done' })
  expect((await ui.find({ key: 'topic:done' }))?.text).toBe('▸ done')
  expect(await ui.find({ type: 'Text', text: /2\/2/ })).toBeDefined()

  await ui.select({ key: 'filter', value: 'active' })
  await ui.press({ key: 'topic:api' })
  expect(await ui.find({ type: 'Text', text: /이전 plan 1개 대체됨/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^\uf10c 단계 2$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^앱이 목록을 한 번에 받는다$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^최근 계획$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^목표$/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /^앱이 쓰는 API 를 정한다\.$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^2 hours · impl: 단계 1$/ })).toBeDefined()

  await ui.press({ key: 'stat:decide:go' })
  expect(await ui.find({ type: 'Text', text: /미결 +specs\/api\.md:3 보존 기간$/ })).toBeDefined()

  await ui.press({ key: 'tab:commits' })
  await ui.select({ key: 'ctopic', value: 'api' })
  expect(await ui.find({ type: 'Text', text: /chore: 의존성/ })).toBeUndefined()

  await ui.press({ key: 'tab:plugin:lore' })
  expect(await ui.find({ type: 'Text', text: /노하우 A · file=a\.md/ })).toBeDefined()
  await ui.unmount()

  for (const surface of ['desktop', 'vscode', 'mobile'] as const) {
    const other = await $.ui.mount({ ...PANE, surface })
    expect(await other.find({ key: 'tab:spec' })).toBeDefined()
    await other.unmount()
  }
})

test('plain 아이콘', { options: { icons: 'plain' } }, async ($, on) => {
  await boot($, on)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await ui.find({ key: 'topic:api' }))?.text).toBe('▸ api')
  expect(await ui.find({ type: 'Text', text: /^   미결 1$/ })).toBeDefined()
  await ui.unmount()
})

test('status 실패 시 gnam.json 원문', async ($, on) => {
  on('command.register', () => ({ value: { command: 'gnam-view' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_: unknown, e: any) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: '/repo' }))
  on('clock.now', () => ({ value: 1000 }))
  on('fs.exists', () => ({ value: true }))
  on('fs.read', () => ({ value: '{ "format": 1, "plugins": [] }' }))
  on('process.run', () => ({ value: { exitCode: 0, stdout: 'help', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await $.command.run({ command: 'gnam-view', args: '' } as any)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /status --json 실패/ })).toBeDefined()
  await ui.unmount()
})

test('설정: 탭 숨기기 · 순서 · 프로젝트 탭 · 새 탭 저장 (gnam.json)', async ($, on) => {
  await boot($, on)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await ui.find({ key: 'tab:view:remain' }))?.text).toContain('남은 일')
  await ui.press({ key: 'tab:view:remain' })
  expect(await ui.find({ type: 'Text', text: /^실측 남음  abcdef1234$/ })).toBeDefined()

  await ui.press({ key: 'tab:setup' })
  await ui.press({ key: 'hide:items' })
  expect(await ui.find({ key: 'tab:items' })).toBeUndefined()
  await ui.press({ key: 'down:spec' })
  const order = (await ui.findAll({ type: 'Button' })).map((b: any) => b.key).filter((k: string) => k?.startsWith('tab:'))
  expect(order.slice(0, 2)).toEqual(['tab:decide', 'tab:spec'])

  await ui.press({ key: 'pref:icons:plain' })
  expect((await ui.find({ key: 'tab:spec' }))?.text).toBe(' Spec ')

  await ui.press({ key: 'draft:open' })
  expect(await ui.find({ key: 'draft:save' })).toBeUndefined()
  await ui.press({ key: 'draft:src:trace.items' })
  await ui.press({ key: 'draft:where:kind:risk' })
  expect(await ui.find({ type: 'Text', text: /^토큰 만료  1234567aaa$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^실측 남음/ })).toBeUndefined()
  await ui.press({ key: 'draft:save' })
  const saved = JSON.parse(written.at(-1) ?? '{}')
  expect(saved.view.tabs).toEqual([{ id: 'items-risk', title: '항목 · risk', source: 'trace.items', view: 'list', where: { kind: 'risk' }, fields: { title: 'text', meta: 'sha' } }])
  await ui.unmount()
})

test('/clear 후 열린 pane 다시 읽기', async ($, on) => {
  let loads = 0
  let onLoad: () => void = () => {}
  const nextLoad = () => new Promise<void>(r => { onLoad = r })
  on('classic.SessionStart', () => ({}))
  on('command.register', () => ({ value: { command: 'gnam-view' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_: unknown, e: any) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: '/repo' }))
  on('clock.now', () => ({ value: 1000 }))
  on('fs.exists', () => ({ value: false }))
  on('process.run', () => ({ value: { exitCode: 1, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
  on('state.set', { plugin: 'gnam-view', key: 'view' } as any, async (_: unknown, e: any, next: any) => {
    const r = await next(e)
    const v = e.value?.value ?? e.value
    if (v?.loadedAt > 0 && v?.isLoading === false) (loads += 1, onLoad())
    return r
  })
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await $.classic.SessionStart({ source: 'clear' } as any)
  expect(loads).toBe(0)
  const opened = nextLoad()
  await $.command.run({ command: 'gnam-view', args: '' } as any)
  await opened
  const again = nextLoad()
  await $.classic.SessionStart({ source: 'clear' } as any)
  await again
  expect(loads).toBe(2)
})
