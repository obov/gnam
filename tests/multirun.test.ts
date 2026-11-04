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
  const plan = (field: string) => `spec.workspace.plan: 조합 재진행\n\nSummary: s\n\nGoal:\na\n\nPlan:\n1. b\n   완료: c\n\nBlocking: 없음\n\n${field}`
  expect(rules(plan("Multirun: eee0002 combine"))).toEqual([])
  expect(rules("spec.workspace.merge: v1 채택\n\nMultirun: eee0002 v1")).toEqual([])
  expect(rules("spec.workspace.merge: v3 채택\n\nMultirun: eee0002 v3")).toEqual(["commit/multirun-decision"])
  expect(rules("spec.workspace.merge: 채택\n\nMultirun: eee0001 v1")).toEqual(["commit/multirun-decision"])
  expect(rules("spec.billing.merge: 채택\n\nMultirun: eee0002 v1")).toEqual(["commit/multirun-decision"])
  expect(rules("chore: 폐기 기록\n\nMultirun: eee0002 discard")).toEqual([])
})

// ── 명령 (임시 저장소 · clone 위치 XDG_CACHE_HOME) ─────────────────

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { spawnSync } from "node:child_process"
import { PACKAGE, type Repo, tempRepo } from "./helpers.ts"

const PLAN = "spec.workspace.plan: 이름 유일성\n\nSummary: s\n\nGoal:\na\n\nPlan:\n1. b\n   완료: c\n\nBlocking: 없음"

/** setup = 설치 흉내 (node_modules/@obov/gnam → 이 패키지) */
const INSTALL = `mkdir -p node_modules/@obov && ln -s '${PACKAGE}' node_modules/@obov/gnam`
function setupRun(gnam: object = { format: 1, plugins: ["@gnam/harness", "@gnam/multirun"], multirun: { setup: INSTALL } }) {
  const home = mkdtempSync(join(tmpdir(), "multirun-home-"))
  process.env["XDG_CACHE_HOME"] = join(home, "cache")
  process.env["CLAUDE_CONFIG_DIR"] = join(home, "claude")
  const repo = tempRepo(gnam)
  repo.git("add", "gnam.json")
  repo.git("commit", "-q", "--no-verify", "-m", "chore: gnam")
  writeFileSync(join(repo.root, ".gitignore"), "node_modules/\n.env\n")
  repo.git("add", ".gitignore")
  repo.git("commit", "-q", "--no-verify", "-m", "chore: ignore")
  expect(repo.gnam("link").status).toBe(0)
  repo.git("add", "-A")
  repo.git("commit", "-q", "--no-verify", "-m", "chore: gnam link")
  writeFileSync(join(repo.root, ".env"), "SECRET=1\n")
  const plan = repo.git("commit", "-q", "--no-verify", "--allow-empty", "-m", PLAN).status === 0 ? repo.git("rev-parse", "HEAD").out.trim() : ""
  const inClone = (dir: string, ...args: string[]) =>
    spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], { cwd: dir, encoding: "utf8" })
  const state = (id: string) => JSON.parse(readFileSync(join(repo.root, ".git/gnam/multirun", id, "state.json"), "utf8"))
  const done = () => {
    repo.cleanup()
    rmSync(home, { recursive: true, force: true })
  }
  return { repo, home, plan, inClone, state, done }
}

/** clone 에서 impl 커밋 + variant 커밋 */
function work(inClone: (dir: string, ...args: string[]) => unknown, clone: string, id: string, file = "a.ts") {
  writeFileSync(join(clone, file), "export const a = 1\n")
  inClone(clone, "add", file)
  inClone(clone, "commit", "-q", "--no-verify", "-m", "spec.workspace.impl: a\n\nPlan: x 1")
  inClone(
    clone,
    "commit",
    "-q",
    "--no-verify",
    "--allow-empty",
    "-m",
    `multirun.workspace.variant: 완료\n\nId: ${id}\nApproach: single, 작음\nPlugins: 없음\nChecks: npm test pass\nDecisions: D1: x\nDeviation: 없음\nRemaining: 없음`,
  )
}

