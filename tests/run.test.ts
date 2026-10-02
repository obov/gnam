import { test } from "node:test"
import merge from "../src/plugins/merge/index.ts"
import run from "../src/plugins/run/index.ts"
import { expect } from "./expect.ts"
import { fakeLookup, ruleRunner } from "./helpers.ts"

const lookup = fakeLookup(
  {
    abc1234: { subject: "spec.workspace.plan: 이름 유일성" },
    bbb2222: { subject: "spec.billing.impl: 청구" },
    ddd4444: { subject: "spec.workspace.plan: 남은 작업 수집", body: "Topics: workspace, billing" },
    aaa0001: { subject: "run.workspace.start: S1 병렬", body: "Agent: runner-1 role=runner\nAgent: reviewer-1 role=reviewer" },
    aaa0002: { subject: "spec.workspace.merge: 이름 유일성 (S1)" },
    aaa0003: { subject: "run.workspace.end: S1 결과", body: "Run: aaa0001" },
  },
  ["workspace", "billing"],
)
const rules = ruleRunner(lookup, [run, merge])

test("merge plugin: spec.<topic>.merge 제목 허용, merge 커밋에서도 허용", () => {
  expect(rules("spec.workspace.merge: runner-1 통합")).toEqual([])
  expect(rules("spec.workspace.merge: runner-1 통합", [], true)).toEqual([])
  expect(rules("spec.workspace.plan: x\n\nGoal:\na\n\nPlan:\nb\n\nBlocking: 없음", [], true)).toEqual(["commit/merge-kind"])
})

test("run 커밋은 merge 로 만들지 않는다", () => {
  expect(rules("run.README.policy: 배정 정책\n\nBasis: x\n\nPolicy:\ny", [], true)).toEqual(["commit/merge-kind"])
})

const START_AGENTS = [
  "Agent: runner-1 role=runner step=S1 model=claude-sonnet-5 effort=high size=M difficulty=K2 explore=no session=u1 est_min=20 est_out=150000",
  "Agent: reviewer-1 role=reviewer step=S1 model=claude-opus-5-5 effort=medium session=u2",
]
const END_AGENTS = [
  "Agent: runner-1 role=runner model=claude-sonnet-5 effort=high size=M difficulty=K2 explore=no firstpass=no retries=1 blocked=1 cause=effort noise=none verdict=under lines=240 active_min=26 out=190000 impl_min=20 impl_out=150000",
  "Agent: reviewer-1 role=reviewer model=claude-opus-5-5 effort=medium noise=api active_min=7 out=na",
]
const why = "Why: runner-1 인터페이스 정해짐, 결정 D1 남음"
const start = (agents = START_AGENTS, head = "Plan: abc1234 S1\nReference: 없음") =>
  `run.workspace.start: S1 병렬\n\n${head}\n\n${why}\n\n${agents.join("\n")}`
const end = (agents = END_AGENTS, head = "Run: aaa0001\nOutcome: done\nMerges: aaa0002") =>
  `run.workspace.end: S1 결과\n\n${head}\n\n${why}\n\n${agents.join("\n")}`

test("run.start: 빈 커밋, Plan · Reference, 에이전트 한 줄 + Why", () => {
  expect(rules(start())).toEqual([])
  expect(rules(start(), ["src/a.ts"])).toEqual(["commit/run-empty"])
  expect(rules(start(START_AGENTS, "Plan: abc1234 S1"))).toEqual(["commit/run-body"])
  expect(rules(start(START_AGENTS, "Plan: bbb2222 1\nReference: 없음"))).toEqual(["commit/run-ref"])
  expect(rules(start(START_AGENTS, "Plan: ddd4444 2\nReference: aaa0003"))).toEqual([])
  expect(rules(start(START_AGENTS, "Plan: 없음\nReference: 없음"))).toEqual([])
  expect(rules(start(START_AGENTS, "Plan: abc1234 S1\nReference: aaa0001"))).toEqual(["commit/run-ref"])
  expect(rules(start([START_AGENTS[0]?.replace("claude-sonnet-5", "sonnet") ?? ""]))).toEqual(["commit/run-agents"])
  expect(rules(start([START_AGENTS[0]?.replace(" session=u1", "") ?? ""]))).toContain("commit/run-agents")
  expect(rules(start(START_AGENTS, "Plan: abc1234 S1\nReference: 없음\n\nAgent: x role=runner"))).toContain(
    "commit/run-agents",
  )
})

