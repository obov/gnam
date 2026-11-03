import { test } from "node:test"
import { expect } from "./expect.ts"
import { configProblems } from "../src/core/config.ts"
import { type Loaded, pluginProblems } from "../src/core/loader.ts"
import type { GnamPlugin } from "../src/core/plugin.ts"
import { parseSource, skillDepProblems, skillsLockProblems } from "../src/core/skills.ts"

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
