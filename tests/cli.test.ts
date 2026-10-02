import assert from "node:assert/strict"
import { existsSync, mkdirSync, readFileSync, readlinkSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { afterEach, test } from "node:test"
import { type Repo, tempRepo } from "./helpers.ts"

let repo: Repo | null = null
afterEach(() => repo?.cleanup())
const ZERO = "0000000000000000000000000000000000000000"
const planMessage = "spec.review.plan: 계획\n\nGoal:\na\n\nPlan:\nb"

test("init --no-install: gnam.json · hook · skill 링크 · AGENTS.md 블록 · specs/README.md", () => {
  repo = tempRepo(null)
  const r = repo.gnam("init", "--no-install", "--plugins", "lore")
  assert.equal(r.status, 0, r.err)
  const config = JSON.parse(readFileSync(join(repo.root, "gnam.json"), "utf8"))
  assert.deepEqual(config, { format: 1, plugins: ["@gnam/lore"] })
  assert.equal(repo.git("config", "core.hooksPath").out.trim(), ".githooks")
  assert.ok(existsSync(join(repo.root, ".githooks/commit-msg")))
  for (const dir of [".agents/skills", ".claude/skills"]) {
    assert.match(readlinkSync(join(repo.root, dir, "gnam")), /node_modules\/gnam\/skills\/gnam$/)
    assert.ok(existsSync(join(repo.root, dir, "gnam-lore", "SKILL.md")))
  }
  const agents = readFileSync(join(repo.root, "AGENTS.md"), "utf8")
  assert.match(agents, /<!-- gnam:begin -->[\s\S]*lore[\s\S]*<!-- gnam:end -->/)
  assert.ok(existsSync(join(repo.root, "specs/README.md")))
  assert.ok(existsSync(join(repo.root, "lore/README.md")))
  assert.equal(readFileSync(join(repo.root, "CLAUDE.md"), "utf8"), "@AGENTS.md\n")
  const pkg = JSON.parse(readFileSync(join(repo.root, "package.json"), "utf8"))
  assert.equal(pkg.scripts.postinstall, "gnam link")
  assert.equal(repo.git("check-ignore", "-q", "node_modules").status, 0)
  assert.equal(repo.gnam("doctor").status, 0)
})

test("AGENTS.md 블록 밖 내용은 유지, 다시 sync 해도 같음", () => {
  repo = tempRepo()
  writeFileSync(join(repo.root, "AGENTS.md"), "# 앱\n\n규칙 A\n")
  assert.equal(repo.gnam("sync").status, 0)
  const once = readFileSync(join(repo.root, "AGENTS.md"), "utf8")
  assert.ok(once.startsWith("# 앱\n\n규칙 A\n\n<!-- gnam:begin -->"))
  repo.gnam("sync")
  assert.equal(readFileSync(join(repo.root, "AGENTS.md"), "utf8"), once)
})

test("hook 이 실제 커밋을 막는다", () => {
  repo = tempRepo()
  assert.equal(repo.gnam("link").status, 0)
  writeFileSync(join(repo.root, "a.txt"), "a")
  repo.git("add", "a.txt")
  const rejected = repo.git("commit", "-q", "-m", "chore: a\n\nCo-Authored-By: Bot <b@x>")
  assert.notEqual(rejected.status, 0)
  assert.match(rejected.err, /commit\/no-co-author/)
  assert.equal(repo.git("commit", "-q", "-m", "chore: a").status, 0)
})

test("gnam.json 없는 저장소의 commit-msg 는 통과 (설치 전 clone)", () => {
  repo = tempRepo(null)
  const file = join(repo.root, "msg")
  writeFileSync(file, "아무 제목")
  assert.equal(repo.gnam("commit-msg", file).status, 0)
})

test("verify: root 커밋의 변경 파일도 검사한다", () => {
  repo = tempRepo()
  const sha = repo.commit("a.ts", planMessage)
  const r = repo.gnam("verify", "--push", ZERO, sha)
  assert.notEqual(r.status, 0)
  assert.match(r.err, /commit\/plan-files/)
})

test("verify: 경계 (gnam.json format 변경) 이전 커밋은 검사하지 않는다", () => {
  repo = tempRepo(null)
  repo.commit("a.txt", "fix: 도입 전 기록")
  writeFileSync(join(repo.root, "gnam.json"), JSON.stringify({ format: 1, plugins: [] }))
  repo.git("add", "gnam.json")
  repo.git("commit", "-q", "--no-verify", "-m", "chore: gnam 도입")
  const sha = repo.commit("b.txt", "chore: 정상")
  assert.equal(repo.gnam("verify").status, 0)
  // plugins 만 바꾼 커밋은 경계가 아님
  writeFileSync(join(repo.root, "gnam.json"), JSON.stringify({ format: 1, plugins: ["@gnam/merge"] }, null, 2))
  repo.git("add", "gnam.json")
  repo.git("commit", "-q", "--no-verify", "-m", "chore: merge plugin")
  repo.commit("c.txt", "fix: 경계 이후 위반")
  const r = repo.gnam("verify", "--push", ZERO, "HEAD")
  assert.notEqual(r.status, 0)
  assert.match(r.err, /fix: 경계 이후 위반/)
  assert.doesNotMatch(r.err, /도입 전 기록/)
  assert.ok(sha)
})

test("verify: merge 커밋은 첫 부모 대비 파일, plan 제목 merge 는 거부", () => {
  repo = tempRepo()
  repo.commit("base.txt", "chore: base")
  repo.git("checkout", "-q", "-b", "side")
  repo.commit("b.ts", "chore: side")
  repo.git("checkout", "-q", "main")
  repo.git("merge", "-q", "--no-ff", "--no-verify", "side", "-m", planMessage)
  const r = repo.gnam("verify", "--range", "HEAD~1..HEAD")
  assert.notEqual(r.status, 0)
  assert.match(r.err, /commit\/merge-kind/)
})

test("verify: From 이 이후 커밋이면 조상 아님, 먼저 커밋된 plan 은 통과", () => {
  repo = tempRepo()
  mkdirSync(join(repo.root, "specs"))
  const plan = repo.commit("specs/review.md", planMessage)
  const gather = (from: string) =>
    `spec.review.plan: 수집\n\nGoal:\na\n\nTopics: review\n\nPlan:\n1. b\n   From: ${from} 1\n\nBlocking: 없음`
  repo.git("commit", "-q", "--no-verify", "--allow-empty", "-m", gather(plan))
  assert.equal(repo.gnam("verify", "--range", "HEAD~1..HEAD").status, 0)
  repo.git("checkout", "-q", "-b", "side", "HEAD~1")
  const later = repo.commit("b.txt", "chore: 다른 브랜치")
  repo.git("checkout", "-q", "main")
  repo.git("commit", "-q", "--no-verify", "--allow-empty", "-m", gather(later))
  const r = repo.gnam("verify", "--range", "HEAD~1..HEAD")
  assert.notEqual(r.status, 0)
  assert.match(r.err, /조상 아님/)
})

test("plugin add: 빠진 내장 의존 자동 추가, remove: 의존 있으면 거부 · --cascade", () => {
  repo = tempRepo()
  const added = repo.gnam("plugin", "add", "multi-agent")
  assert.equal(added.status, 0, added.err)
  const plugins = () => JSON.parse(readFileSync(join(repo!.root, "gnam.json"), "utf8")).plugins as string[]
  assert.deepEqual([...plugins()].sort(), ["@gnam/merge", "@gnam/multi-agent", "@gnam/run"])
  assert.ok(existsSync(join(repo.root, ".claude/skills/multi-agent/SKILL.md")))
  const refused = repo.gnam("plugin", "remove", "run")
  assert.notEqual(refused.status, 0)
  assert.match(refused.err, /multi-agent/)
  assert.equal(repo.gnam("plugin", "remove", "run", "--cascade").status, 0)
  assert.deepEqual(plugins(), ["@gnam/merge"])
  assert.ok(!existsSync(join(repo.root, ".claude/skills/multi-agent")))
  assert.ok(!existsSync(join(repo.root, ".claude/skills/gnam-run")))
})

test("로컬 plugin: 커밋 종류 추가", () => {
  repo = tempRepo()
  mkdirSync(join(repo.root, "gnam-plugins/docs"), { recursive: true })
  writeFileSync(
    join(repo.root, "gnam-plugins/docs/index.js"),
    `export default { id: "docs", version: "0.1.0", kinds: [{ label: "docs: …", subject: /^docs: /, validate: () => [] }] }\n`,
  )
  assert.equal(repo.gnam("plugin", "add", "./gnam-plugins/docs").status, 0)
  const file = join(repo.root, "msg")
  writeFileSync(file, "docs: README")
  assert.equal(repo.gnam("commit-msg", file).status, 0)
  writeFileSync(file, "fix: x")
  const r = repo.gnam("commit-msg", file)
  assert.notEqual(r.status, 0)
  assert.match(r.err, /'docs: …'/)
})
