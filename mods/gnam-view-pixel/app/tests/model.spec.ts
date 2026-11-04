import assert from 'node:assert/strict'
import { test } from 'node:test'

import { buildModel, gnamKind, parseLog, parsePurpose, specDetail } from '../src/model.ts'
import { API_SPEC, LOG, README, STATUS, fakeRepo, withoutProblem } from './fixture.ts'

const build = (status: unknown = STATUS) => buildModel({ cwd: '/repo', status: status as Record<string, unknown>, readme: README, readmePath: 'README.md', log: LOG })

test('now · next · done 분류, done 은 필터 없이 전부', () => {
  const m = build()
  // 끝났지만 미구현이 남은 export 는 '다음 계획 필요' 로 지금 묶음 (진행 중 뒤)
  assert.deepEqual(m.now, ['api', 'export'])
  assert.equal(m.topics.export!.needsPlan, true)
  assert.equal(m.topics.api!.needsPlan, false)
  // plan 없는 topic (docs) 도 '다음' 묶음이지만 '시작 전' 과 따로 센다
  assert.deepEqual(m.next, ['web', 'docs'])
  assert.equal(m.topics.docs!.status, 'none')
  // 최근 커밋 순
  assert.deepEqual(m.done, ['sync', 'lore'])
  assert.equal(m.counts.done, 2)
  assert.deepEqual(m.orphans, ['gone'])
  assert.equal(m.topics['']?.name, undefined)
  assert.equal(m.topics.README, undefined, 'readme topic 은 spec 아님')
  assert.deepEqual(m.counts, { topics: 6, now: 1, needsPlan: 1, next: 1, none: 1, done: 2, stepsDone: 1, stepsTotal: 5, plans: 7, commits: 10 })
})

test('plan Summary 가 없으면 커밋 제목 (Goal 아님)', () => {
  const m = build()
  const exp = m.topics.export!
  assert.equal(exp.plans[0]!.summary, null)
  assert.equal(exp.plans[0]!.title, '내보내기 기본')
  assert.equal(exp.headline, '내보내기 기본')
  const api = m.topics.api!
  assert.equal(api.planSummary, '앱이 목록을 한 번에 받는다')
  assert.equal(api.headline, '앱이 목록을 한 번에 받는다')
  assert.deepEqual(api.plans.map(p => [p.sha, p.title, p.summary, p.status]), [
    ['p1api000', '첫 계획', null, 'superseded'],
    ['p2api000', '앱이 목록을 한 번에 받는다', '앱이 목록을 한 번에 받는다', 'partial'],
  ])
  assert.deepEqual(api.progress, { done: 1, total: 3 })
})

test('builtins active=false 인 topic 은 pluginActive false', () => {
  const m = build()
  assert.equal(m.topics.lore!.pluginActive, false)
  assert.equal(m.topics.lore!.plugin, 'lore')
  assert.equal(m.topics.sync!.pluginActive, true)
  assert.equal(m.topics.sync!.plugin, null)
})

test('problem: 값 · null, problem 키 없는 status (구버전) 는 null', () => {
  const m = build()
  assert.equal(m.topics.api!.problem, '앱마다 API 를 따로 불러 느리다')
  assert.equal(m.topics.web!.problem, null)
  const old = build(withoutProblem())
  for (const t of Object.values(old.topics)) assert.equal(t.problem, null)
})

test('topic 커밋 · 파일 · 결정', () => {
  const m = build()
  const api = m.topics.api!
  assert.deepEqual(api.commits.map(c => c.sha), ['i2api000', 'p2api000', 'p1api000'])
  assert.deepEqual(api.files, [
    { path: 'specs/api.md', count: 1 },
    { path: 'src/api.ts', count: 1 },
    { path: 'tests/api.test.ts', count: 1 },
  ])
  assert.deepEqual(api.blocking, ['B1. 인증 방식 미정'])
  assert.deepEqual(m.decisions.map(d => d.kind), ['blocking', 'open', 'expected', 'expected', 'expected', 'made', 'made'])
  // 막힘의 where = plan sha (trace.decisions.blocking 의 plan)
  assert.equal(m.decisions[0]!.where, 'p2api00')
  // 항목은 최근 순 (trace.items 의 역순)
  assert.deepEqual(m.items.map(i => i.sha), ['ccccccc3', 'bbbbbbb2', 'aaaaaaa1'])
  // 시각 모름 (git log 범위 밖) 은 가장 오래된 쪽
  assert.deepEqual(m.history.map(p => p.sha).slice(0, 3), ['p7gone00', 'p1api000', 'p5exp000'])
  assert.equal(m.history.at(-1)!.sha, 'p2api000')
})

test('README 목적 · 로그 파싱', () => {
  assert.deepEqual(parsePurpose(README, 'README.md'), { title: 'repo', tagline: '할 일을 기록하는 저장소', text: '여러 기기에서 쓰는 할 일 앱. 앱과 서버가 같은 기록을 본다.', from: 'README.md' })
  assert.equal(parsePurpose(null, 'README.md').text, null)
  assert.deepEqual(gnamKind('docs(view): x', 'spec.view.plan'), { topic: 'view', kind: 'plan' })
  assert.deepEqual(gnamKind('chore(view): x', 'multirun.view.report'), { topic: 'view', kind: 'multirun.report' })
  assert.deepEqual(gnamKind('spec.a-b.impl: x', null), { topic: 'a-b', kind: 'impl' })
  assert.deepEqual(gnamKind('chore: x', null), { topic: null, kind: null })
  const log = parseLog(LOG)
  assert.equal(log.length, 10)
  assert.deepEqual(log[0], { sha: 'i2api000', subject: 'feat(api): 목록 단계 1', time: 1_700_000_000 - 100, topic: 'api', kind: 'impl', files: ['src/api.ts', 'tests/api.test.ts'], gnam: 'spec.api.impl', owner: 'other' })
})

test('커밋 종류 주인: status kinds 의 제목 · trailer 정규식', () => {
  const m = build()
  const owner = (sha: string) => m.commits.find(c => c.sha === sha)!.owner
  assert.equal(owner('i2api000'), 'core', 'trailer spec.api.impl')
  assert.equal(owner('cchore01'), 'core', '제목 chore:')
  assert.equal(owner('p6lore00'), 'core', 'format 1 제목')
  assert.equal(owner('rrun0001'), 'run', 'trailer run.sync.start')
  assert.deepEqual(m.owners, ['core', 'run'])
})

test('spec 설명 (문제 줄 제외 첫 문단)', async () => {
  assert.equal(specDetail(API_SPEC), '목록 · 상세를 한 번에 받는 묶음 API. 앱은 화면마다 한 번만 부른다.')
  assert.equal(specDetail('# x\n\n```sh\na\n```\n'), null)
  const { loader } = fakeRepo()
  const m = (await loader.load())!
  assert.equal(m.topics.api!.detail, '목록 · 상세를 한 번에 받는 묶음 API. 앱은 화면마다 한 번만 부른다.')
  assert.equal(m.topics.web!.detail, null)
})

test('README 첫 문단이 없으면 package.json description 이 목적', async () => {
  const { repo, loader } = fakeRepo()
  repo.files['/repo/README.md'] = null
  const m = (await loader.load())!
  assert.deepEqual([m.purpose.text, m.purpose.from], ['할 일 앱과 서버', 'package.json'])
  const { loader: withReadme } = fakeRepo()
  assert.equal((await withReadme.load())!.purpose.from, 'README.md')
})
