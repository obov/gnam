import { spawnSync } from "node:child_process"
import { afterEach, test } from "node:test"
import { expect } from "../expect.ts"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { validateCommit } from "../../src/core/commit.ts"
import { commitInput, gitLookup } from "../../src/core/history.ts"
import type { ReleaseConfig } from "../../src/plugins/release/config.ts"
import releasePlugin from "../../src/plugins/release/index.ts"
import run from "../../src/plugins/run/index.ts"
import { allowedVersions } from "../../src/plugins/release/model.ts"
import { pickVersion, publish, withVersion } from "../../src/plugins/release/release.ts"
import { releaseStates } from "../../src/plugins/release/repo.ts"

const config: ReleaseConfig = { targets: { "packages/a": "semver", "packages/api": "openapi" } }
let root = ""
afterEach(() => rmSync(root, { recursive: true, force: true }))

function git(...args: string[]) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" })
  if (result.status !== 0) throw new Error(result.stderr)
  return result.stdout.trim()
}
const write = (path: string, text: string) => {
  mkdirSync(dirname(join(root, path)), { recursive: true })
  writeFileSync(join(root, path), text)
}
const pkg = (name: string, version: string) => `{\n  "name": "${name}",\n  "version": "${version}"\n}\n`
const spec = (version: string) => `openapi: 3.1.0\ninfo:\n  title: t\n  version: ${version}\n`
const commit = (message: string, ...paths: string[]) => {
  if (paths.length > 0) git("add", ...paths)
  git("commit", "-q", "--allow-empty", "-m", message)
  return git("rev-parse", "HEAD")
}
const check = (sha: string) =>
  validateCommit(
    {
      ...commitInput(root, sha),
      ...gitLookup(root, sha),
      cwd: root,
      view: { kind: "commit", sha },
      config: { format: 1, plugins: ["@gnam/release", "@gnam/run"], release: config },
    },
    [releasePlugin, run],
  ).map((v) => v.rule)

function setup() {
  root = mkdtempSync(join(tmpdir(), "release-"))
  git("init", "-q", "-b", "main")
  git("config", "user.email", "t@t")
  git("config", "user.name", "t")
  write("packages/a/package.json", pkg("@x/a", "1.0.0"))
  write("packages/api/package.json", pkg("@x/api", "0.0.1"))
  write("packages/api/spec/v1.yaml", spec("1.0.0"))
  commit("chore: 시작", ".")
}

test("첫 릴리스 → 새 spec plan 의 impl → minor 이상만 허용 · 검사 · publish", () => {
  setup()
  const first = commit(
    "release: @x/a 1.0.0 · @x/api 1.0.0\n\nPackage: @x/a 1.0.0\n- 첫 릴리스\n\nPackage: @x/api 1.0.0\n- 첫 릴리스",
  )
  expect(check(first)).toEqual([])

  write("specs/x.md", "# x\n")
  const plan = commit("spec.x.plan: 기능\n\nGoal: g\nPlan:\n1. a\nBlocking: 없음", "specs/x.md")
  write("packages/a/src/x.ts", "export {}\n")
  commit(`spec.x.impl: 기능\n\nPlan: ${plan.slice(0, 7)} 1`, "packages/a/src/x.ts")

  const input = releaseStates(root, config, { kind: "worktree" })
  const a = input?.states.find((s) => s.name === "@x/a")
  const api = input?.states.find((s) => s.name === "@x/api")
  if (input === null || a === undefined || api === undefined) throw new Error("states")
  expect(a.evidence().map((e) => e.level)).toEqual(["minor"])
  expect(allowedVersions(a, input.date)).toEqual(["1.1.0", "2.0.0"])
  expect(allowedVersions(api, input.date)).toEqual([])
  expect(pickVersion(a, ["1.1.0", "2.0.0"], "patch")).toBeInstanceOf(Error)
  expect(pickVersion(a, ["1.1.0", "2.0.0"], "major")).toBe("2.0.0")

  // release 가 아닌 커밋의 version 변경
  write("packages/a/package.json", withVersion(pkg("@x/a", "1.0.0"), "1.0.1"))
  const outside = commit("chore: 버전", "packages/a/package.json")
  expect(check(outside)).toEqual(["commit/version-outside"])
  git("reset", "-q", "--hard", "HEAD~1")

  write("packages/a/package.json", withVersion(pkg("@x/a", "1.0.0"), "1.0.1"))
  const low = commit("release: @x/a 1.0.1\n\nPackage: @x/a 1.0.1\n- x", "packages/a/package.json")
  expect(check(low)).toEqual(["commit/release-version"])
  git("reset", "-q", "--hard", "HEAD~1")

  write("packages/a/package.json", withVersion(pkg("@x/a", "1.0.0"), "1.1.0"))
  const release = commit("release: @x/a 1.1.0\n\nPackage: @x/a 1.1.0\n- 기능 추가", "packages/a/package.json")
  expect(check(release)).toEqual([])

  const calls: string[][] = []
  const gh = (args: string[], stdin?: string) => {
    calls.push([...args, stdin ?? ""])
    return { ok: args[1] !== "view" || args[2] === "@x/a@1.0.0", out: "", err: "" }
  }
  expect(publish(root, release, gh)).toEqual([
    "@x/a@1.0.0 있음",
    `@x/api@1.0.0 생성 (${first.slice(0, 7)})`,
    `@x/a@1.1.0 생성 (${release.slice(0, 7)})`,
  ])
  expect(calls.at(-1)).toEqual([
    "release",
    "create",
    "@x/a@1.1.0",
    "--target",
    release,
    "--title",
    "@x/a@1.1.0",
    "--notes-file",
    "-",
    "- 기능 추가",
  ])
})

test("openapi: 새 v<N>.yaml = 새 버전, 설정 없이 release 제목은 실패", () => {
  setup()
  commit("release: @x/a 1.0.0 · @x/api 1.0.0\n\nPackage: @x/a 1.0.0\n- a\n\nPackage: @x/api 1.0.0\n- a")
  write("packages/api/spec/v2.yaml", spec("2.0.0"))
  commit("chore: v2", "packages/api/spec/v2.yaml")
  const input = releaseStates(root, config, { kind: "worktree" })
  const api = input?.states.find((s) => s.name === "@x/api")
  if (input === null || api === undefined) throw new Error("states")
  expect(allowedVersions(api, input.date)).toEqual(["2.0.0"])
  const release = commit("release: @x/api 2.0.0\n\nPackage: @x/api 2.0.0\n- v2")
  expect(check(release)).toEqual([])
  expect(
    validateCommit(
      { ...commitInput(root, release), ...gitLookup(root, release), cwd: root, view: { kind: "commit", sha: release } },
      [releasePlugin],
    ).map((v) => v.rule),
  ).toEqual(["commit/release-target"])
})
