import assert from 'node:assert/strict'
import { test } from 'node:test'

import { Controller } from '../src/store.ts'
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
