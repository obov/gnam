import { test } from "node:test"
import { expect } from "./expect.ts"
import {
  adopted,
  areaOf,
  columns,
  type Draft,
  endDraft,
  estimateTable,
  health,
  quantile,
  type RunCommit,
  rowsOf,
  table,
  wilson,
} from "../src/plugins/run/run-stats.ts"
import type { Usage } from "../src/plugins/run/run-usage.ts"

const runner = (extra: string) =>
  `Agent: runner-1 role=runner model=claude-sonnet-5 effort=high size=M difficulty=K2 explore=no ${extra}`
const commits: RunCommit[] = [
  {
    hash: "a000001aaaa",
    subject: "run.ws.start: S1",
    body: "Plan: p000001 S1\nReference: 없음\n\nWhy: runner-1 x\n\nAgent: runner-1 role=runner est_min=20 est_out=100",
  },
  {
    hash: "a000002aaaa",
    subject: "run.ws.end: S1",
    body: `Run: a000001\nOutcome: done\nMerges: 없음\n\n${runner("firstpass=yes cause=none noise=none verdict=fit lines=300 active_min=30 out=200")}`,
  },
  {
    hash: "a000003aaaa",
    subject: "run.ws.end: S1 교정",
    body: `Run: a000001\nOutcome: done\nMerges: 없음\nCorrects: a000002\n\n${runner("firstpass=no cause=effort noise=none verdict=under lines=100 active_min=40 out=50")}\nAgent: runner-2 role=runner model=claude-opus-5-5 effort=xhigh from=runner-1 firstpass=yes noise=api verdict=fit lines=300 active_min=10 out=na`,
  },
  { hash: "a000004aaaa", subject: "run.ws.start: S2", body: "Plan: p000002 S2" },
]

test("교정된 end 는 빠지고, 상향 에이전트는 from= 의 추정치를 잇는다", () => {
  const rows = rowsOf(commits)
  expect(rows.map((row) => `${row.run} ${row.agent}`)).toEqual(["a000003 runner-1", "a000003 runner-2"])
  expect(rows[1]?.start["est_min"]).toBe("20")
})

test("table: noise 제외 · 표본 미달 보류 · Wilson 구간", () => {
  const out = table(rowsOf(commits), { by: ["model"], where: "", role: "runner", min: 30, withNoise: false })
  expect(out[0]).toBe("행 1 (role=runner, noise=none)")
  expect(out[1]).toMatch(/^칸 +n +firstpass \[95%\] +impl_min p50\/p90/)
  expect(out[2]).toMatch(/^model=claude-sonnet-5 +1 보류 +0% \[0–79\] +40\/40 +40\/40 +50 +0\/1\/0$/)
  expect(table(rowsOf(commits), { by: ["model"], where: "", role: "runner", min: 1, withNoise: true })).toHaveLength(4)
})

test("adopted: model · effort 별 merge 줄 수", () => {
  expect(adopted(rowsOf(commits), "")).toEqual([
    "claude-opus-5-5 · xhigh  300줄 (75%)",
    "claude-sonnet-5 · high  100줄 (25%)",
  ])
})

test("health: end 없는 start · 미측정 · 추정 비율 · 재작업", () => {
  const out = health({ commits, rows: rowsOf(commits), reworkOf: (_, plan) => (plan === "p000001" ? 1 : 0) })
  expect(out[1]).toBe("run            start 2 · end 1 · end 없는 start 1 (a000004)")
  expect(out[2]).toBe("에이전트 줄    2 · 미측정 50% · 노이즈 50% · 탐색 0%")
  expect(out[3]).toBe("판정 (runner)  fit 50% · under 50% · over 0% · na 0%")
  expect(out[4]).toBe("실측/추정 p50  impl_min 2.00 · impl_out 0.50")
  expect(out[5]).toBe("재작업         100% (end 뒤 같은 Plan 의 impl)")
})