function commitStart(repo: Repo, id: string) {
  const file = join(repo.root, ".git/gnam/multirun", id, "start-message.txt")
  writeFileSync(file, readFileSync(file, "utf8").replaceAll("model=?", "model=claude-opus-5-5").replaceAll("effort=?", "effort=high"))
  const r = repo.git("commit", "-q", "--allow-empty", "-F", file)
  expect(r.status).toBe(0)
  return repo.git("rev-parse", "HEAD").out.trim()
}

test("start: plan 검사 · clone (remote 없음 · 브랜치 vN · tag 없음) · .env 복사 · state · 초안", () => {
  const t = setupRun()
  try {
    t.repo.git("tag", "old")
    const r = t.repo.gnam("run", "multirun", "start", t.plan.slice(0, 7), "-n", "2", "--agent", "v2=codex")
    expect(r.status).toBe(0)
    const id = `${t.plan.slice(0, 7)}-1`
    const s = t.state(id)
    expect(s.variants.map((v: { name: string }) => v.name)).toEqual(["v1", "v2"])
    expect(s.variants[1].session).toBe("na")
    for (const v of s.variants) {
      expect(t.inClone(v.clone, "remote").stdout).toBe("")
      expect(t.inClone(v.clone, "branch", "--format=%(refname:short)").stdout.trim()).toBe(v.name)
      expect(t.inClone(v.clone, "tag").stdout).toBe("")
      expect(readFileSync(join(v.clone, ".env"), "utf8")).toBe("SECRET=1\n")
      expect(t.inClone(v.clone, "config", "core.hooksPath").stdout.trim()).toBe(".githooks")
    }
    expect(r.out).toContain(`Id: ${id}`)
    expect(r.out).toContain("agent=codex session=na")
    const again = t.repo.gnam("run", "multirun", "start", t.plan, "-n", "2")
    expect(again.status).toBe(0)
    expect(again.out).toContain(`${t.plan.slice(0, 7)}-2`)
  } finally {
    t.done()
  }
})

test("start: Blocking 남은 plan · setup 실패 → exit 1, clone · 상태 없음", () => {
  const t = setupRun({ format: 1, plugins: ["@gnam/harness", "@gnam/multirun"], multirun: { setup: "echo 설치오류; exit 3" } })
  try {
    t.repo.git("commit", "-q", "--no-verify", "--allow-empty", "-m", "spec.workspace.plan: 설계\n\nSummary: s\n\nGoal:\na\n\nBlocking:\nB1. 정책")
    const blocked = t.repo.gnam("run", "multirun", "start", "HEAD", "-n", "2")
    expect(blocked.status).toBe(1)
    expect(blocked.err).toContain("Blocking")
    const failed = t.repo.gnam("run", "multirun", "start", t.plan, "-n", "2")
    expect(failed.status).toBe(1)
    expect(failed.err).toContain("설치오류")
    expect(existsSync(join(t.home, "cache/gnam/multirun")) ? readdirNames(join(t.home, "cache/gnam/multirun")) : []).toEqual([])
    expect(existsSync(join(t.repo.root, ".git/gnam/multirun", `${t.plan.slice(0, 7)}-1`))).toBe(false)
  } finally {
    t.done()
  }
})

const readdirNames = (dir: string) => (existsSync(dir) ? (spawnSync("ls", [dir], { encoding: "utf8" }).stdout.split("\n").filter(Boolean)) : [])

