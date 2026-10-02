import assert from "node:assert/strict"
import { test } from "node:test"
import { historyArgs, cleanMessage, pushRange } from "../src/core/history.ts"
import { fakeLookup, ruleRunner } from "./helpers.ts"

const lookup = fakeLookup(
  {
    abc1234: { subject: "spec.workspace.plan: 이름 유일성" },
    bbb2222: { subject: "spec.billing.impl: 청구" },
    ccc3333: { subject: "spec.billing.plan: 청구 중단 규칙" },
    ddd4444: { subject: "spec.workspace.plan: 남은 작업 수집", body: "Topics: workspace, billing" },
    eee5555: { subject: "spec.workspace.plan: 설계", body: "Blocking:\nB1. 제목 상속 여부" },
    fff6666: { subject: "spec.workspace.plan: 확정", body: "Blocking: 없음\n\nSupersedes: eee5555" },
  },
  ["workspace", "billing"],
)
const rules = ruleRunner(lookup)
const eq = (actual: unknown, expected: unknown) => assert.deepEqual(actual, expected)

test("코어: chore · refactor · spec.<topic>.<plan|impl|chore> 제목만 허용", () => {
  eq(rules("chore: 의존성 갱신"), [])
  eq(rules("fix: 버그"), ["commit/subject"])
  eq(rules("fixup! chore: a"), ["commit/subject"])
  eq(rules("Merge branch 'runner-1'"), ["commit/subject"])
  eq(rules("spec.workspace.done: x"), ["commit/subject"])
  // merge · run · release 는 plugin 종류
  eq(rules("spec.workspace.merge: runner-1 통합"), ["commit/subject"])
  eq(rules("run.workspace.start: S1"), ["commit/subject"])
  eq(rules("release: 1.0.0"), ["commit/subject"])
})

test("공동 작성자 줄은 대소문자 무관 거부", () => {
  eq(rules("chore: a\n\nCo-Authored-By: Bot <b@x>"), ["commit/no-co-author"])
  eq(rules("chore: a\n\nco-authored-by: Bot <b@x>"), ["commit/no-co-author"])
})

test("plan 은 같은 topic 의 spec 파일 하나 또는 빈 커밋, 본문 Goal · Plan · Blocking", () => {
  const body = "spec.workspace.plan: 계획\n\nGoal:\nx\n\nPlan:\n1. y\n\nBlocking: 없음"
  eq(rules(body, []), [])
  eq(rules(body, ["specs/workspace.md"]), [])
  eq(rules(body, ["specs/other.md"]), ["commit/plan-files"])
  eq(rules(body, ["specs/workspace.md", "src/a.ts"]), ["commit/plan-files"])
  eq(rules("spec.workspace.plan: 계획\n\nGoal:\nx\n\nBlocking: 없음"), ["commit/plan-body"])
  eq(rules("spec.workspace.plan: 계획\n\nGoal:\nx\n\nPlan:\n1. y"), ["commit/plan-body"])
})

test("impl 본문 첫 줄 Plan: 은 같은 topic 의 plan 커밋", () => {
  eq(rules("spec.workspace.impl: 구현\n\nPlan: abc1234 1-2\n\nIntent:\nx"), [])
  eq(rules("spec.workspace.impl: 구현\n\nIntent:\nx"), ["commit/impl-plan"])
  eq(rules("spec.workspace.impl: 구현\n\nPlan: fff9999 1"), ["commit/impl-plan"])
  eq(rules("spec.billing.impl: 구현\n\nPlan: abc1234 1"), ["commit/impl-plan"])
})

const gather = (steps: string, topics = "Topics: workspace, billing") =>
  `spec.workspace.plan: 남은 작업 수집\n\nGoal:\nx\n\n${topics}\n\nPlan:\n${steps}\n\nScope:\ny\n\nBlocking: 없음`

test("수집 plan: Topics · 빈 커밋 · 단계마다 From:", () => {
  const steps = "1. 충돌 정책\n   From: abc1234 3\n   완료: a\n2. 청구 중단\n   From: bbb2222 Remaining\n   Spec: ccc3333"
  eq(rules(gather(steps)), [])
  eq(rules(gather(steps), ["specs/workspace.md"]), ["commit/gather-files"])
  eq(rules(gather(steps, "")), ["commit/gather-topics", "commit/from-ref"])
  eq(rules(gather(steps, "Topics: billing")), ["commit/gather-topics"])
  eq(rules(gather(steps, "Topics: workspace")), ["commit/from-ref"])
  eq(rules(gather(steps, "Topics: workspace, billing, nope")), ["commit/gather-topics"])
  eq(rules(gather("1. 충돌 정책\n   From: abc1234 3\n2. 새 작업\n   완료: b")), ["commit/gather-from"])
})

