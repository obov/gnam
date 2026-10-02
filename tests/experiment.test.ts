import { test } from "node:test"
import { expect } from "./expect.ts"
import { createHash } from "node:crypto"
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { experimentProblems, experimentViolations } from "../src/plugins/ept/experiment.ts"

function at<T>(items: T[], index = 0): T {
  const value = items[index]
  if (value === undefined) throw new Error(`fixture item ${index} missing`)
  return value
}

function fixture() {
  const event = (id: string, kind: string, refs: string[] = []) => ({
    id,
    kind,
    refs,
    at: "2026-09-27T10:00:00Z",
    arm: "single",
    agent: "root",
    task: "t1",
    attempt: "a1",
    evidence: ["proof"],
    note: "fixture evidence",
  })
  return {
    schema_version: 1,
    id: "trial",
    mode: "ept",
    status: "done",
    request: "fixture",
    approval: "fixture execution",
    question: "single vs parallel",
    hypothesis: "parallel reduces wall time",
    baseline: "single",
    variables: ["structure"],
    controls: ["model/effort/input"],
    metrics: ["wall_ms: monotonic clock"],
    limits: { max_concurrency: 2, max_attempts: 2, max_wall_min: 5, stop: "deadline" },
    arms: [
      {
        id: "single",
        structure: "single root",
        review: "root checks",
        session_policy: "new",
        order: "first",
        isolation: "worktree from frozen commit",
        exposure: "none",
      },
    ],
    tasks: [
      {
        id: "t1",
        arm: "single",
        scope: "fixture",
        completion: "fixed checks",
        inputs: ["proof"],
        depends_on: [] as string[],
      },
    ],
    agents: [
      {
        id: "root",
        arm: "single",
        role: "root",
        parent: null as string | null,
        report_to: null,
        authority: "fixture",
        session: null,
        model: null,
        effort: null,
      },
    ],
    evidence: [
      {
        id: "proof",
        path: "experiments/agent-workflows/trial/proof.txt",
        sha256: createHash("sha256").update("proof").digest("hex"),
      },
    ],
    events: [
      event("e1", "assigned"),
      event("e2", "dispatched", ["e1"]),
      event("e3", "submitted", ["e2"]),
      event("e4", "verified", ["e3"]),
      event("e5", "accepted", ["e3", "e4"]),
    ],
    results: [
      {
        arm: "single",
        outcome: "done",
        measures: {
          wall_ms: 100,
          agent_active_ms: null,
          root_active_ms: null,
          input_tokens: null,
          output_tokens: null,
          handoff_failures: 0,
          rework_count: 0,
        },
        evidence: ["proof"],
        limitations: "usage unknown",
      },
    ],
    conclusion: {
      decision: "inconclusive",
      reason: "one arm only",
      applicability: "fixture",
      confounds: "no comparative execution",
    },
  }
}

test("단일 agent 실험과 미측정 null은 reviewer 없이 기록 가능", () => {
  expect(experimentProblems(fixture())).toEqual([])
})
test("제안은 실행 승인·관측·종료 결론 없이 기록 가능", () => {
  const r = { ...fixture(), status: "proposed", approval: null, events: [], results: [], conclusion: null }
  expect(experimentProblems(r)).toEqual([])
})
test("중단 실험은 미실행 비교군도 결과에 남겨야 함", () => {
  const r = fixture()
  r.status = "aborted"
  r.arms.push({ ...at(r.arms, 0), id: "parallel" })
  r.tasks.push({ ...at(r.tasks, 0), id: "t2", arm: "parallel" })
  r.agents.push({ ...at(r.agents, 0), id: "root2", arm: "parallel" })
  expect(experimentProblems(r)).toContain("results: 미실행 arm도 기록 parallel")
  r.results.push({ ...at(r.results, 0), arm: "parallel", outcome: "not_started" })
  expect(experimentProblems(r)).toEqual([])
})
test("제출·검증 참조 없는 완료와 시도 ID 재사용 거부", () => {
  const r = fixture()
  at(r.events, 4).refs = ["e3"]
  expect(experimentProblems(r)).toContain("accepted: 같은 시도의 verified 참조 필요")
  r.events.push({ ...at(r.events, 0), id: "e6" })
  expect(experimentProblems(r)).toContain("assigned: 새 attempt와 task 필요")
})
test("업무 의존·부모 순환 및 누락 측정 거부", () => {
  const r = fixture()
  at(r.tasks, 0).depends_on = ["t1"]
  at(r.agents, 0).parent = "root"
  const problems = experimentProblems(r)
  expect(problems).toContain("depends_on: 순환 t1")
  expect(problems).toContain("parent: 순환 root")
  expect(experimentProblems({ ...r, results: [{ ...r.results[0], measures: {} }] })).toContain(
    "result.measures.root_active_ms: 미측정도 null로 기록",
  )
})
test("앞선 배정 없는 시도·잘못된 참조·상한 초과 거부", () => {
  const r = fixture()
  r.events.shift()
  at(r.events, 0).refs = []
  expect(experimentProblems(r)).toContain("attempt: 앞선 assigned와 같은 arm/task 필요")
  const retry = fixture()
  retry.limits.max_attempts = 1
  retry.events.push({ ...at(retry.events, 0), id: "retry", attempt: "a2" })
  expect(experimentProblems(retry)).toContain("limits.max_attempts: 시도 상한 초과")
})
test("증거 변조·누락과 외부 경로 참조는 실제 파일 검사에서 거부", () => {
  const cwd = mkdtempSync(join(tmpdir(), "ept-"))
  const path = "experiments/agent-workflows/trial/record.json"
  const r = fixture()
  mkdirSync(join(cwd, "experiments/agent-workflows/trial"), { recursive: true })
  writeFileSync(join(cwd, at(r.evidence, 0).path), "proof")
  writeFileSync(join(cwd, path), JSON.stringify(r))
  try {
    expect(experimentViolations(cwd, [path])).toEqual([])
    writeFileSync(join(cwd, at(r.evidence, 0).path), "changed")
    expect(experimentViolations(cwd, [path])[0]?.current).toContain("해시 불일치")
    at(r.evidence, 0).path = "experiments/agent-workflows/trial/../secret.txt"
    writeFileSync(join(cwd, path), JSON.stringify(r))
    expect(experimentViolations(cwd, [path])[0]?.current).toContain("같은 실험 폴더")
    expect(experimentProblems(null).length).toBeGreaterThan(0)
  } finally {
    rmSync(cwd, { recursive: true, force: true })
  }
})
