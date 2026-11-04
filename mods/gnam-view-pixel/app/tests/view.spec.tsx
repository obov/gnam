import assert from 'node:assert/strict'
import { test } from 'node:test'

import { act, create, type ReactTestRenderer, type ReactTestRendererJSON } from 'react-test-renderer'

import { Controller } from '../src/store.ts'
import { App, clampText } from '../src/view.tsx'
import { NOW_MS, fakeRepo, variant } from './fixture.ts'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

type Node = ReactTestRendererJSON

function nodes(tree: ReactTestRenderer): Node[] {
  const out: Node[] = []
  const walk = (n: Node | string | null) => {
    if (!n || typeof n === 'string') return
    out.push(n)
    for (const c of n.children ?? []) walk(c as Node | string)
  }
  const json = tree.toJSON()
  for (const n of Array.isArray(json) ? json : [json]) walk(n)
  return out
}

const textOf = (n: Node): string => (n.children ?? []).map(c => (typeof c === 'string' ? c : textOf(c as Node))).join('')
const texts = (tree: ReactTestRenderer) => nodes(tree).filter(n => n.type === 'text').map(textOf)
const byId = (tree: ReactTestRenderer, id: string) => nodes(tree).find(n => n.props.id === id)
const ids = (n: Node | undefined, prefix: string): string[] => {
  if (!n) return []
  const out: string[] = []
  const walk = (x: Node) => {
    if (typeof x.props.id === 'string' && x.props.id.startsWith(prefix)) out.push(x.props.id)
    for (const c of x.children ?? []) if (typeof c !== 'string') walk(c as Node)
  }
  walk(n)
  return out
}

async function mount(status?: unknown) {
  const { repo, loader } = fakeRepo()
  if (status) repo.status = status
  const c = new Controller(loader, null, () => NOW_MS)
  let tree!: ReactTestRenderer
  await act(async () => {
    tree = create(<App controller={c} now={() => NOW_MS} />)
  })
  await act(() => c.refresh())
  const key = async (k: string, mods = {}) => {
    await act(async () => {
      c.key({ key: k, mods })
    })
  }
  return { c, tree, repo, key }
}

test('첫 화면: 목적 → 진행 → 지금 → 다음 → 구현된 기능, 구현된 기능 행 = done topic 수', async () => {
  const { tree, c } = await mount()
  const t = texts(tree)
  const order = ['목적', '진행', '지금', '다음', '구현된 기능'].map(h => t.indexOf(h))
  assert.ok(order.every(i => i >= 0), `섹션 제목 ${JSON.stringify(order)}`)
  assert.deepEqual([...order].sort((a, b) => a - b), order)
  assert.ok(t.includes('할 일을 기록하는 저장소'))
  assert.ok(t.includes('spec 6개 · 진행 중 1 · 다음 계획 필요 1 · 시작 전 1 · plan 없음 1 · 끝남 2 · 지금 · 다음 단계 1/5'))
  // 진행 막대 칸: 진행 중 · 다음 계획 필요 · 시작 전 · plan 없음 · 끝남
  assert.deepEqual(ids(byId(tree, 'section:progress-bar'), 'progress-seg:'), ['progress-seg:now', 'progress-seg:needs-plan', 'progress-seg:next', 'progress-seg:none', 'progress-seg:done'])
  // 행 신호: 미구현 칩 · 다음 계획 필요 칩 (지금 묶음), 막힘 칩
  assert.deepEqual(ids(byId(tree, 'section:now'), 'topic:'), ['topic:api', 'topic:export'])
  const exp = texts({ toJSON: () => byId(tree, 'topic:export')! } as ReactTestRenderer)
  assert.ok(exp.includes('미구현 1'))
  assert.ok(exp.includes('다음 계획 필요'))
  const apiRow = texts({ toJSON: () => byId(tree, 'topic:api')! } as ReactTestRenderer)
  assert.ok(apiRow.includes('막힘 1') && apiRow.includes('미결 1'))
  assert.ok(!apiRow.includes('다음 계획 필요'))
  // plan 없는 topic 은 '시작 전' 이 아니라 'plan 없음'
  const docs = texts({ toJSON: () => byId(tree, 'topic:docs')! } as ReactTestRenderer)
  assert.ok(docs.includes('plan 없음'))
  assert.ok(!docs.includes('시작 전'))
  assert.equal(byId(tree, 'topic:README'), undefined)
  const done = ids(byId(tree, 'section:done'), 'topic:')
  assert.equal(done.length, c.getState().model!.done.length)
  assert.deepEqual(done, ['topic:sync', 'topic:lore'])
  // 행 = 이름 + 사람용 한 줄 + 진행
  assert.ok(t.includes('앱이 목록을 한 번에 받는다'))
  assert.ok(t.includes('1/3'))
  // 꺼진 plugin 기능 표시
  assert.ok(texts({ toJSON: () => byId(tree, 'topic:lore')! } as ReactTestRenderer).includes('plugin 꺼짐'))
  assert.ok(!texts({ toJSON: () => byId(tree, 'topic:sync')! } as ReactTestRenderer).includes('plugin 꺼짐'))
  // 헤더 plugin 목록 1줄
  assert.equal(textOf(byId(tree, 'plugins-line')!), 'plugin run')
  // 하단 키 안내 1줄
  assert.match(textOf(byId(tree, 'keys')!), /j\/k/)
})

