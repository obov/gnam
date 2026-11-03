import { spawnSync } from "node:child_process"
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  rmSync,
  statSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import { expect } from "./expect.ts"
import { tempRepo } from "./helpers.ts"
import { isLink } from "../src/core/project.ts"
import { configProblems } from "../src/core/config.ts"
import { type Loaded, pluginProblems } from "../src/core/loader.ts"
import type { GnamPlugin } from "../src/core/plugin.ts"
import { contentHash, fetchSkill, parseSource, skillDepProblems, skillsLockProblems } from "../src/core/skills.ts"

const plugin = (id: string, skillDeps?: unknown): GnamPlugin => ({ id, version: "0.1.0", skillDeps } as GnamPlugin)
const loaded = (...plugins: GnamPlugin[]): Loaded[] =>
  plugins.map((p) => ({ spec: `./${p.id}`, kind: "local", root: `/x/${p.id}`, plugin: p }))
const dep = { name: "harness-execute", source: "github:obov/agent-skills/harness-execute", ref: "v1.2.0" }
const lock = {
  source: dep.source,
  ref: dep.ref,
  commit: "a".repeat(40),
  sha256: "b".repeat(64),
  by: ["multirun"],
}

test("source: github:<owner>/<repo>[/<경로>]", () => {
  expect(parseSource("github:obov/agent-skills")).toEqual({ owner: "obov", repo: "agent-skills", path: "" })
  expect(parseSource("github:obov/agent-skills/a/b")).toEqual({ owner: "obov", repo: "agent-skills", path: "a/b" })
  for (const bad of ["obov/agent-skills", "github:obov", "github:obov/r/../x", "github:obov/r//x", "github:obov/r/", "gitlab:o/r", "github:../r"])
    expect(parseSource(bad)).toBeNull()
})

test("선언: name 형식 · source 접두 · 빈 ref", () => {
  expect(skillDepProblems(plugin("p"))).toEqual([])
  expect(skillDepProblems(plugin("p", [dep]))).toEqual([])
  expect(skillDepProblems(plugin("p", [{ ...dep, name: "Harness" }]))[0]).toContain("skillDeps[0].name")
  expect(skillDepProblems(plugin("p", [{ ...dep, source: "obov/agent-skills" }]))[0]).toContain("skillDeps[0].source")
  expect(skillDepProblems(plugin("p", [{ ...dep, ref: " " }]))[0]).toContain("skillDeps[0].ref 빈 값")
  expect(skillDepProblems(plugin("p", "x"))).toEqual(["p: skillDeps = 배열"])
  expect(skillDepProblems(plugin("p", [null]))[0]).toContain("skillDeps[0] = 객체")
})

test("pluginProblems: 선언 문제 · 같은 name 다른 source · id 'skills' 금지", () => {
  const config = { format: 1, plugins: [] }
  expect(pluginProblems(loaded(plugin("a", [dep]), plugin("b", [{ ...dep, ref: "main" }])), config)).toEqual([])
  expect(pluginProblems(loaded(plugin("a", [dep]), plugin("b", [{ ...dep, source: "github:x/y" }])), config)).toEqual([
    "b: 스킬 harness-execute 출처 충돌 (b github:x/y · a github:obov/agent-skills/harness-execute)",
  ])
  expect(pluginProblems(loaded(plugin("a", [{ ...dep, ref: "" }])), config)).toEqual(["a: skillDeps[0].ref 빈 값"])
  expect(pluginProblems(loaded(plugin("skills")), config)[0]).toStartWith("skills: plugin id 로 쓸 수 없음")
})

test("잠금: commit 40자 · sha256 64자 · 빈 by · 형식", () => {
  expect(skillsLockProblems(undefined)).toEqual([])
  expect(skillsLockProblems({ "harness-execute": lock })).toEqual([])
  expect(skillsLockProblems([])).toEqual(["skills = 객체 (name → 잠금)"])
  expect(skillsLockProblems({ "harness-execute": { ...lock, commit: "abc" } })).toEqual(["skills.harness-execute.commit = 40자 hex"])
  expect(skillsLockProblems({ "harness-execute": { ...lock, sha256: "b".repeat(63) } })).toEqual([
    "skills.harness-execute.sha256 = 64자 hex",
  ])
  expect(skillsLockProblems({ "harness-execute": { ...lock, by: [] } })).toEqual(["skills.harness-execute.by = plugin id 배열 (1개 이상)"])
  expect(skillsLockProblems({ "harness-execute": { ...lock, source: "x" } })[0]).toContain(".source")
  expect(skillsLockProblems({ "harness-execute": { ...lock, ref: "" } })[0]).toContain(".ref 빈 값")
  expect(skillsLockProblems({ Bad: lock })[0]).toContain("skills.Bad: 이름")
  expect(skillsLockProblems({ x: "y" })[0]).toContain("skills.x = 객체")
})

