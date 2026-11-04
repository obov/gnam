import { writeFileSync } from "node:fs"
import { join } from "node:path"
import { test } from "node:test"
import { expect } from "./expect.ts"
import { collectTrace, specProblemOf, specSummaryOf, stepNumbers, stepRefs, stepsOf, TraceError } from "../src/core/trace.ts"
import { tempRepo } from "./helpers.ts"
import { commit, fixture } from "./trace-fixture.ts"

test("단계 해석: 번호 · 범위 · 완료 줄", () => {
  expect(stepNumbers("1-3")).toEqual([1, 2, 3])
  expect(stepNumbers("2, 4")).toEqual([2, 4])
  expect(stepsOf(["1. 파서", "   완료: 테스트", "   통과", "2. 출력"])).toEqual([
    { n: 1, title: "파서", done: "테스트\n통과", parts: [] },
    { n: 2, title: "출력", done: null, parts: [] },
  ])
})

test("단계 해석: S 번호 단계 줄 · 단계 참조 (specs/info.md)", () => {
  expect(stepNumbers("3")).toEqual([3])
  expect(stepNumbers("S3")).toEqual([3])
  expect(stepNumbers("S1-S3")).toEqual([1, 2, 3])
  expect(stepNumbers("S1-3")).toEqual([1, 2, 3])
  expect(stepNumbers("S3a")).toEqual([3])
  expect(stepNumbers("S1, S4b 리뷰 반영")).toEqual([1, 4])
  expect(stepNumbers("S4 (d) D3")).toEqual([4])
  expect(stepsOf(["S1. 파서", "   완료: 테스트", "S2 출력", "1. 숫자", "   완료: 숫자 테스트"])).toEqual([
    { n: 1, title: "파서", done: "테스트", parts: [] },
    { n: 2, title: "출력", done: null, parts: [] },
    { n: 1, title: "숫자", done: "숫자 테스트", parts: [] },
  ])
  // 들여쓰기 · 'S1:' · 'S4a:' · 들여쓴 하위 단계 · S 뒤 공백 없음은 단계 줄 아님 (앞 단계 본문)
  expect(stepsOf(["S1 파서", "    S3 버킷", "S2: 파일", "S4a: 경로", "  S4b. 들여씀", "S5x", "S6ab. 두 글자"])).toEqual([
    { n: 1, title: "파서", done: null, parts: [] },
  ])
})

test("단계 해석: 하위 단계 줄 (S4a.) → 부모 단계의 parts (specs/info.md)", () => {
  expect(stepRefs("S4a, S4 S1-2 3")).toEqual([
    { n: 4, part: "4a" },
    { n: 4, part: null },
    { n: 1, part: null },
    { n: 2, part: null },
    { n: 3, part: null },
  ])
  // 부모 줄 없음 → 단계 4 생성, title = parts 제목 ' · '. 하위 단계 본문의 완료: 는 부모 done 에 '<id>: ' 로
  expect(stepsOf(["S4a. 파서", "   완료: 파서 테스트", "S4b 출력", "S5. 마감", "   완료: 확인"])).toEqual([
    {
      n: 4,
      title: "파서 · 출력",
      done: "4a: 파서 테스트",
      parts: [
        { id: "4a", title: "파서", impls: [] },
        { id: "4b", title: "출력", impls: [] },
      ],
    },
    { n: 5, title: "마감", done: "확인", parts: [] },
  ])
  // 부모 줄 + 하위 단계 줄 혼합: 부모 title 유지, 부모 완료: 다음에 parts 완료:
  expect(stepsOf(["1. 준비", "S2. 화면", "   완료: 전체 확인", "S2a. 목록", "   완료: 목록 테스트", "S2b. 상세", "   완료: 상세 테스트"])).toEqual([
    { n: 1, title: "준비", done: null, parts: [] },
    {
      n: 2,
      title: "화면",
      done: "전체 확인\n2a: 목록 테스트\n2b: 상세 테스트",
      parts: [
        { id: "2a", title: "목록", impls: [] },
        { id: "2b", title: "상세", impls: [] },
      ],
    },
  ])
})