test('경고 묶음: 결정 · 요청 · 설정 문제 · 인계 메모, 누르면 해당 탭, 모두 0 이면 흐린 한 줄', async () => {
  const { tree, c } = await mount(
    variant(s => {
      s.problems = [{ source: 'install', message: 'core.hooksPath = /x, 기대 .githooks' }]
      s.handoff.exists = true
    }),
  )
  const sig = () => texts({ toJSON: () => byId(tree, 'section:signals')! } as ReactTestRenderer)
  // 진행 줄 아래
  const t = texts(tree)
  assert.ok(t.indexOf('결정할 것 2') > t.findIndex(x => x.startsWith('spec 6개')))
  assert.ok(sig().includes('결정할 것 2'))
  assert.ok(sig().includes('막힘 1 · 미결 1'))
  assert.ok(sig().includes('처리 중인 요청 1'))
  assert.ok(sig().includes('설정 문제 1'))
  assert.ok(sig().includes('core.hooksPath = /x, 기대 .githooks'), '문제 텍스트')
  assert.ok(sig().includes('인계 메모 있음'))
  assert.equal(byId(tree, 'signal:ok'), undefined)
  await act(async () => byId(tree, 'signal:decide')!.props.onClick())
  assert.equal(c.getState().tab, 'decisions')

  // 모두 0 이면 한 줄
  const quiet = await mount(
    variant(s => {
      s.trace.decisions = { blocking: [], open: [] }
      s.trace.requests = []
    }),
  )
  const q = texts({ toJSON: () => byId(quiet.tree, 'section:signals')! } as ReactTestRenderer)
  assert.deepEqual(q, ['사람이 할 일 없음 · 설정 정상'])
})

test('j · enter 로 세 번째 topic 펼침 (문제 → 해결 → 이력 → 세부), 다시 enter 로 접힘', async () => {
  const { tree, c, key } = await mount()
  await key('j')
  await key('j')
  await key('enter')
  assert.equal(c.getState().expanded, 'web')
  const labels = () => nodes(tree).filter(n => n.props.id === 'field-label').map(textOf)
  assert.deepEqual(labels(), ['문제', '해결', '이력', '세부'])
  const web = texts({ toJSON: () => byId(tree, 'topic:web')! } as ReactTestRenderer)
  assert.ok(web.includes('—'), '문제 없음은 비움')
  assert.ok(web.includes('웹 화면'))
  assert.ok(web.includes('웹 첫 화면'))
  await key('enter')
  assert.equal(c.getState().expanded, null)
  assert.deepEqual(labels(), [])

  // ↑ 로 첫 topic, 펼치면 problem · 대체된 plan 이력 · 커밋 · 파일
  await key('up')
  await key('up')
  await key('return')
  const api = texts({ toJSON: () => byId(tree, 'topic:api')! } as ReactTestRenderer)
  assert.ok(api.includes('앱마다 API 를 따로 불러 느리다'))
  assert.ok(api.includes('대체됨'))
  assert.ok(api.includes('커밋 3 · 정리 커밋 1'))
  // 해결 아래 spec 설명 (문제 줄 제외)
  assert.equal(textOf(byId(tree, 'topic-detail')!), '목록 · 상세를 한 번에 받는 묶음 API. 앱은 화면마다 한 번만 부른다.')
  assert.ok(api.includes('src/api.ts'))
  assert.ok(api.includes('막힘 1'))
  // 다른 topic 펼치면 앞의 것은 접힘 (1단)
  await key('j')
  await key('j')
  await key('enter')
  assert.equal(c.getState().expanded, 'web')
  assert.equal(labels().length, 4)
})

