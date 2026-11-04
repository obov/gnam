import assert from 'node:assert/strict'
import { test } from 'node:test'

import { Controller, pollMs, POLL_MS, startPolling, type Timer } from '../src/store.ts'
import { fakeRepo } from './fixture.ts'

test('갱신: 같은 HEAD 면 gnam status 0회, 바뀌면 1회, 실패 시 기존 topic 유지', async () => {
  const { repo, loader } = fakeRepo()
  const c = new Controller(loader)
  await c.refresh()
  assert.equal(loader.statusCalls, 1)
  const first = c.getState().model
  assert.ok(first?.topics.api)

  await c.refresh()
  assert.equal(loader.statusCalls, 1, '같은 HEAD · gnam.json · specs/ → 다시 읽지 않음')
  assert.equal(c.getState().model, first)

  repo.head = 'h2'
  await c.refresh()
  assert.equal(loader.statusCalls, 2, 'HEAD 바뀜 → 1회')

  repo.head = 'h3'
  repo.fail = true
  await c.refresh()
  assert.equal(loader.statusCalls, 3)
  assert.ok(c.getState().model?.topics.api, '실패 시 기존 화면 유지')
  assert.match(c.getState().error ?? '', /gnam status --json 실패: boom/)

  // 실패한 서명은 기억하지 않는다: 고쳐지면 같은 HEAD 에서도 다시 읽는다
  repo.fail = false
  await c.refresh()
  assert.equal(loader.statusCalls, 4)
  assert.equal(c.getState().error, null)
})

test('README · 인계 메모 수정 시각만 바뀌어도 다시 읽음', async () => {
  const { repo, loader } = fakeRepo()
  const c = new Controller(loader)
  await c.refresh()
  await c.refresh()
  assert.equal(loader.statusCalls, 1)
  repo.mtimes['/repo/README.md'] = 2
  await c.refresh()
  assert.equal(loader.statusCalls, 2, 'README.md 수정 → 1회')
  await c.refresh()
  assert.equal(loader.statusCalls, 2)
  repo.mtimes['/repo/.git/gnam/handoff.md'] = 5
  await c.refresh()
  assert.equal(loader.statusCalls, 3, '인계 메모 생김 → 1회')
  await c.refresh()
  assert.equal(loader.statusCalls, 3)
})

test('선택한 topic 은 갱신 뒤에도 이름으로 유지', async () => {
  const { repo, loader } = fakeRepo()
  const c = new Controller(loader)
  await c.refresh()
  c.key({ key: 'j' })
  c.key({ key: 'enter' })
  assert.equal(c.getState().expanded, 'web')
  repo.head = 'h2'
  await c.refresh()
  assert.equal(c.getState().expanded, 'web')
  assert.equal(c.getState().cursor.overview, 1)
})

test('독립 모드 주기 갱신: 같은 상태면 gnam status 0회, HEAD 바뀌면 1회', async () => {
  const { repo, loader } = fakeRepo()
  const c = new Controller(loader)
  await c.refresh()
  assert.equal(loader.statusCalls, 1)

  let tick: (() => void) | null = null
  let every = 0
  let cleared = false
  const timer: Timer = {
    set: (fn, ms) => {
      tick = fn
      every = ms
      return 7
    },
    clear: h => {
      cleared = h === 7
    },
  }
  const stop = startPolling(c, POLL_MS, timer)
  assert.equal(every, 5_000)
  const poll = async () => {
    tick!()
    await c.refresh() // 진행 중인 읽기를 기다린다 (없으면 같은 서명 확인 한 번 더)
  }

  await poll()
  await poll()
  assert.equal(loader.statusCalls, 1, '같은 HEAD · gnam.json · specs/ → gnam status 0회')

  repo.head = 'h2'
  await poll()
  assert.equal(loader.statusCalls, 2, 'HEAD 바뀜 → 1회')
  await poll()
  assert.equal(loader.statusCalls, 2)

  stop()
  assert.ok(cleared)
})

test('GNAM_VIEW_POLL_MS: 1000 이상 숫자만, 아니면 기본 5초', () => {
  assert.equal(pollMs(undefined), 5_000)
  assert.equal(pollMs('2000'), 2_000)
  assert.equal(pollMs('10'), 5_000)
  assert.equal(pollMs('abc'), 5_000)
})
