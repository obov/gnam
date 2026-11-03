import { test } from "node:test"
import merge from "../src/plugins/merge/index.ts"
import multirun from "../src/plugins/multirun/index.ts"
import { expect } from "./expect.ts"
import { fakeLookup, ruleRunner } from "./helpers.ts"

const START_AGENTS = [
  "Agent: v1 role=variant model=claude-opus-5-5 effort=high agent=claude session=u1",
  "Agent: v2 role=variant model=gpt-5.5-codex effort=high agent=codex session=na",
]
const lookup = fakeLookup(
  {
    abc1234: { subject: "spec.workspace.plan: 이름 유일성", body: "Goal:\na\n\nBlocking: 없음" },
    bcd2345: { subject: "spec.workspace.plan: 설계", body: "Goal:\na\n\nBlocking:\nB1. 정책" },
    cde3456: { subject: "spec.billing.plan: 청구", body: "Blocking: 없음" },
    def4567: { subject: "spec.billing.plan: 수집", body: "Topics: workspace, billing\nBlocking: 없음" },
    eee0001: { subject: "multirun.workspace.start: 2 변형", body: `Plan: abc1234\nId: abc1234-1\nBase: 9f8e7d6\n\n${START_AGENTS.join("\n")}` },
    eee0002: {
      subject: "multirun.workspace.report: 비교",
      body: "Start: eee0001\nOutcome: done\nVariants:\nv1 1111111 multirun/abc1234-1/v1/heads/v1\nv2 2222222 multirun/abc1234-1/v2/heads/v2\n\nDecision: 대기",
    },
    fff0001: { subject: "chore: 다른 것" },
  },
  ["workspace", "billing"],
)
const rules = ruleRunner(lookup, [multirun, merge])

const start = (head = "Plan: abc1234\nId: abc1234-1\nBase: 9f8e7d6", agents = START_AGENTS) =>
  `multirun.workspace.start: 2 변형\n\n${head}\n\n${agents.join("\n")}`

test("multirun.start: Plan (같은 topic · 수집 · Blocking 없음) · Id · Base · 변형 Agent 줄", () => {
  expect(rules(start())).toEqual([])
  expect(rules(start(), ["a.ts"])).toEqual(["commit/multirun-empty"])
  expect(rules(start(), [], true)).toEqual(["commit/merge-kind"])
  expect(rules(start("Plan: def4567\nId: def4567-2\nBase: 9f8e7d6"))).toEqual([])
  expect(rules(start("Plan: cde3456\nId: cde3456-1\nBase: 9f8e7d6"))).toEqual(["commit/multirun-ref"])
  expect(rules(start("Plan: bcd2345\nId: bcd2345-1\nBase: 9f8e7d6"))).toEqual(["commit/multirun-ref"])
  expect(rules(start("Plan: abc1234\nId: abc1234\nBase: 9f8e7d6"))).toEqual(["commit/multirun-body"])
  expect(rules(start("Plan: abc1234\nId: cde3456-1\nBase: 9f8e7d6"))).toEqual(["commit/multirun-body"])
  expect(rules(start("Plan: abc1234\nId: abc1234-1"))).toEqual(["commit/multirun-body"])
})

test("multirun.start Agent 줄: role · 키 순서 · 별칭 · 연속 이름 · 2개 이상 · 측정 키 금지", () => {
  const [v1 = "", v2 = ""] = START_AGENTS
  const bad = (agents: string[]) => rules(start(undefined, agents))
  expect(bad([v1])).toEqual(["commit/multirun-agents"])
  expect(bad([v1, v2.replace("v2", "v3")])).toEqual(["commit/multirun-agents"])
  expect(bad([v1, v2.replace("role=variant", "role=summarizer")])).toEqual(["commit/multirun-agents", "commit/multirun-agents"])
  expect(bad([v1.replace("claude-opus-5-5", "opus"), v2])).toEqual(["commit/multirun-agents"])
  expect(bad([v1.replace("effort=high agent=claude", "agent=claude effort=high"), v2])).toEqual(["commit/multirun-agents"])
  expect(bad([`${v1} out=1`, v2])).toEqual(["commit/multirun-agents"])
  expect(bad([v1.replace("agent=claude", "agent=gemini"), v2])).toEqual(["commit/multirun-agents"])
})

