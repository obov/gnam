import assert from "node:assert/strict"
import { writeFileSync } from "node:fs"
import { join } from "node:path"
import { test } from "node:test"
import { validateCommit } from "../src/core/commit.ts"
import { configProblems } from "../src/core/config.ts"
import { normalize, splitTrailers } from "../src/core/format.ts"
import { collectTrace } from "../src/core/trace.ts"
import { fakeLookup, tempRepo } from "./helpers.ts"

const eq = (actual: unknown, expected: unknown) => assert.deepEqual(actual, expected)

const PLAN = "docs(workspace): 이름 유일성\n\nGoal:\nx\n\nPlan:\n1. y\n   완료: z\n\nGnam: spec.workspace.plan\nSummary: 대소문자만 다른 이름으로 workspace 가 둘 생기지 않는다\nBlocking: 없음"
const lookup = {
  ...fakeLookup(
    {
      abc1234: { subject: "docs(workspace): 이름 유일성", body: PLAN.split("\n").slice(2).join("\n") },
      bbb2222: { subject: "docs(workspace): 깨는 변경", body: "Goal:\nx\n\nPlan:\n1. y\n\nGnam: spec.workspace.plan\nSummary: s\nBlocking: 없음\nBreaking: 설정 필수" },
      ccc3333: { subject: "spec.workspace.plan: 옛 판 plan", body: "Summary: s\n\nGoal:\nx\n\nPlan:\n1. y\n\nBlocking: 없음" },
    },
    ["workspace"],
  ),
  changesFiles: (hash: string) => hash !== "ccc3333",
  released: () => false,
}
const config = { format: 2, plugins: [] }
const rules = (message: string, files: string[] | null = [], extra: Partial<typeof lookup> = {}) =>
  validateCommit({ message, files, merge: false, config, ...lookup, ...extra }).map((v) => v.rule)

test("trailer 단락: 마지막 단락이 Key: value 줄만일 때", () => {
  eq(splitTrailers("본문\n\nGnam: spec.a.plan\nSummary: s").trailers.map((t) => t.key), ["Gnam", "Summary"])
  eq(splitTrailers("본문\n\n그냥 문장\nGnam: x").trailers, [])
  eq(splitTrailers("a\n\nBREAKING CHANGE: 설정 필수").trailers, [{ key: "BREAKING CHANGE", value: "설정 필수" }])
})

test("normalize: format 2 → format 1 모양, format 1 · plugin 접두는 그대로", () => {
  eq(normalize("feat(a): x", "본문\n\nGnam: spec.a.impl\nPlan: abc1234 1").subject, "spec.a.impl: x")
  eq(normalize("feat(a): x", "본문\n\nGnam: spec.a.impl\nPlan: abc1234 1").body.split("\n")[0], "Plan: abc1234 1")
  eq(normalize("fix: 버그", "").subject, "chore: 버그")
  eq(normalize("refactor(core): 정리", "").subject, "refactor: 정리")
  eq(normalize("chore: x", "Goal:\ny").subject, "chore: x")
  eq(normalize("spec.a.plan: x", "Blocking: 없음").subject, "spec.a.plan: x")
  eq(normalize("release: 1.0.0", "").subject, "release: 1.0.0")
})

test("format 2: plan · impl · chore 통과", () => {
  eq(rules(PLAN, ["specs/workspace.md"]), [])
  eq(rules("feat(workspace): 구현\n\nIntent:\nx\n\nGnam: spec.workspace.impl\nPlan: abc1234 1"), [])
  eq(rules("fix(deps): 갱신"), [])
  eq(rules("chore: release 0.8.0"), [])
  eq(rules("docs(workspace): 인덱스\n\nGoal:\nx\n\nScope:\ny\n\nGnam: spec.workspace.chore", ["specs/workspace.md"]), [])
})