test("sync · status: clone 의 브랜치 · tag → 보존 tag 같은 hash, 미sync · dirty · variant 표시, 요약 줄", () => {
  const t = setupRun()
  try {
    t.repo.gnam("run", "multirun", "start", t.plan, "-n", "2")
    const id = `${t.plan.slice(0, 7)}-1`
    const [v1, v2] = t.state(id).variants
    work(t.inClone, v1.clone, id)
    t.inClone(v1.clone, "branch", "side")
    t.inClone(v1.clone, "tag", "mark")
    writeFileSync(join(v2.clone, "wip.ts"), "x")
    const before = JSON.parse(t.repo.gnam("run", "multirun", "status", id, "--json").out).runs[0]
    expect(before.variants.map((v: { synced: boolean }) => v.synced)).toEqual([false, false])
    expect(before.variants[1].dirty).toEqual(["untracked 파일"])
    expect(before.variants[0].variant).not.toBe(null)
    expect(t.repo.gnam("status").out).toContain(`multirun ${id} 미sync clone v1 v2`)
    expect(t.repo.gnam("run", "multirun", "sync").status).toBe(0)
    const tip = t.inClone(v1.clone, "rev-parse", "v1").stdout.trim()
    expect(t.repo.git("rev-parse", `refs/tags/multirun/${id}/v1/heads/v1`).out.trim()).toBe(tip)
    expect(t.repo.git("rev-parse", `refs/tags/multirun/${id}/v1/heads/side`).out.trim()).toBe(t.inClone(v1.clone, "rev-parse", "side").stdout.trim())
    expect(t.repo.git("rev-parse", `refs/tags/multirun/${id}/v1/tags/mark`).out.trim()).toBe(t.inClone(v1.clone, "rev-parse", "mark").stdout.trim())
    const after = JSON.parse(t.repo.gnam("run", "multirun", "status", "--json").out).runs[0]
    expect(after.variants.map((v: { synced: boolean }) => v.synced)).toEqual([true, true])
    const summary = t.repo.gnam("status").out
    expect(summary).not.toContain("미sync")
    expect(summary).toContain(`multirun ${id} report 없음`)
  } finally {
    t.done()
  }
})

test("collect · open: clone 삭제 후에도 tag 기준 commits · variant 필드 · numstat · usage", () => {
  const t = setupRun()
  try {
    t.repo.gnam("run", "multirun", "start", t.plan, "-n", "2")
    const id = `${t.plan.slice(0, 7)}-1`
    const [v1, v2] = t.state(id).variants
    commitStart(t.repo, id)
    work(t.inClone, v1.clone, id)
    work(t.inClone, v2.clone, id, "b.ts")
    const at = new Date().toISOString()
    mkdirSync(join(t.home, "claude/projects/p"), { recursive: true })
    writeFileSync(
      join(t.home, "claude/projects/p", `${v1.session}.jsonl`),
      [
        { type: "assistant", timestamp: at, requestId: "r1", effort: "high", version: "2.1.300", message: { model: "claude-opus-5-5", usage: { input_tokens: 10, output_tokens: 500 } } },
        { type: "system", subtype: "turn_duration", durationMs: 180000, timestamp: at },
      ]
        .map((e) => JSON.stringify(e))
        .join("\n"),
    )
    t.repo.gnam("run", "multirun", "sync", id)
    rmSync(v2.clone, { recursive: true, force: true })
    const r = t.repo.gnam("run", "multirun", "collect", id)
    expect(r.status).toBe(0)
    const data = JSON.parse(r.out)
    expect(data.start).not.toBe(null)
    const [c1, c2] = data.variants
    expect(c1.commits.map((c: { subject: string }) => c.subject)).toEqual(["multirun.workspace.variant: 완료", "spec.workspace.impl: a"])
    expect(c1.variant.Approach).toBe("single, 작음")
    expect(c1.numstat).toEqual([{ path: "a.ts", added: 1, deleted: 0 }])
    expect(c1.lines).toBe(1)
    expect(typeof c1.wall_min).toBe("number")
    expect(c1.usage.out).toBe(500)
    expect(c1.usage.active_min).toBe(3)
    expect(c2.numstat[0].path).toBe("b.ts")
    expect(c2.usage).toBe(null)
    const opened = t.repo.gnam("run", "multirun", "open", id, "v2")
    expect(opened.status).toBe(0)
    expect(readFileSync(join(opened.out.trim(), "b.ts"), "utf8")).toBe("export const a = 1\n")
  } finally {
    t.done()
  }
})