test('뒤쪽 탭: 탭마다 fixture 항목 수만큼 행', async () => {
  const { tree, c, key } = await mount()
  const m = c.getState().model!
  await key('2')
  assert.equal(c.getState().tab, 'decisions')
  assert.equal(ids(byId(tree, 'decisions:blocking'), 'row:decision:').length, 1)
  assert.ok(texts({ toJSON: () => byId(tree, 'decisions:blocking')! } as ReactTestRenderer).includes('p2api00'), '막힘 행에 plan sha')
  assert.equal(ids(byId(tree, 'decisions:open'), 'row:decision:').length, 1)
  assert.equal(ids(byId(tree, 'decisions:expected'), 'row:decision:').length, 3)
  assert.equal(ids(byId(tree, 'decisions:made'), 'row:decision:').length, 2)
  await key('4')
  const plans = nodes(tree).filter(n => String(n.props.id).startsWith('row:plan:'))
  assert.equal(plans.length, m.history.length)
  assert.equal(plans[0]!.props.id, 'row:plan:p2api000', '최근 plan 이 위')
  assert.ok(texts(tree).includes('→ p2api00 가 대체'))
  await key('5')
  assert.equal(nodes(tree).filter(n => String(n.props.id).startsWith('row:commit:')).length, 10)
  await key('6')
  assert.equal(nodes(tree).filter(n => String(n.props.id).startsWith('row:item:')).length, 3)
  assert.ok(texts({ toJSON: () => byId(tree, 'row:item:0')! } as ReactTestRenderer).includes('보존 기간'), '항목 최근 순')
  assert.ok(texts(tree).includes('실측 남음 · 두 번째 줄'))
  await key('tab', { shift: true })
  assert.equal(c.getState().tab, 'commits')
  await key('1')
  assert.equal(c.getState().tab, 'overview')
})

test('요청 탭: 상태 분포 · 필터 (f · 누름) · sha · ×by, 요청 0 + plugin 꺼짐이면 탭 없음', async () => {
  const req = (sha: string, status: string, by: string[]) => ({ sha, subject: `request: 요청 ${sha}`, refines: null, refinedBy: [], by, status })
  const { tree, c, key } = await mount(
    variant(s => {
      s.trace.requests = [req('r1aaaaaaa', 'open', []), req('r2bbbbbbb', 'started', ['x', 'y']), req('r3ccccccc', 'refined', ['z'])]
    }),
  )
  await key('3')
  assert.equal(c.getState().tab, 'requests')
  const rows = () => nodes(tree).filter(n => String(n.props.id).startsWith('row:request:'))
  assert.equal(rows().length, 3)
  assert.deepEqual(ids(byId(tree, 'requests:dist'), 'requests:dist:seg:'), ['requests:dist:seg:open', 'requests:dist:seg:started', 'requests:dist:seg:refined'])
  const r2 = texts({ toJSON: () => byId(tree, 'row:request:r2bbbbbbb')! } as ReactTestRenderer)
  assert.ok(r2.includes('×2') && r2.includes('r2bbbbb') && r2.includes('요청 r2bbbbbbb'))
  await key('f')
  assert.equal(rows().length, 1, 'f → open')
  assert.equal(rows()[0]!.props.id, 'row:request:r1aaaaaaa')
  await act(async () => byId(tree, 'filter:requests:refined')!.props.onClick())
  assert.deepEqual(rows().map(r => r.props.id), ['row:request:r3ccccccc'])
  await act(async () => byId(tree, 'filter:requests:all')!.props.onClick())
  assert.equal(rows().length, 3)

  // 요청 0 + request plugin 꺼짐 → 탭 없음, 숫자 키가 당겨진다
  const none = await mount(variant(s => (s.trace.requests = [])))
  assert.equal(none.tree.root.findAll(n => n.props.id === 'tab:requests').length, 0)
  await none.key('3')
  assert.equal(none.c.getState().tab, 'history')
  // 요청 0 이어도 request plugin 이 켜져 있으면 탭
  const on = await mount(
    variant(s => {
      s.trace.requests = []
      s.builtins.push({ id: 'request', active: true, requires: [] })
    }),
  )
  assert.equal(on.tree.root.findAll(n => n.props.id === 'tab:requests').length, 1)
})