test("configProblems 가 gnam.json skills 를 검사", () => {
  expect(configProblems({ format: 1, plugins: [], skills: { h: lock } })).toEqual([])
  expect(configProblems({ format: 1, plugins: [], skills: { h: { ...lock, commit: "x" } } })).toEqual(["skills.h.commit = 40자 hex"])
})

// ---------- 받기 ----------

/** 로컬 bare 저장소 <base>/obov/agent-skills.git. v1 tag · dev 브랜치 · 저장소 밖 symlink · 실행 파일 */
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "gnam-skills-"))
  const work = join(root, "work")
  const g = (cwd: string, ...args: string[]) => {
    const r = spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], { cwd, encoding: "utf8" })
    if (r.status !== 0) throw new Error(r.stderr)
    return r.stdout.trim()
  }
  mkdirSync(join(work, "harness-execute", "adapters"), { recursive: true })
  mkdirSync(join(work, "no-skill"), { recursive: true })
  g(root, "init", "-q", "-b", "main", work)
  writeFileSync(join(work, "harness-execute", "SKILL.md"), "---\nname: harness-execute\n---\nv1\n")
  writeFileSync(join(work, "harness-execute", "adapters", "a.md"), "a\n")
  writeFileSync(join(work, "harness-execute", "run.sh"), "#!/bin/sh\n")
  chmodSync(join(work, "harness-execute", "run.sh"), 0o755)
  symlinkSync("/etc/hosts", join(work, "harness-execute", "outside"))
  writeFileSync(join(work, "no-skill", "README.md"), "x\n")
  writeFileSync(join(work, "README.md"), "root\n")
  g(work, "add", "-A")
  g(work, "commit", "-q", "-m", "v1")
  const v1 = g(work, "rev-parse", "HEAD")
  g(work, "tag", "v1")
  g(work, "checkout", "-q", "-b", "dev")
  writeFileSync(join(work, "harness-execute", "SKILL.md"), "---\nname: harness-execute\n---\ndev\n")
  g(work, "commit", "-q", "-am", "dev")
  const dev = g(work, "rev-parse", "HEAD")
  g(work, "checkout", "-q", "main")
  mkdirSync(join(root, "base", "obov"), { recursive: true })
  g(root, "clone", "-q", "--bare", work, join(root, "base", "obov", "agent-skills.git"))
  const project = join(root, "project")
  mkdirSync(project)
  return { root, project, base: join(root, "base"), v1, dev }
}

test("받기: tag · branch · sha ref 가 commit 으로 잠김 · symlink 제외 · 실행 비트 유지", () => {
  const f = fixture()
  process.env["GNAM_SKILL_GIT_BASE"] = f.base
  try {
    const byTag = fetchSkill(f.project, { ...dep, ref: "v1" })
    expect(byTag.commit).toBe(f.v1)
    expect(byTag.skipped).toEqual(["outside"])
    const target = join(f.project, ".gnam", "skills", "harness-execute")
    expect(readdirSync(target).sort()).toEqual(["SKILL.md", "adapters", "run.sh"])
    expect(statSync(join(target, "run.sh")).mode & 0o111).toBeGreaterThan(0)
    expect(byTag.sha256).toBe(contentHash(target))
    expect(fetchSkill(f.project, { ...dep, ref: f.v1.slice(0, 10) }).commit).toBe(f.v1)
    const byBranch = fetchSkill(f.project, { ...dep, ref: "dev" })
    expect(byBranch.commit).toBe(f.dev)
    expect(readFileSync(join(target, "SKILL.md"), "utf8")).toContain("dev")
    expect(byBranch.sha256).not.toBe(byTag.sha256)
    expect(readdirSync(join(f.project, ".gnam", "skills"))).toEqual(["harness-execute"])
  } finally {
    delete process.env["GNAM_SKILL_GIT_BASE"]
    rmSync(f.root, { recursive: true, force: true })
  }
})

test("받기 실패: SKILL.md 없음 · 경로 없음 · ref 없음 → 기존 디렉터리 유지", () => {
  const f = fixture()
  process.env["GNAM_SKILL_GIT_BASE"] = f.base
  try {
    const first = fetchSkill(f.project, { ...dep, ref: "v1" })
    const target = join(f.project, ".gnam", "skills", "harness-execute")
    const bad = [
      { ...dep, ref: "v1", source: "github:obov/agent-skills/no-skill" },
      { ...dep, ref: "v1", source: "github:obov/agent-skills/missing" },
      { ...dep, ref: "nope" },
      { ...dep, ref: "v1", source: "github:obov/none" },
      { ...dep, ref: "v1", source: "github:obov/agent-skills" },
    ]
    const messages = bad.map((d) => {
      try {
        fetchSkill(f.project, d)
        return "통과"
      } catch (error) {
        return (error as Error).message
      }
    })
    expect(messages[0]).toContain("SKILL.md 없음")
    expect(messages[1]).toContain("경로 없음")
    expect(messages[2]).toContain("ref 없음: nope")
    expect(messages[3]).toContain("git clone")
    expect(messages[4]).toContain("SKILL.md 없음")
    expect(contentHash(target)).toBe(first.sha256)
    expect(readdirSync(join(f.project, ".gnam", "skills"))).toEqual(["harness-execute"])
  } finally {
    delete process.env["GNAM_SKILL_GIT_BASE"]
    rmSync(f.root, { recursive: true, force: true })
  }
})

