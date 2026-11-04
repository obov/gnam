import assert from 'node:assert/strict'
import { test } from 'node:test'

import { act, create, type ReactTestRenderer, type ReactTestRendererJSON } from 'react-test-renderer'

import { Controller } from '../src/store.ts'
import { App } from '../src/view.tsx'
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
  assert.ok(api.includes('커밋 3'))
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
  await key('3')
  const plans = nodes(tree).filter(n => String(n.props.id).startsWith('row:plan:'))
  assert.equal(plans.length, m.history.length)
  assert.equal(plans[0]!.props.id, 'row:plan:p2api000', '최근 plan 이 위')
  assert.ok(texts(tree).includes('→ p2api00 가 대체'))
  await key('4')
  assert.equal(nodes(tree).filter(n => String(n.props.id).startsWith('row:commit:')).length, 9)
  await key('5')
  assert.equal(nodes(tree).filter(n => String(n.props.id).startsWith('row:item:')).length, 3)
  assert.ok(texts({ toJSON: () => byId(tree, 'row:item:0')! } as ReactTestRenderer).includes('보존 기간'), '항목 최근 순')
  assert.ok(texts(tree).includes('실측 남음 · 두 번째 줄'))
  await key('tab', { shift: true })
  assert.equal(c.getState().tab, 'commits')
  await key('1')
  assert.equal(c.getState().tab, 'overview')
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