test("close: report 없음 · 미커밋 · untracked · stash · 미보존 거부 → clone 유지, 통과 시 삭제 · tag 유지 · --push", () => {
  const t = setupRun()
  try {
    t.repo.gnam("run", "multirun", "start", t.plan, "-n", "2")
    const id = `${t.plan.slice(0, 7)}-1`
    const [v1, v2] = t.state(id).variants
    const startHash = commitStart(t.repo, id)
    work(t.inClone, v1.clone, id)
    expect(t.repo.gnam("run", "multirun", "close", id).err).toContain("report 커밋 없음")

    const aborted = t.repo.gnam("run", "multirun", "abort", id)
    expect(aborted.status).toBe(0)
    expect(aborted.out).toContain("Outcome: aborted")
    expect(aborted.out).toContain(`Start: ${startHash.slice(0, 7)}`)
    const file = join(t.repo.root, ".git/gnam/multirun", id, "report-message.txt")
    writeFileSync(file, readFileSync(file, "utf8").replace("model=? effort=?", "model=claude-opus-5-5 effort=medium").replaceAll("model=? ", "model=claude-opus-5-5 ").replaceAll("effort=? ", "effort=high "))
    const committed = t.repo.git("commit", "-q", "--allow-empty", "-F", file)
    expect(committed.err).toBe("")

    const cases: [string, () => void, () => void][] = [
      ["미커밋 변경", () => writeFileSync(join(v2.clone, "gnam.json"), "{}"), () => t.inClone(v2.clone, "checkout", "--", "gnam.json")],
      ["untracked 파일", () => writeFileSync(join(v2.clone, "new.ts"), "x"), () => rmSync(join(v2.clone, "new.ts"))],
      [
        "stash",
        () => {
          writeFileSync(join(v2.clone, "gnam.json"), "{}")
          t.inClone(v2.clone, "stash", "-q")
        },
        () => t.inClone(v2.clone, "stash", "drop", "-q"),
      ],
    ]
    for (const [reason, make, undo] of cases) {
      make()
      const r = t.repo.gnam("run", "multirun", "close", id)
      expect(r.status).toBe(1)
      expect(r.out).toContain(reason)
      expect(existsSync(v2.clone)).toBe(true)
      undo()
    }
    const remote = join(t.home, "remote.git")
    spawnSync("git", ["init", "-q", "--bare", remote])
    const r = t.repo.gnam("run", "multirun", "close", id, "--push", remote)
    expect(r.status).toBe(0)
    expect(existsSync(v1.clone)).toBe(false)
    expect(existsSync(v2.clone)).toBe(false)
    expect(t.repo.git("tag", "-l", `multirun/${id}/*`).out).toContain(`multirun/${id}/v1/heads/v1`)
    expect(spawnSync("git", ["tag", "-l"], { cwd: remote, encoding: "utf8" }).stdout).toContain(`multirun/${id}/v1/heads/v1`)
    expect(t.state(id).closed).not.toBe(null)
    expect(t.repo.gnam("status").out).not.toContain(`multirun ${id}`)
  } finally {
    t.done()
  }
})

test("clone 의 link 는 clone 자신의 gnam (설치본 → gnam 패키지 자체 → 실행 중인 gnam)", async () => {
  const { gnamBinFor } = await import("../src/plugins/multirun/commands.ts")
  const dir = mkdtempSync(join(tmpdir(), "multirun-bin-"))
  try {
    expect(gnamBinFor(dir)).toBe(join(PACKAGE, "bin", "gnam.js"))
    mkdirSync(join(dir, "bin"))
    writeFileSync(join(dir, "bin/gnam.js"), "")
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "@obov/gnam" }))
    expect(gnamBinFor(dir)).toBe(join(dir, "bin/gnam.js"))
    mkdirSync(join(dir, "node_modules/@obov/gnam/bin"), { recursive: true })
    writeFileSync(join(dir, "node_modules/@obov/gnam/bin/gnam.js"), "")
    expect(gnamBinFor(dir)).toBe(join(dir, "node_modules/@obov/gnam/bin/gnam.js"))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