// ---------- 수명 ----------

test("수명: plugin 둘이 같은 스킬 → 하나 remove 유지 · 둘 다 remove 삭제 · link 는 받지 않고 링크만 복구", () => {
  const f = fixture()
  const repo = tempRepo()
  process.env["GNAM_SKILL_GIT_BASE"] = f.base
  const declare = (id: string, ref: string) => {
    mkdirSync(join(repo.root, id))
    writeFileSync(
      join(repo.root, id, "index.mjs"),
      `export default ${JSON.stringify({ id, version: "0.1.0", skillDeps: [{ ...dep, ref }] })}\n`,
    )
  }
  const lockOf = () => (JSON.parse(readFileSync(join(repo.root, "gnam.json"), "utf8")) as { skills?: Record<string, { by: string[]; commit: string; ref: string }> }).skills
  const vendored = join(repo.root, ".gnam", "skills", "harness-execute")
  const links = [".claude/skills/harness-execute", ".agents/skills/harness-execute"].map((l) => join(repo.root, l))
  try {
    declare("pa", "v1")
    declare("pb", "dev")
    const a = repo.gnam("plugin", "add", "./pa")
    expect(a.status).toBe(0)
    expect(a.out).toContain(`스킬 harness-execute 받음 ${dep.source}@v1 = ${f.v1.slice(0, 7)}`)
    expect(a.out).toContain("받지 않은 symlink · 특수 파일 outside")
    expect(lockOf()?.["harness-execute"]).toMatchObject({ ref: "v1", commit: f.v1, by: ["pa"] })
    for (const link of links) {
      expect(readlinkSync(link)).toBe("../../.gnam/skills/harness-execute")
      expect(existsSync(join(link, "SKILL.md"))).toBe(true)
    }

    const b = repo.gnam("plugin", "add", "./pb")
    expect(b.status).toBe(0)
    expect(b.out).toContain("스킬 harness-execute: pb 가 ref dev 선언, 잠금 v1 유지")
    expect(lockOf()?.["harness-execute"]).toMatchObject({ commit: f.v1, by: ["pa", "pb"] })

    expect(repo.gnam("plugin", "remove", "pa").status).toBe(0)
    expect(lockOf()?.["harness-execute"]?.by).toEqual(["pb"])
    expect(existsSync(join(vendored, "SKILL.md"))).toBe(true)

    process.env["GNAM_SKILL_GIT_BASE"] = join(f.root, "없음")
    for (const link of links) unlinkSync(link)
    const l = repo.gnam("link")
    expect(l.status).toBe(0)
    for (const link of links) expect(readlinkSync(link)).toBe("../../.gnam/skills/harness-execute")

    expect(repo.gnam("plugin", "remove", "pb").status).toBe(0)
    expect(existsSync(vendored)).toBe(false)
    for (const link of links) expect(existsSync(link) || isLink(link)).toBe(false)
    expect(lockOf()).toBeUndefined()
  } finally {
    delete process.env["GNAM_SKILL_GIT_BASE"]
    repo.cleanup()
    rmSync(f.root, { recursive: true, force: true })
  }
})

test("수명: 받기 실패면 gnam.json · .gnam/skills 를 바꾸지 않는다", () => {
  const f = fixture()
  const repo = tempRepo()
  process.env["GNAM_SKILL_GIT_BASE"] = f.base
  try {
    mkdirSync(join(repo.root, "pc"))
    writeFileSync(
      join(repo.root, "pc", "index.mjs"),
      `export default ${JSON.stringify({
        id: "pc",
        version: "0.1.0",
        skillDeps: [{ ...dep, ref: "v1" }, { name: "broken", source: "github:obov/agent-skills/no-skill", ref: "v1" }],
      })}\n`,
    )
    const before = readFileSync(join(repo.root, "gnam.json"), "utf8")
    const r = repo.gnam("plugin", "add", "./pc")
    expect(r.status).toBe(1)
    expect(r.err).toContain("broken: SKILL.md 없음")
    expect(readFileSync(join(repo.root, "gnam.json"), "utf8")).toBe(before)
    expect(readdirSync(join(repo.root, ".gnam", "skills"))).toEqual([])
  } finally {
    delete process.env["GNAM_SKILL_GIT_BASE"]
    repo.cleanup()
    rmSync(f.root, { recursive: true, force: true })
  }
})