test('사용자 정의 view 탭 (list · table · progress · 데이터 없음) · plugin 탭, 탭 10개 넘으면 숫자 없음', async () => {
  const { tree, c, key } = await mount()
  const tabIds = nodes(tree).filter(n => String(n.props.id).startsWith('tab:')).map(n => n.props.id)
  assert.deepEqual(tabIds, ['tab:overview', 'tab:decisions', 'tab:requests', 'tab:history', 'tab:commits', 'tab:items', 'tab:view:risks', 'tab:view:builtins', 'tab:view:run-goals', 'tab:view:gone', 'tab:plugins', 'tab:settings'])
  assert.equal(textOf(byId(tree, 'tab:view:gone')!), '사라짐', '10번째 탭은 숫자 없음')
  assert.equal(textOf(byId(tree, 'tab:view:run-goals')!), '9 목표')
  const rows = () => nodes(tree).filter(n => String(n.props.id).startsWith('row:view:'))

  // list: where kind=risk → 1행, badge · title · meta
  await key('7')
  assert.equal(c.getState().tab, 'view:risks')
  assert.equal(rows().length, 1)
  const risk = texts({ toJSON: () => rows()[0]! } as ReactTestRenderer)
  assert.deepEqual(risk, ['risk', '토큰 만료', 'aaaaaaa1'])
  assert.match(textOf(byId(tree, 'view:source')!), /trace\.items · kind=risk · 전체 3 중/)

  // table: 열 머리 2개, 행 = builtins 수, 칸 값
  await key('8')
  assert.deepEqual(texts({ toJSON: () => byId(tree, 'view:columns')! } as ReactTestRenderer), ['id', 'active'])
  assert.equal(rows().length, 2)
  assert.deepEqual(texts({ toJSON: () => rows()[0]! } as ReactTestRenderer), ['lore', 'false'])
  await key('j')
  assert.equal(c.getState().cursor['view:builtins'], 1)

  // progress: 행마다 done/total
  await key('9')
  assert.equal(rows().length, 2)
  assert.deepEqual(texts({ toJSON: () => rows()[0]! } as ReactTestRenderer), ['측정', '1/2'])

  // 데이터 없음 (plugin 꺼짐)
  await key('right')
  assert.equal(c.getState().tab, 'view:gone')
  assert.match(textOf(byId(tree, 'view:missing')!), /데이터 없음: plugins\.lore\.sections\.entries/)

  // plugin 탭: 버전 · 종류 · 명령 describe · 섹션 트리
  await key('right')
  assert.equal(c.getState().tab, 'plugins')
  const run = texts({ toJSON: () => byId(tree, 'row:plugin:run')! } as ReactTestRenderer)
  for (const x of ['run', 'v0.1.0', 'builtin', 'stats', 'table | health  run 커밋 집계', '섹션 goals', '├─ 2개', '└─ 집계 · done=3 · total=3']) assert.ok(run.includes(x), x)
})

test('커밋 탭: 종류 분포 · 종류 필터 · topic 필터 · 14일 막대', async () => {
  const { tree, c, key } = await mount()
  await key('5')
  assert.equal(c.getState().tab, 'commits')
  const rows = () => nodes(tree).filter(n => String(n.props.id).startsWith('row:commit:')).map(n => String(n.props.id).slice(11))
  assert.deepEqual(ids(byId(tree, 'commits:dist'), 'commits:dist:seg:'), ['commits:dist:seg:core', 'commits:dist:seg:run'])
  assert.equal(byId(tree, 'commits:days')!.children!.length, 14, '14일 막대 칸 14')
  // 모두 오늘 (NOW 기준 15분 안)
  assert.equal(byId(tree, 'commits:days:13')!.props.style.height > 2, true)
  // f: 종류 core → run
  await key('f')
  assert.equal(rows().length, 9)
  await key('f')
  assert.deepEqual(rows(), ['rrun0001'])
  await key('f')
  assert.equal(rows().length, 10)
  // t: topic 필터 → 다른 topic 커밋 없음
  await key('t')
  const topic = c.getState().filter['commits.topic']!
  assert.equal(topic, 'api')
  assert.deepEqual(rows(), ['i2api000', 'p2api000', 'p1api000'])
  assert.ok(c.getState().model!.commits.filter(x => rows().includes(x.sha)).every(x => x.topic === 'api'))
  await act(async () => byId(tree, 'filter:commits.topic:next')!.props.onClick())
  assert.ok(rows().length > 0 && c.getState().model!.commits.filter(x => rows().includes(x.sha)).every(x => x.topic === c.getState().filter['commits.topic']))
  await key('t', { shift: true })
  await key('t', { shift: true })
  assert.equal(rows().length, 10, 'shift+t 로 되돌아 전체')
})