test("trace: 하위 단계 parts 의 impl 연결 · 판정 (모든 parts 에 impl 이어야 완료)", () => {
  const repo = tempRepo(null)
  try {
    commit(repo, "chore: gnam 도입", { "gnam.json": JSON.stringify({ format: 1, plugins: [] }) })
    const partPlan = (title: string) =>
      [`spec.a.plan: ${title}`, "", "Plan:", "S4a. 파서", "S4b. 출력", "S5. 마감", "", "Scope:", "S4a: src/a.ts", "", "Blocking: 없음"].join("\n")
    const p1 = commit(repo, partPlan("일부"))
    const i1 = commit(repo, `spec.a.impl: 파서\n\nPlan: ${p1.slice(0, 7)} S4a`)
    const i2 = commit(repo, `spec.a.impl: 마감\n\nPlan: ${p1.slice(0, 7)} S5`)
    const p2 = commit(repo, partPlan("나눠 전부"))
    const i3 = commit(repo, `spec.a.impl: 파서\n\nPlan: ${p2.slice(0, 7)} S4a`)
    const i4 = commit(repo, `spec.a.impl: 출력 · 마감\n\nPlan: ${p2.slice(0, 7)} S4b, S5`)
    const p3 = commit(repo, partPlan("부모 참조"))
    const i5 = commit(repo, `spec.a.impl: 전부\n\nPlan: ${p3.slice(0, 7)} S4-S5`)
    const trace = collectTrace(repo.root)
    const plans = trace.topics["a"]?.plans
    expect(plans?.map((p) => [p.sha, p.status])).toEqual([
      [p1, "partial"],
      [p2, "done"],
      [p3, "done"],
    ])
    expect(plans?.[0]?.steps).toEqual([
      {
        n: 4,
        title: "파서 · 출력",
        done: null,
        impls: [i1],
        parts: [
          { id: "4a", title: "파서", impls: [i1] },
          { id: "4b", title: "출력", impls: [] },
        ],
      },
      { n: 5, title: "마감", done: null, impls: [i2], parts: [] },
    ])
    expect(plans?.[1]?.steps.map((s) => [s.impls, s.parts.map((p) => p.impls)])).toEqual([
      [[i3, i4], [[i3], [i4]]],
      [[i4], []],
    ])
    expect(plans?.[2]?.steps[0]?.parts.map((p) => p.impls)).toEqual([[i5], [i5]])
  } finally {
    repo.cleanup()
  }
})

