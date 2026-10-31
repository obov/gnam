import { test } from "node:test"
import { expect } from "./expect.ts"
import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { collectTrace, stepNumbers, stepsOf, TraceError } from "../src/core/trace.ts"
import { tempRepo, type Repo } from "./helpers.ts"

function write(repo: Repo, path: string, body: string) {
  mkdirSync(dirname(join(repo.root, path)), { recursive: true })
  writeFileSync(join(repo.root, path), body)
}

function commit(repo: Repo, message: string, files: Record<string, string> = {}) {
  for (const [path, body] of Object.entries(files)) {
    write(repo, path, body)
    repo.git("add", path)
  }
  repo.git("commit", "-q", "--no-verify", "--allow-empty", "-m", message)
  return repo.git("rev-parse", "HEAD").out.trim()
}

const plan = (topic: string, title: string, steps: string[], extra: string[] = [], blocking = "Blocking: 없음") =>
  [
    `spec.${topic}.plan: ${title}`,
    "",
    "Goal:",
    "g",
    "",
    "Plan:",
    ...steps.flatMap((s, i) => [`${i + 1}. ${s}`, `   완료: ${s} 테스트`]),
    "",
    blocking,
    ...extra,
  ].join("\n")

/** request 3 · plan 4 (Supersedes 1 · 수집 1) · impl 3 · chore 2 · 미결 2 (하나는 미커밋) */
function fixture(repo: Repo) {
  const s = (sha: string) => sha.slice(0, 7)
  const base = commit(repo, "chore: gnam 도입", { "gnam.json": JSON.stringify({ format: 1, plugins: [] }) })
  const r1 = commit(repo, "request: 첫 요청\n\nText:\n> a")
  const r2 = commit(repo, "request: 다른 요청\n\nText:\n> b")
  const r3 = commit(repo, `request: 첫 요청 보충\n\nText:\n> c\n\nRefines: ${s(r1)}`)
  const p1 = commit(
    repo,
    plan("a", "A 계획", ["파서", "출력"], ["", "Risks:", "R1. 느림", "", `Request: ${s(r3)}`]),
    { "specs/a.md": "# a\n\n- 미구현: 출력\n- 미결: 형식 선택\n" },
  )
  const i1 = commit(repo, `spec.a.impl: 파서\n\nPlan: ${s(p1)} 1\n\nDeviation:\n이름 변경\n\nRemaining:\n- 오류 메시지`)
  const p2 = commit(repo, plan("a", "옛 계획", ["x"], [], "Blocking:\nB1. 옛 결정"), { "specs/a.md": "# a\n\n- 미구현: 출력\n- 미결: 형식 선택\n\n옛\n" })
  const p3 = commit(repo, plan("a", "새 계획", ["y"], ["", `Supersedes: ${s(p2)}`]))
  const i3 = commit(repo, `spec.a.impl: y\n\nPlan: ${s(p3)} 1`)
  write(repo, "specs/b.md", "# b\n")
  repo.git("add", "specs/b.md")
  commit(repo, "spec.b.chore: b 추가\n\nGoal:\ng\n\nScope:\nspecs/b.md")
  const p4 = commit(repo, plan("a", "수집", ["모으기"], ["", "Topics: a, b"], "Blocking:\nB1. 새 결정\nB2. 둘째"))
  const c1 = commit(repo, "chore: 규칙 개선\n\nRequest: 없음 (반복 chore 3회)\n\nDeferred:\n- 성능 측정")
  write(repo, "specs/a.md", "# a\n\n- 미구현: 출력\n- 미결: 형식 선택\n\n옛\n- 미결: 새 질문\n")
  return { base, r1, r2, r3, p1, i1, p2, p3, i3, p4, c1 }
}

test("단계 해석: 번호 · 범위 · 완료 줄", () => {
  expect(stepNumbers("1-3")).toEqual([1, 2, 3])
  expect(stepNumbers("2, 4")).toEqual([2, 4])
  expect(stepsOf(["1. 파서", "   완료: 테스트", "   통과", "2. 출력"])).toEqual([
    { n: 1, title: "파서", done: "테스트\n통과" },
    { n: 2, title: "출력", done: null },
  ])
})