test("수집 plan: From · Spec 은 먼저 커밋된 커밋, Spec 은 Topics 안 plan", () => {
  eq(rules(gather("1. a\n   From: fff9999 1")), ["commit/from-ref"])
  eq(rules(gather("1. a\n   From: 3")), ["commit/from-ref"])
  eq(rules(gather("1. a\n   From: abc1234 1\n   Spec: bbb2222")), ["commit/from-ref"])
  eq(rules(gather("1. a\n   From: abc1234 1", "Topics: workspace")), [])
})

test("impl 은 Topics 에 자기 topic 을 포함한 다른 topic 수집 plan 을 따를 수 있다", () => {
  eq(rules("spec.billing.impl: 청구 중단\n\nPlan: ddd4444 2"), [])
  eq(rules("spec.other.impl: x\n\nPlan: ddd4444 2"), ["commit/impl-plan"])
  eq(rules("spec.billing.impl: x\n\nPlan: bbb2222 1"), ["commit/impl-plan"])
})

test("impl 은 Blocking 이 남은 plan 을 따를 수 없다. Blocking 없는 이전 plan 은 허용", () => {
  eq(rules("spec.workspace.impl: x\n\nPlan: eee5555 1"), ["commit/impl-ready"])
  eq(rules("spec.workspace.impl: x\n\nPlan: fff6666 1"), [])
  eq(rules("spec.workspace.impl: x\n\nPlan: abc1234 1"), [])
})

test("Supersedes 는 먼저 커밋된 같은 topic plan, 수집 plan 에는 금지", () => {
  const plan = (extra: string) => `spec.workspace.plan: 확정\n\nGoal:\nx\n\nPlan:\n1. y\n\nBlocking: 없음\n\n${extra}`
  eq(rules(plan("Supersedes: eee5555")), [])
  eq(rules(plan("Supersedes: fff9999")), ["commit/supersedes-ref"])
  eq(rules(plan("Supersedes: ccc3333")), ["commit/supersedes-ref"])
  eq(rules(plan("Supersedes: bbb2222")), ["commit/supersedes-ref"])
  eq(rules(`${gather("1. a\n   From: abc1234 1")}\n\nSupersedes: eee5555`), ["commit/supersedes-ref"])
})

test("spec chore 본문 Goal · Scope", () => {
  eq(rules("spec.workspace.chore: 인덱스\n\nGoal:\nx\n\nScope:\ny"), [])
  eq(rules("spec.workspace.chore: 인덱스"), ["commit/chore-body", "commit/chore-body"])
})

const refactor = "refactor: 저장소 조회 모듈 분리\n\nGoal:\nx\n\nScope:\ny\n\nInvariant:\n조회 결과 동일. repo.test.ts"

test("refactor 본문 Goal · Scope · Invariant, specs/ 변경 금지", () => {
  eq(rules(refactor, ["src/repo.ts"]), [])
  eq(rules("refactor: x\n\nGoal:\na\n\nScope:\nb"), ["commit/refactor-body"])
  eq(rules("refactor: x"), ["commit/refactor-body", "commit/refactor-body", "commit/refactor-body"])
  eq(rules(refactor, ["src/repo.ts", "specs/workspace.md"]), ["commit/refactor-files"])
  eq(rules("refactor:x"), ["commit/subject"])
})

test("merge 커밋은 일반 chore 제목만 (refactor · spec 종류 거부)", () => {
  eq(rules("chore: 도구 브랜치 통합", [], true), [])
  eq(rules(refactor, [], true), ["commit/merge-kind"])
  eq(rules("spec.workspace.plan: x\n\nGoal:\na\n\nPlan:\nb\n\nBlocking: 없음", [], true), ["commit/merge-kind"])
})

test("git cleanup 처럼 주석 줄과 scissors 이후를 버린다", () => {
  assert.equal(
    cleanMessage("chore: a\n# 주석\n\nbody\n# ------------------------ >8 ------------------------\ndiff"),
    "chore: a\n\nbody",
  )
})

test("push 범위: before 가 0 이거나 없으면 전체 history", () => {
  const exists = (rev: string) => rev === "aaa"
  assert.equal(pushRange("0000000000000000000000000000000000000000", "bbb", exists), "bbb")
  assert.equal(pushRange("", "bbb", exists), "bbb")
  assert.equal(pushRange("ccc", "bbb", exists), "bbb")
  assert.equal(pushRange("aaa", "bbb", exists), "aaa..bbb")
})

test("historyArgs: 범위는 그대로, 전체 history 는 경계의 부모를 뺀다", () => {
  eq(historyArgs("a..b", "c"), ["a..b"])
  eq(historyArgs("b", null), ["b"])
  eq(historyArgs("b", "c"), ["b", "--not", "c^@"])
})