test("trace: S 단계 plan + S 참조 impl → steps[].impls · status done · partial", () => {
  const repo = tempRepo(null)
  try {
    commit(repo, "chore: gnam 도입", { "gnam.json": JSON.stringify({ format: 1, plugins: [] }) })
    const sPlan = (title: string) =>
      [`spec.a.plan: ${title}`, "", "Plan:", "S1. 파서", "   완료: 파서 테스트", "S2 출력", "S3. 문서", "", "Blocking: 없음"].join("\n")
    const p1 = commit(repo, sPlan("전부"))
    const i1 = commit(repo, `spec.a.impl: 파서 · 출력\n\nPlan: ${p1.slice(0, 7)} S1-S2`)
    const i2 = commit(repo, `spec.a.impl: 문서 일부\n\nPlan: ${p1.slice(0, 7)} S3a`)
    const p2 = commit(repo, sPlan("일부"))
    const i3 = commit(repo, `spec.a.impl: 출력\n\nPlan: ${p2.slice(0, 7)} S2`)
    const plans = collectTrace(repo.root).topics["a"]?.plans
    expect(plans?.map((p) => [p.sha, p.status])).toEqual([
      [p1, "done"],
      [p2, "partial"],
    ])
    expect(plans?.[0]?.steps).toEqual([
      { n: 1, title: "파서", done: "파서 테스트", impls: [i1], parts: [] },
      { n: 2, title: "출력", done: null, impls: [i1], parts: [] },
      { n: 3, title: "문서", done: null, impls: [i2], parts: [] },
    ])
    expect(plans?.[1]?.steps.map((s) => s.impls)).toEqual([[], [i3], []])
  } finally {
    repo.cleanup()
  }
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
      { n: 1, title: "파서", done: "파서 테스트", impls: [f.i1], parts: [] },
      { n: 2, title: "출력", done: "출력 테스트", impls: [], parts: [] },
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

test("trace: topic summary = spec 첫 줄 설명, plan summary = 본문 Summary: (specs/human-summary.md)", () => {
  expect(specSummaryOf("a", "# a — 사람용 설명\n\n본문")).toBe("사람용 설명")
  expect(specSummaryOf("a", "# a: 콜론 설명")).toBe("콜론 설명")
  expect(specSummaryOf("my-topic", "# my-topic - 하이픈 설명")).toBe("하이픈 설명")
  expect(specSummaryOf("a", "# a\n\n본문")).toBe(null)
  expect(specSummaryOf("a", "본문만")).toBe(null)
  const repo = tempRepo(null)
  try {
    repo.commit("gnam.json", "chore: base")
    repo.git("commit", "-q", "--no-verify", "--allow-empty", "-m", 'chore: format')
    const plan = (summary: string) => `spec.a.plan: p\n\n${summary}Goal:\ng\n\nPlan:\n1. x\n\nBlocking: 없음`
    repo.commit("specs/a.md", plan("Summary: 목록이 한 번에 보인다\n\n"))
    repo.git("commit", "-q", "--no-verify", "--allow-empty", "-m", plan(""))
    repo.commit("specs/b.md", "spec.b.chore: b\n\nGoal:\ng\n\nScope:\ns")
    writeFileSync(join(repo.root, "specs/a.md"), "# a — 사람용 설명\n\n본문\n")
    const trace = collectTrace(repo.root)
    expect(trace.topics["a"]?.summary).toBe("사람용 설명")
    expect(trace.topics["a"]?.plans.map((p) => p.summary)).toEqual(["목록이 한 번에 보인다", null])
    expect(trace.topics["b"]?.summary).toBe(null)
  } finally {
    repo.cleanup()
  }
})

test("trace: topic problem = spec 첫 줄 다음 첫 비어 있지 않은 줄의 '문제:' 값 (specs/human-summary.md)", () => {
  expect(specProblemOf("# a — 설명\n\n문제: 사람이 겪는 불편\n\n본문")).toBe("사람이 겪는 불편")
  expect(specProblemOf("# a — 설명\n문제:  바로 다음 줄  \n본문")).toBe("바로 다음 줄")
  expect(specProblemOf("# a — 설명\n\n본문 첫 줄\n문제: 첫 문단 안 다른 줄")).toBe(null)
  expect(specProblemOf("# a — 설명\n\n본문")).toBe(null)
  expect(specProblemOf("# a — 설명\n\n문제:\n\n본문")).toBe(null)
  expect(specProblemOf("문제: 제목 없음")).toBe(null)
  expect(specProblemOf("# a")).toBe(null)
  const repo = tempRepo(null)
  try {
    repo.commit("gnam.json", "chore: base")
    repo.commit("specs/a.md", "spec.a.chore: a\n\nGoal:\ng\n\nScope:\ns")
    repo.commit("specs/b.md", "spec.b.chore: b\n\nGoal:\ng\n\nScope:\ns")
    writeFileSync(join(repo.root, "specs/a.md"), "# a — 설명\n\n문제: 목록을 손으로 모은다\n\n본문\n")
    writeFileSync(join(repo.root, "specs/b.md"), "# b — 설명\n\n본문\n")
    const trace = collectTrace(repo.root)
    expect(trace.topics["a"]?.problem).toBe("목록을 손으로 모은다")
    expect(trace.topics["b"]?.problem).toBe(null)
  } finally {
    repo.cleanup()
  }
})
