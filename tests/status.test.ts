import { test } from "node:test"
import { expect } from "./expect.ts"
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { collectStatus, summaryOf } from "../src/core/status.ts"
import { PACKAGE, tempRepo } from "./helpers.ts"
import { commit, fixture } from "./trace-fixture.ts"

test("status 트리: 키 순서 · plugin · 종류 · config · install", async () => {
  const repo = tempRepo({ format: 1, plugins: ["@gnam/recall"] })
  try {
    const tree = await collectStatus({ cwd: repo.root })
    expect(Object.keys(tree)).toEqual(["schema", "gnam", "project", "config", "plugins", "builtins", "kinds", "rules", "install", "problems", "handoff", "env", "trace"])
    expect(tree["schema"]).toBe(1)
    expect(tree["gnam"]).toMatchObject({ format: 1, source: "checkout" })
    expect(tree["config"]).toMatchObject({ raw: { format: 1, plugins: ["@gnam/recall"] }, effective: { format: 1 } })
    expect(tree["plugins"]).toMatchObject({
      recall: { spec: "@gnam/recall", kind: "builtin", commands: [{ name: "search", json: false }], agentsMd: true, configProblems: [] },
    })
    expect((tree["builtins"] as { id: string; active: boolean }[]).find((b) => b.id === "recall")?.active).toBe(true)
    expect((tree["builtins"] as { id: string; requires: string[] }[]).find((b) => b.id === "multi-agent")?.requires).toEqual(["run", "merge"])
    expect((tree["kinds"] as { owner: string }[]).every((k) => k.owner === "core")).toBe(true)
    expect(tree["install"]).toMatchObject({ hooks: { expected: ".githooks", commitMsg: false }, agentsMd: { exists: false, inSync: false } })
    expect((tree["problems"] as { source: string }[]).some((p) => p.source === "install")).toBe(true)
    expect(tree["handoff"]).toMatchObject({ exists: false, content: null, modifiedAt: null })
    expect(tree["env"]).toMatchObject({ worktree: false, branch: "main" })
  } finally {
    repo.cleanup()
  }
})

test("status 트리: 인계 메모 본문 · 변경 시각", async () => {
  const repo = tempRepo()
  try {
    mkdirSync(join(repo.root, ".git", "gnam"), { recursive: true })
    writeFileSync(join(repo.root, ".git", "gnam", "handoff.md"), "Next: 2단계\n")
    const tree = await collectStatus({ cwd: repo.root, paths: ["handoff"] })
    const handoff = tree["handoff"] as { exists: boolean; content: string; modifiedAt: string }
    expect(handoff.exists).toBe(true)
    expect(handoff.content).toBe("Next: 2단계\n")
    expect(Number.isNaN(Date.parse(handoff.modifiedAt))).toBe(false)
  } finally {
    repo.cleanup()
  }
})

test("status 트리: gnam.json 없음 · 깨짐 · plugin 로드 실패는 problems 로", async () => {
  const none = tempRepo(null)
  const broken = tempRepo()
  const failing = tempRepo({ format: 1, plugins: ["./nope", "@gnam/recall"] })
  try {
    const a = await collectStatus({ cwd: none.root })
    expect(a["config"]).toMatchObject({ raw: null, effective: null })
    expect(a["plugins"]).toEqual({})
    expect(a["problems"]).toMatchObject([{ source: "config" }])

    writeFileSync(join(broken.root, "gnam.json"), "{ nope")
    const b = await collectStatus({ cwd: broken.root })
    expect((b["problems"] as { source: string; message: string }[])[0]?.message).toContain("JSON 아님")

    const c = await collectStatus({ cwd: failing.root })
    expect(Object.keys(c["plugins"] as object)).toEqual(["./nope", "recall"])
    expect((c["plugins"] as Record<string, { error?: string; kind: string }>)["./nope"]).toMatchObject({ kind: "local" })
    expect((c["plugins"] as Record<string, { error?: string }>)["./nope"]?.error).toContain("진입 파일 없음")
    expect((c["problems"] as { source: string }[]).some((p) => p.source === "plugin:./nope")).toBe(true)
  } finally {
    for (const r of [none, broken, failing]) r.cleanup()
  }
})

test("status 트리: 고른 경로의 최상위 키만 계산", async () => {
  const repo = tempRepo()
  try {
    const tree = await collectStatus({ cwd: repo.root, paths: ["gnam.version"] })
    expect(Object.keys(tree)).toEqual(["gnam"])
  } finally {
    repo.cleanup()
  }
})