test('항목 탭: 종류 분포 · 종류 필터 · 해결 여부 미판정 안내', async () => {
  const { tree, key } = await mount()
  await key('6')
  const rows = () => nodes(tree).filter(n => String(n.props.id).startsWith('row:item:'))
  assert.deepEqual(ids(byId(tree, 'items:dist'), 'items:dist:seg:'), ['items:dist:seg:open', 'items:dist:seg:remaining', 'items:dist:seg:risk'])
  assert.ok(texts(tree).some(t => t.includes('해결 여부는 판정하지 않음')))
  await act(async () => byId(tree, 'filter:items:risk')!.props.onClick())
  assert.equal(rows().length, 1)
  assert.ok(texts({ toJSON: () => rows()[0]! } as ReactTestRenderer).includes('토큰 만료'))
  await key('f')
  assert.equal(rows().length, 3, 'risk 다음은 전체')
})

test('설정 탭 (읽기 전용): 설치 상태 · 설정 문제 · plugin · 꺼진 내장 · 추가 키 · 커밋 종류', async () => {
  const { tree, c, key } = await mount(variant(s => (s.problems = [{ source: 'install', message: 'core.hooksPath = /x, 기대 .githooks' }])))
  await key('tab', { shift: true })
  assert.equal(c.getState().tab, 'settings', '마지막 탭')
  const row = (id: string) => texts({ toJSON: () => byId(tree, `row:setting:${id}`)! } as ReactTestRenderer)
  assert.deepEqual(row('install:hook'), ['✓', 'commit-msg hook', '.githooks'])
  assert.deepEqual(row('install:skills'), ['✗', 'skill 링크', '1/2 · 깨짐 .claude/skills/gnam-run'])
  assert.deepEqual(row('install:agents'), ['✗', 'AGENTS.md', 'gnam 블록 불일치 (gnam sync)'])
  assert.deepEqual(row('install:claude'), ['✓', 'CLAUDE.md', '@AGENTS.md 가져옴'])
  assert.deepEqual(row('install:handoff'), ['·', '인계 메모', '없음'])
  assert.deepEqual(row('problem:0'), ['✗', 'install', 'core.hooksPath = /x, 기대 .githooks'])
  assert.deepEqual(row('plugin:run'), ['run', 'v0.1.0 · builtin'])
  assert.deepEqual(row('kind:3'), ['run.<topic>.<start|end|policy>: …', 'run'])
  const config = texts({ toJSON: () => byId(tree, 'settings:config')! } as ReactTestRenderer)
  assert.deepEqual(config, ['꺼진 내장 plugin: lore', 'gnam.json 추가 키: view'])
  assert.equal(nodes(tree).filter(n => String(n.props.id).startsWith('row:setting:kind:')).length, 4, 'kinds 행 수')
  // 경고 묶음의 설정 문제를 누르면 설정 탭
  await key('1')
  await act(async () => byId(tree, 'signal:problems')!.props.onClick())
  assert.equal(c.getState().tab, 'settings')
  // j/k 로 설정 행 이동 (스크롤)
  await key('j')
  assert.equal(c.getState().cursor.settings, 1)
})

test('r 은 강제 새로고침, 읽기 실패 시 기존 화면 + 오류 1줄', async () => {
  const { tree, c, repo, key } = await mount()
  repo.fail = true
  await key('r')
  await act(() => c.refresh(true))
  assert.ok(byId(tree, 'topic:api'), '기존 topic 유지')
  assert.match(textOf(byId(tree, 'error-line')!), /boom: gnam\.json 깨짐/)
  repo.fail = false
  await act(() => c.refresh(true))
  assert.equal(byId(tree, 'error-line'), undefined)
})

test('목적 문단: 두 줄을 넘을 것 같으면 끝에 …, 폭을 모르면 그대로', () => {
  const long = '가'.repeat(100)
  const cut = clampText(long, 10, 100, 2)
  assert.ok(cut.endsWith('…') && cut.length < long.length)
  assert.equal(clampText('짧은 목적', 10, 400, 2), '짧은 목적')
  assert.equal(clampText(long, 10, 0, 2), long)
})