test("run reviewer 줄: 비용만, 평가 · 예상 키 없음, Why: 선택", () => {
  const reviewer = (line: string) => [START_AGENTS[0] ?? "", line]
  expect(rules(start(reviewer(`${START_AGENTS[1]} est_min=6`)))).toEqual(["commit/run-agents"])
  expect(rules(start(reviewer(START_AGENTS[1]?.replace(" session", " size=M session") ?? "")))).toEqual([
    "commit/run-agents",
  ])
  expect(rules(start(reviewer(START_AGENTS[1]?.replace(" session=u2", "") ?? "")))).toEqual(["commit/run-agents"])
  expect(
    rules(end([END_AGENTS[0] ?? "", END_AGENTS[1]?.replace(" active_min", " verdict=fit active_min") ?? ""])),
  ).toEqual(["commit/run-agents"])
  expect(rules(end([END_AGENTS[0] ?? "", `${END_AGENTS[1]} impl_min=3`]))).toEqual(["commit/run-agents"])
  expect(rules(end([END_AGENTS[0] ?? "", END_AGENTS[1]?.replace(" active_min=7", "") ?? ""]))).toEqual([
    "commit/run-agents",
  ])
})

test("run.end: Run · Outcome · Merges, start 의 에이전트 전부, 측정 못 한 값은 na", () => {
  expect(rules(end())).toEqual([])
  expect(rules(end(END_AGENTS, "Run: aaa0001\nOutcome: aborted\nMerges: 없음"))).toEqual([])
  expect(rules(end(END_AGENTS, "Run: aaa0001\nOutcome: 완료\nMerges: aaa0002"))).toEqual(["commit/run-body"])
  expect(rules(end(END_AGENTS, "Run: abc1234\nOutcome: done\nMerges: aaa0002"))).toEqual(["commit/run-ref"])
  expect(rules(end(END_AGENTS, "Run: aaa0001\nOutcome: done\nMerges: bbb2222"))).toEqual(["commit/run-ref"])
  expect(rules(end([END_AGENTS[0] ?? ""]))).toEqual(["commit/run-agents"])
  expect(rules(end([END_AGENTS[0]?.replace("verdict=under", "verdict=bad") ?? "", END_AGENTS[1] ?? ""]))).toEqual([
    "commit/run-agents",
  ])
  expect(rules(end(END_AGENTS, "Run: aaa0001\nOutcome: done\nMerges: aaa0002\nCorrects: aaa0003"))).toEqual([])
  expect(rules(end([END_AGENTS[0]?.replace(" impl_min=20 impl_out=150000", "") ?? "", END_AGENTS[1] ?? ""]))).toEqual([
    "commit/run-agents",
    "commit/run-agents",
  ])
})

test("run Agent 줄: 키 순서 고정 (git 정규식이 줄 안 순서를 따른다)", () => {
  const swapped =
    START_AGENTS[0]?.replace("model=claude-sonnet-5 effort=high", "effort=high model=claude-sonnet-5") ?? ""
  expect(rules(start([swapped, START_AGENTS[1] ?? ""]))).toEqual(["commit/run-agents"])
  expect(rules(end([`${END_AGENTS[0]} step=S1`, END_AGENTS[1] ?? ""]))).toEqual(["commit/run-agents"])
})

test("run.policy: 빈 커밋, Basis · Policy", () => {
  expect(rules("run.README.policy: 배정 정책\n\nBasis: gnam run run stats table\n\nPolicy:\nMK2 sonnet high")).toEqual(
    [],
  )
  expect(rules("run.README.policy: 배정 정책")).toEqual(["commit/run-body", "commit/run-body"])
})