test("health: reviewer 줄은 판정 · 추정 비율에서 빠진다", () => {
  const end = commits[2]
  const withReviewer = [
    ...commits.slice(0, 2),
    {
      ...end,
      body: `${end?.body}\nAgent: reviewer-1 role=reviewer model=claude-opus-5-5 effort=medium noise=none active_min=5 out=10`,
    },
    ...commits.slice(3),
  ] as RunCommit[]
  const out = health({ commits: withReviewer, rows: rowsOf(withReviewer), reworkOf: () => 0 })
  expect(out[2]).toBe("에이전트 줄    3 · 미측정 33% · 노이즈 33% · 탐색 0%")
  expect(out[3]).toBe("판정 (runner)  fit 50% · under 50% · over 0% · na 0%")
  expect(out[4]).toBe("실측/추정 p50  impl_min 2.00 · impl_out 0.50")
})

test("health: 추정 비율은 impl_* 가 있으면 그것으로", () => {
  const withImpl = commits.map((commit) =>
    commit.hash === "a000003aaaa"
      ? { ...commit, body: commit.body.replace("active_min=40 out=50", "active_min=40 out=50 impl_min=10 impl_out=30") }
      : commit,
  )
  const out = health({ commits: withImpl, rows: rowsOf(withImpl), reworkOf: () => 0 })
  expect(out[4]).toBe("실측/추정 p50  impl_min 0.50 · impl_out 0.30")
})

const usage = (impl_min: number, impl_out: number): Usage => ({
  model: "claude-opus-5-5",
  effort: "high",
  harness: "2.1.283",
  mixed: [],
  input: 1,
  cache_write: 1,
  cache_read: 1,
  out: impl_out + 10,
  requests: 1,
  active_min: impl_min + 5,
  impl_min,
  impl_out,
  wall_min: 90,
  api_errors: 0,
})
const drafts: Draft[] = [
  {
    agent: {
      name: "runner-1",
      fields: { role: "runner", step: "1-5", explore: "no", est_min: "40", est_out: "100000" },
    },
    usage: usage(15, 30000),
  },
  {
    agent: { name: "runner-2", fields: { role: "runner", step: "6", explore: "no", est_min: "40", est_out: "100000" } },
    usage: usage(30, 30000),
  },
  {
    agent: {
      name: "reviewer-1",
      fields: { role: "reviewer", step: "1-5", model: "claude-opus-5-5", effort: "medium" },
    },
    usage: null,
  },
]

test("end 초안: 키 순서 고정, 측정 키 채움, 판정 키 '?', reviewer 는 비용만", () => {
  expect(endDraft("abcdef1234", drafts)).toEqual([
    "Run: abcdef1",
    "Outcome: ?",
    "Merges: ?",
    "",
    "Why: runner-1 ?",
    "Why: runner-2 ?",
    "",
    "Agent: runner-1 role=runner step=1-5 model=claude-opus-5-5 effort=high size=? difficulty=? explore=no firstpass=? retries=? blocked=? cause=? noise=? verdict=? lines=? active_min=20 out=30010 impl_min=15 impl_out=30000 api_errors=0 harness=2.1.283",
    "Agent: runner-2 role=runner step=6 model=claude-opus-5-5 effort=high size=? difficulty=? explore=no firstpass=? retries=? blocked=? cause=? noise=? verdict=? lines=? active_min=35 out=30010 impl_min=30 impl_out=30000 api_errors=0 harness=2.1.283",
    "Agent: reviewer-1 role=reviewer step=1-5 model=na effort=na noise=? active_min=na out=na",
  ])
})

test("추정 대비표: over 후보 = impl_min · impl_out 둘 다 절반 미만", () => {
  const out = estimateTable(drafts)
  expect(out[1]).toMatch(/^runner-1 +40 +15 +20 +100000 +30000 +30010 +yes$/)
  expect(out[2]).toMatch(/ no$/)
  expect(out[3]).toMatch(/^reviewer-1 +- +- +na +- +- +na +-$/)
})

test("columns: 한글은 2칸으로 맞춘다", () => {
  expect(
    columns([
      ["항목", "x"],
      ["ab", "y"],
    ]),
  ).toEqual(["항목  x", "ab    y"])
})

test("통계 도우미", () => {
  expect(quantile([5, 1, 3], 0.5)).toBe(3)
  expect(quantile([], 0.5)).toBeNull()
  expect(wilson(0, 0)).toEqual([0, 100])
  expect(wilson(15, 20)).toEqual([53, 89])
  expect(["apps/web/site/a.ts", "packages/api/x.ts", "docs/a.md", "README.md"].map(areaOf)).toEqual([
    "apps/web/site",
    "packages/api",
    "docs",
    ".",
  ])
})
