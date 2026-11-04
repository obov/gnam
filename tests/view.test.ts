import { test } from "node:test"
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { expect } from "./expect.ts"
import { collectStatus } from "../src/core/status.ts"
import { collectViews, tabProblems } from "../src/core/view.ts"
import { tempRepo } from "./helpers.ts"

const RISKS = { id: "risks", title: "위험", source: "trace.items", where: { kind: "risk" }, view: "list", fields: { title: "text", badge: "kind" } }

test("탭 정의 검사: 필수 키 · id 형식 · view · where · fields · source 경로 (specs/view.md)", () => {
  expect(tabProblems(RISKS, true)).toEqual([])
  expect(tabProblems({ ...RISKS, id: "Risks!" }, true)).toEqual(["id = 소문자 · 숫자 · '-' 1-32자"])
  expect(tabProblems({ ...RISKS, source: "" }, true)).toEqual(["source = status 경로 문자열"])
  expect(tabProblems({ ...RISKS, source: 'trace."items' }, true).length).toBe(1)
  expect(tabProblems({ ...RISKS, title: "" }, true)).toEqual(["title = 1-24자 문자열"])
  expect(tabProblems({ ...RISKS, view: "chart" }, true)).toEqual(["view = list | table | progress"])
  expect(tabProblems({ ...RISKS, where: { kind: ["risk"] } }, true)).toEqual(["where = { 키: 스칼라 }"])
  expect(tabProblems({ ...RISKS, fields: { color: "x" } }, true).length).toBe(1)
  expect(tabProblems({ ...RISKS, fields: { columns: "text" } }, true)).toEqual(["fields.columns = 문자열 배열"])
  expect(tabProblems({ title: "x", view: "list" }, false)).toEqual([])
})

test("views: 프로젝트 탭 (owner project), 실패 · 중복은 빼고 문제 줄", () => {
  const config = { format: 1, plugins: [], view: { tabs: [RISKS, { ...RISKS }, { id: "bad", title: "x", source: "a", view: "pie" }] } }
  const { views, problems } = collectViews(config, [])
  expect(views.map((v) => [v.id, v.owner, v.where])).toEqual([["risks", "project", { kind: "risk" }]])
  expect(problems).toEqual(["view.tabs risks: id 중복", "view.tabs bad: view = list | table | progress"])
  expect(collectViews({ format: 1, plugins: [], view: [] }, []).problems).toEqual(["view = { tabs: [탭 정의] }"])
  expect(collectViews({ format: 1, plugins: [] }, [])).toEqual({ views: [], problems: [] })
})

test("views: gnam.json view 가 깨져도 commit-msg 는 통과, status problems (config) · --schema", async () => {
  const repo = tempRepo({ format: 1, plugins: [], view: { tabs: [{ id: "x" }] } })
  try {
    writeFileSync(join(repo.root, "msg"), "chore: a")
    expect(repo.gnam("commit-msg", "msg").status).toBe(0)
    const tree = await collectStatus({ cwd: repo.root })
    expect(tree["views"]).toEqual([])
    const problems = (tree["problems"] as { source: string; message: string }[]).filter((p) => p.message.startsWith("view.tabs"))
    expect(problems.map((p) => p.source)).toEqual(["config"])
    const schema = JSON.parse(repo.gnam("status", "views", "--schema").out) as { type: string }
    expect(schema.type).toBe("array")
  } finally {
    repo.cleanup()
  }
})