test("multirun.variant: Id 와 6 필드", () => {
  const body = "Id: abc1234-1\nApproach: runner-reviewer, Step 2개라\nPlugins: run, multi-agent\nChecks: npm run check pass\nDecisions: D1: 원본 유지\nDeviation: 없음\nRemaining: 없음"
  expect(rules(`multirun.workspace.variant: v1 완료\n\n${body}`)).toEqual([])
  expect(rules(`multirun.workspace.variant: v1 완료\n\n${body.replace("Deviation: 없음\n", "")}`)).toEqual(["commit/multirun-body"])
  expect(rules(`multirun.workspace.variant: v1 완료\n\n${body.replace("Id: abc1234-1", "Id: x")}`)).toEqual(["commit/multirun-body"])
})

const REPORT_AGENTS = [
  "Agent: v1 role=variant model=claude-opus-5-5 effort=high agent=claude session=u1 workflow=single wall_min=40 active_min=30 out=120000 lines=300 checks=pass",
  "Agent: v2 role=variant model=gpt-5.5-codex effort=high agent=codex session=na wall_min=50 active_min=na out=na lines=280 checks=fail",
  "Agent: summarizer role=summarizer model=claude-opus-5-5 effort=medium agent=claude session=u3 active_min=6 out=20000",
]
const VARIANTS = "Variants:\nv1 1111111 multirun/abc1234-1/v1/heads/v1\nv2 2222222 multirun/abc1234-1/v2/heads/v2"
const report = (head = "Start: eee0001\nOutcome: done", agents = REPORT_AGENTS, variants = VARIANTS, decision = "Decision: 대기") =>
  `multirun.workspace.report: 비교\n\n${head}\n\n${variants}\n\nComparison:\n| | v1 | v2 |\n\nCombinable:\nStep 1: v1\n\nRecommendation: v1, 검사 통과\n${decision}\n\n${agents.join("\n")}`

test("multirun.report: Start · Outcome · Variants · Decision 대기 · start 변형 전부 + summarizer", () => {
  expect(rules(report())).toEqual([])
  expect(rules(report("Start: fff0001\nOutcome: done"))).toEqual(["commit/multirun-ref"])
  expect(rules(report("Start: eee0001\nOutcome: ok"))).toEqual(["commit/multirun-body"])
  expect(rules(report(undefined, undefined, undefined, "Decision: v1"))).toEqual(["commit/multirun-body"])
  expect(rules(report(undefined, undefined, "Variants:\nv1 1111111 multirun/abc1234-1/v1/heads/v1"))).toEqual(["commit/multirun-agents"])
  expect(rules(report(undefined, undefined, "Variants:\nv1 xyz multirun/a\nv2 2222222 multirun/abc1234-1/v2/heads/v2"))).toEqual(["commit/multirun-body"])
  const [v1 = "", v2 = "", summarizer = ""] = REPORT_AGENTS
  expect(rules(report(undefined, [v1, v2]))).toEqual(["commit/multirun-agents"])
  expect(rules(report(undefined, [v1.replace(" lines=300", ""), v2, summarizer]))).toEqual(["commit/multirun-agents"])
  expect(rules(report(undefined, [v1.replace("checks=pass", "checks=ok"), v2, summarizer]))).toEqual(["commit/multirun-agents"])
})

test("결정 커밋 Multirun: report hash · 변형 · combine · discard", () => {
  const plan = (field: string) => `spec.workspace.plan: 조합 재진행\n\nGoal:\na\n\nPlan:\n1. b\n   완료: c\n\nBlocking: 없음\n\n${field}`
  expect(rules(plan("Multirun: eee0002 combine"))).toEqual([])
  expect(rules("spec.workspace.merge: v1 채택\n\nMultirun: eee0002 v1")).toEqual([])
  expect(rules("spec.workspace.merge: v3 채택\n\nMultirun: eee0002 v3")).toEqual(["commit/multirun-decision"])
  expect(rules("spec.workspace.merge: 채택\n\nMultirun: eee0001 v1")).toEqual(["commit/multirun-decision"])
  expect(rules("spec.billing.merge: 채택\n\nMultirun: eee0002 v1")).toEqual(["commit/multirun-decision"])
  expect(rules("chore: 폐기 기록\n\nMultirun: eee0002 discard")).toEqual([])
})