test("format 2: 제목 · Gnam 표기 위반", () => {
  eq(rules("spec.workspace.plan: 옛 판"), ["commit/subject"])
  eq(rules("layout: x"), ["commit/subject"])
  eq(rules(PLAN.replace("docs(workspace)", "docs(billing)"), ["specs/workspace.md"]), ["commit/gnam-scope"])
  eq(rules(PLAN.replace("docs(workspace)", "chore(workspace)"), ["specs/workspace.md"]), ["commit/gnam-type"])
  eq(rules("feat: 새 기능"), ["commit/feat-plan"])
  eq(rules("fix(workspace): 버그"), ["commit/chore-scope"])
  eq(rules("chore: 정리", ["specs/workspace.md"]), ["commit/chore-spec"])
  eq(rules("chore: x\n\nSummary: s\n\n본문"), ["commit/trailer-field"])
  eq(rules("chore: x\n\n## 제목\n---"), ["commit/body-markup", "commit/body-markup"])
})

test("format 2: impl type 은 계산한 수준 이상", () => {
  const impl = (header: string, plan: string, extra = "") => `${header}\n\nIntent:\nx\n\nGnam: spec.workspace.impl\nPlan: ${plan} 1${extra}`
  // 새 합의 (spec 을 바꾼 plan, 릴리스 전) = feat
  eq(rules(impl("fix(workspace): 구현", "abc1234")), ["commit/impl-type"])
  // 릴리스 이후 = fix 허용
  eq(rules(impl("fix(workspace): 수정", "abc1234"), [], { released: () => true }), [])
  // 빈 plan (옛 판) = fix 허용
  eq(rules(impl("fix(workspace): 수정", "ccc3333")), [])
  // plan Breaking = ! 또는 BREAKING CHANGE
  eq(rules(impl("feat(workspace): 구현", "bbb2222")), ["commit/impl-type"])
  eq(rules(impl("feat(workspace)!: 구현", "bbb2222")), [])
  eq(rules(impl("feat(workspace): 구현", "bbb2222", "\nBREAKING CHANGE: 이전: 설정 추가")), [])
})

test("format 1 저장소는 CC 제목을 그대로 거부", () => {
  eq(validateCommit({ message: "fix: 버그", files: [], merge: false, ...lookup }).map((v) => v.rule), ["commit/subject"])
})

test("config: format 2 + release plugin = 오류", () => {
  assert.ok(configProblems({ format: 2, plugins: ["@gnam/release"] }).some((p) => p.includes("release")))
  eq(configProblems({ format: 1, plugins: ["@gnam/release"] }), [])
})

test("판이 섞인 history: format 1 plan 을 format 2 impl 이 따른다", () => {
  const repo = tempRepo({ format: 1, plugins: [] })
  try {
    repo.git("add", "gnam.json")
    repo.git("commit", "-q", "--no-verify", "-m", "chore: gnam init")
    const plan = repo.commit("specs/workspace.md", "spec.workspace.plan: 계획\n\nSummary: s\n\nGoal:\nx\n\nPlan:\n1. y\n   완료: z\n\nBlocking: 없음")
    writeFileSync(join(repo.root, "gnam.json"), JSON.stringify({ format: 2, plugins: [] }))
    repo.git("add", "gnam.json")
    repo.git("commit", "-q", "--no-verify", "-m", "chore: format 2 로")
    repo.commit("src/a.ts", `feat(workspace): 구현\n\nIntent:\nx\n\nGnam: spec.workspace.impl\nPlan: ${plan.slice(0, 7)} 1`)
    const trace = collectTrace(repo.root) as unknown as { topics: Record<string, { plans: { steps: { impls: string[] }[] }[] }> }
    eq(trace.topics["workspace"]?.plans[0]?.steps[0]?.impls.length, 1)
    const verify = repo.gnam("verify")
    assert.equal(verify.status, 0, verify.out + verify.err)
  } finally {
    repo.cleanup()
  }
})