test("trace: plan status 4종 · 단계별 impl · supersededBy · 수집 plan", () => {
  const repo = tempRepo(null)
  try {
    const f = fixture(repo)
    const trace = collectTrace(repo.root)
    expect(trace.head).toBe(repo.git("rev-parse", "HEAD").out.trim())
    expect(trace.boundary?.sha).toBe(f.base)
    const a = trace.topics["a"]
    expect(a?.plans.map((p) => [p.sha, p.status])).toEqual([
      [f.p1, "partial"],
      [f.p2, "superseded"],
      [f.p3, "done"],
      [f.p4, "not-started"],
    ])
    expect(a?.plans[0]?.steps).toEqual([
      { n: 1, title: "파서", done: "파서 테스트", impls: [f.i1] },
      { n: 2, title: "출력", done: "출력 테스트", impls: [] },
    ])
    expect(a?.plans[0]).toMatchObject({ requests: [f.r3], risks: ["R1. 느림"], impls: [{ sha: f.i1, step: "1", deviation: "이름 변경", remaining: "- 오류 메시지" }] })
    expect(a?.plans[1]).toMatchObject({ supersededBy: f.p3, blocking: ["B1. 옛 결정"] })
    expect(a?.plans[2]?.supersedes).toBe(f.p2)
    expect(trace.topics["b"]?.plans.map((p) => p.sha)).toEqual([f.p4])
    expect(trace.topics["b"]?.chores.map((c) => c.subject)).toEqual(["spec.b.chore: b 추가"])
    expect(trace.topics[""]?.chores.map((c) => c.sha)).toEqual([f.base, f.c1])
    expect(a?.unimplemented).toEqual([{ line: 3, text: "출력" }])
  } finally {
    repo.cleanup()
  }
})

test("trace: request status 3종 · agent · items 출처", () => {
  const repo = tempRepo(null)
  try {
    const f = fixture(repo)
    const trace = collectTrace(repo.root)
    expect(trace.requests.map((r) => [r.sha, r.status])).toEqual([
      [f.r1, "refined"],
      [f.r2, "open"],
      [f.r3, "started"],
    ])
    expect(trace.requests[2]).toMatchObject({ refines: f.r1, by: [f.p1] })
    expect(trace.agent).toEqual([{ sha: f.c1, subject: "chore: 규칙 개선", reason: "반복 chore 3회" }])
    expect(trace.items).toEqual([
      { kind: "risk", text: "R1. 느림", sha: f.p1 },
      { kind: "remaining", text: "오류 메시지", sha: f.i1 },
      { kind: "blocking", text: "B1. 옛 결정", sha: f.p2 },
      { kind: "blocking", text: "B1. 새 결정", sha: f.p4 },
      { kind: "blocking", text: "B2. 둘째", sha: f.p4 },
      { kind: "deferred", text: "성능 측정", sha: f.c1 },
    ])
  } finally {
    repo.cleanup()
  }
})

test("trace: decisions 는 대체되지 않은 plan 의 Blocking · spec 미결 (도입 커밋, 미커밋 null)", () => {
  const repo = tempRepo(null)
  try {
    const f = fixture(repo)
    const trace = collectTrace(repo.root)
    expect(trace.decisions.blocking).toEqual([
      { topic: "a", plan: f.p4, id: "B1", text: "B1. 새 결정" },
      { topic: "a", plan: f.p4, id: "B2", text: "B2. 둘째" },
    ])
    expect(trace.decisions.open).toEqual([
      { path: "specs/a.md", line: 4, text: "형식 선택", introducedBy: f.p1 },
      { path: "specs/a.md", line: 7, text: "새 질문", introducedBy: null },
    ])
  } finally {
    repo.cleanup()
  }
})

test("trace --since: 범위 안 항목만, 범위 안 impl 의 plan 포함, status 는 전체 기준", () => {
  const repo = tempRepo(null)
  try {
    const f = fixture(repo)
    const trace = collectTrace(repo.root, f.p3.slice(0, 7))
    expect(trace.since).toBe(f.p3)
    expect(trace.requests).toEqual([])
    expect(trace.topics["a"]?.plans.map((p) => [p.sha, p.status])).toEqual([
      [f.p3, "done"],
      [f.p4, "not-started"],
    ])
    expect(Object.keys(trace.topics)).toEqual(["a", "b", ""])
    expect(trace.topics[""]?.chores.map((c) => c.sha)).toEqual([f.c1])
    expect(trace.items.map((i) => i.sha)).toEqual([f.p4, f.p4, f.c1])
    expect(trace.decisions.open.map((o) => o.introducedBy)).toEqual([null])
    expect(trace.decisions.blocking.map((b) => b.plan)).toEqual([f.p4, f.p4])

    const touched = collectTrace(repo.root, f.i1)
    expect(touched.topics["a"]?.plans.map((p) => p.sha)).toEqual([f.p2, f.p3, f.p4])
    const fromPlan = collectTrace(repo.root, f.p1)
    expect(fromPlan.topics["a"]?.plans.map((p) => p.sha)).toEqual([f.p1, f.p2, f.p3, f.p4])
    const fromStart = collectTrace(repo.root, f.r3)
    expect(fromStart.topics["a"]?.plans[0]).toMatchObject({ sha: f.p1, status: "partial" })

    let error: unknown = null
    try {
      collectTrace(repo.root, "deadbeef")
    } catch (e) {
      error = e
    }
    expect(error).toBeInstanceOf(TraceError)
    const side = repo.git("commit-tree", `${f.r2}^{tree}`, "-p", f.r2, "-m", "chore: 다른 가지").out.trim()
    error = null
    try {
      collectTrace(repo.root, side)
    } catch (e) {
      error = e
    }
    expect(error).toBeInstanceOf(TraceError)
  } finally {
    repo.cleanup()
  }
})