test("요약: 문제 · 인계 메모 · 요청 · plan (최근부터 · 외 N) · Blocking · 미결 · 내용 없는 줄 생략", async () => {
  const repo = tempRepo(null)
  try {
    const f = fixture(repo)
    writeFileSync(join(repo.root, "gnam.json"), JSON.stringify({ format: 1, plugins: [] }))
    for (let i = 0; i < 5; i++) commit(repo, `spec.c.plan: 추가 ${i}\n\nGoal:\ng\n\nPlan:\n1. x\n\nBlocking: 없음`)
    mkdirSync(join(repo.root, ".git", "gnam"), { recursive: true })
    writeFileSync(join(repo.root, ".git", "gnam", "handoff.md"), "State:\n진행 중\n\nNext:\nrequest 2단계\n")
    const text = await summaryOf(repo.root)
    const lines = text.trimEnd().split("\n")
    expect(lines[0]).toMatch(/^gnam \d+\.\d+\.\d+\S* · plugins 없음 · 문제 \d+$/)
    expect(lines.filter((l) => l.startsWith("- ")).length).toBeGreaterThan(0)
    const rest = lines.filter((l) => !l.startsWith("- ")).slice(1)
    const s = (sha: string) => sha.slice(0, 7)
    expect(rest[0]).toBe("인계 메모  있음 · Next: request 2단계")
    expect(rest[1]).toBe("요청       미착수 1 · 진행 1")
    expect(rest[2]).toMatch(/^plan       c [0-9a-f]{7} 0\/1 · c [0-9a-f]{7} 0\/1 · c [0-9a-f]{7} 0\/1 · c [0-9a-f]{7} 0\/1 · c [0-9a-f]{7} 0\/1 · 외 2$/)
    expect(rest[3]).toBe(`Blocking   a ${s(f.p4)} B1 새 결정`)
    expect(rest[4]).toBe(`           a ${s(f.p4)} B2 둘째`)
    expect(rest[5]).toBe("미결       specs/a.md:4 · specs/a.md:7")
    expect(rest).toHaveLength(6)
  } finally {
    repo.cleanup()
  }
})

test("요약: 빈 저장소는 첫 줄 · 인계 메모 줄만", async () => {
  const repo = tempRepo()
  try {
    const lines = (await summaryOf(repo.root)).trimEnd().split("\n").filter((l) => !l.startsWith("- "))
    expect(lines.slice(1)).toEqual(["인계 메모  없음"])
  } finally {
    repo.cleanup()
  }
})

test("rules: 소스의 모든 rule id 가 core · 내장 plugin rules 에 있다", async () => {
  const { readdirSync, readFileSync, statSync } = await import("node:fs")
  const files: string[] = []
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name)
      if (statSync(path).isDirectory()) walk(path)
      else if (path.endsWith(".ts")) files.push(path)
    }
  }
  walk(join(PACKAGE, "src"))
  const used = new Set<string>()
  for (const file of files) {
    const text = readFileSync(file, "utf8")
    for (const m of text.matchAll(/rule: "([a-z]+\/[a-z0-9-]+)"/g)) used.add(m[1] ?? "")
    for (const m of text.matchAll(/rule: "([a-z0-9-]+)"/g)) used.add(`commit/${m[1] ?? ""}`)
    for (const m of text.matchAll(/(?:add|problem)\(\s*"([a-z0-9-]+)"/g)) used.add(`commit/${m[1] ?? ""}`)
  }
  const { CORE_RULES } = await import("../src/core/rules.ts")
  const { builtinIds, loadPlugin } = await import("../src/core/loader.ts")
  const known = new Set(CORE_RULES.map((r) => r.id))
  for (const id of builtinIds()) for (const r of (await loadPlugin(`@gnam/${id}`, PACKAGE)).plugin.rules ?? []) known.add(r.id)
  expect([...used].filter((id) => !known.has(id))).toEqual([])
  expect(used.size).toBeGreaterThan(25)
  const repo = tempRepo({ format: 1, plugins: ["@gnam/request"] })
  try {
    const tree = await collectStatus({ cwd: repo.root, paths: ["rules"] })
    const rules = tree["rules"] as { id: string; owner: string }[]
    expect(rules.some((r) => r.id === "commit/request-link" && r.owner === "request")).toBe(true)
    expect(rules.some((r) => r.id === "commit/impl-ready" && r.owner === "core")).toBe(true)
  } finally {
    repo.cleanup()
  }
})
