import { test } from "node:test"
import { expect } from "./expect.ts"
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { collectStatus } from "../src/core/status.ts"
import { tempRepo } from "./helpers.ts"

test("status 트리: 키 순서 · plugin · 종류 · config · install", async () => {
  const repo = tempRepo({ format: 1, plugins: ["@gnam/recall"] })
  try {
    const tree = await collectStatus({ cwd: repo.root })
    expect(Object.keys(tree)).toEqual(["schema", "gnam", "project", "config", "plugins", "builtins", "kinds", "install", "problems", "handoff", "env", "trace"])
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
