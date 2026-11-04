/**
 * layout: .gnam/layout.json 에 폴더 구조를 선언하고 어긋난 경로를 알린다 (specs/layout.md).
 */
import { existsSync, readFileSync } from "node:fs"
import { join, posix } from "node:path"
import { git, nulList } from "../../core/git.ts"
import { loadPlugins } from "../../core/loader.ts"
import { definePlugin, type GnamConfig, type GnamPlugin, type StatusContext } from "../../core/plugin.ts"
import { format } from "../../core/violation.ts"
import { capture } from "./capture.ts"
import { type Layout, LAYOUT_FILE, layoutConfigProblems, levelOf, parseLayout, resolveRule, substituteNode } from "./config.ts"
import { layoutEveryCommit, layoutKind } from "./commit.ts"
import { schemaFound, toViolation } from "./found.ts"
import { type Found, findViolations, matchPath, showTree, suggestion } from "./match.ts"

const fail = (message: string) => {
  console.error(`gnam run layout: ${message}`)
  return 1
}

/** 작업 트리 기준 위반. layout.json 없으면 null */
export function workingFound(cwd: string, files: string[], plugins: GnamPlugin[]): Found[] | null {
  const path = join(cwd, LAYOUT_FILE)
  if (!existsSync(path)) return null
  const parsed = parseLayout(readFileSync(path, "utf8"), plugins)
  return parsed.layout === null ? schemaFound(parsed.problems) : findViolations(parsed.layout, files)
}

/** 작업 트리 파일 (추적 · 미추적, 무시 제외) */
const workingFiles = (cwd: string) => {
  const result = git(["ls-files", "-z", "--cached", "--others", "--exclude-standard"], cwd)
  return result.ok ? nulList(result.out) : []
}

const activeOf = async (cwd: string, config: GnamConfig) => (await loadPlugins(cwd, config)).map((l) => l.plugin)

type Loaded = { layout: Layout } | { error: string }

async function load(cwd: string, config: GnamConfig): Promise<Loaded> {
  const path = join(cwd, LAYOUT_FILE)
  if (!existsSync(path)) return { error: `${LAYOUT_FILE} 없음 (npx gnam plugin add layout 이 만든다)` }
  const parsed = parseLayout(readFileSync(path, "utf8"), await activeOf(cwd, config))
  return parsed.layout === null ? { error: `${LAYOUT_FILE} 형식 문제\n${parsed.problems.join("\n")}` } : { layout: parsed.layout }
}

/** where 결과 */
export function whereOf(layout: Layout, path: string) {
  const clean = path.replace(/^\.\//, "").replace(/\/+$/, "")
  const match = matchPath(layout, clean)
  const recursion = !match.ok && match.limited && matchPath(layout, clean, false).ok
  const requires = match.nodes.flatMap((node) => {
    const list = node.rule.enforceExistence
    if (list === undefined) return []
    const name = node.path.split("/").at(-1) ?? ""
    const nodeName = node.folder ? name : (name.split(".")[0] ?? name)
    const base = node.folder ? node.path : node.path.split("/").slice(0, -1).join("/")
    return [list].flat().map((e) => posix.join(base || ".", substituteNode(e, nodeName)))
  })
  return {
    path: clean,
    checked: match.checked,
    ok: match.ok,
    rule: match.ok ? null : recursion ? "layout/recursion" : "layout/unlisted",
    steps: match.steps,
    failAt: match.failAt,
    allowed: match.allowed,
    suggestion: suggestion(layout, match),
    requires,
  }
}

function whereText(w: ReturnType<typeof whereOf>): string {
  if (!w.checked) return `${w.path}: 검사 안 함 (structureRoot 밖 · ignorePatterns · ${LAYOUT_FILE})`
  const lines = [`${w.path}: ${w.ok ? "허용" : `허용 안 함 (${w.rule})`}`]
  const width = Math.max(...w.path.split("/").map((s) => s.length + 1))
  for (const step of w.steps) lines.push(`  ${step.segment.padEnd(width)}  ${step.name}${step.ruleId ? `   rule ${step.ruleId}` : ""}`)
  if (!w.ok) {
    const segment = w.path.split("/")[w.failAt ?? 0] ?? ""
    lines.push(`  ${segment.padEnd(width)}  ← 일치하는 노드 없음`)
    lines.push(`허용: ${w.allowed.join(" · ") || "(없음)"}`)
    if (w.suggestion !== null) lines.push(`이동 후보: ${w.suggestion}`)
  }
  if (w.requires.length > 0) lines.push(`함께 있어야 함: ${[...new Set(w.requires)].join(" · ")}`)
  return lines.join("\n")
}

/** 활성 규칙 목록 (status rules · show) */
const rulesOf = (layout: Layout) =>
  [...layout.rules].map(([id, { rule, owner }]) => ({ id, owner, name: resolveRule(layout, rule).rule.name ?? "" }))

function filterPaths(found: Found[], paths: string[]): Found[] {
  if (paths.length === 0) return found
  const clean = paths.map((p) => p.replace(/^\.\//, "").replace(/\/+$/, ""))
  return found.filter((f) => clean.some((p) => p === "" || p === "." || f.path === p || f.path.startsWith(`${p}/`)))
}

async function checkData(args: string[], cwd: string, config: GnamConfig) {
  const loaded = await load(cwd, config)
  if ("error" in loaded) return { error: loaded.error, violations: [] }
  const level = levelOf(config)
  const found = filterPaths(findViolations(loaded.layout, workingFiles(cwd)), args)
  return { error: null, violations: found.map((f) => ({ ...toViolation(f, level), path: f.path })) }
}

export default definePlugin({
  id: "layout",
  version: "0.1.0",
  kinds: [layoutKind],
  everyCommit: layoutEveryCommit,
  verify: (cwd: string, files: string[], config: GnamConfig, plugins: GnamPlugin[]) =>
    (workingFound(cwd, files, plugins) ?? []).map((f) => toViolation(f, levelOf(config))),
  commands: {
    where: {
      describe: "<경로>  허용 여부 · 일치한 노드 · 실패 단계 · 이동 후보 (파일이 없어도 됨)",
      async run(args, cwd, config) {
        const loaded = await load(cwd, config)
        if ("error" in loaded) return fail(loaded.error)
        if (args[0] === undefined) return fail("사용: gnam run layout where <경로>")
        const w = whereOf(loaded.layout, args[0])
        console.log(whereText(w))
        return w.ok ? 0 : 1
      },
      async data(args, ctx: StatusContext) {
        const loaded = await load(ctx.cwd, ctx.config)
        if ("error" in loaded) throw new Error(loaded.error)
        return whereOf(loaded.layout, args[0] ?? "")
      },
    },
    check: {
      describe: "[<경로>…]  작업 트리 전체 위반 (경로 주면 그 아래만). 위반 있으면 exit 1",
      async run(args, cwd, config) {
        const result = await checkData(args, cwd, config)
        if (result.error !== null) return fail(result.error)
        if (result.violations.length === 0) {
          console.log("layout 위반 없음")
          return 0
        }
        console.error(format(result.violations))
        return 1
      },
      data: (args, ctx) => checkData(args, ctx.cwd, ctx.config),
    },
    show: {
      describe: "structure 를 트리로 (ruleId 펼침)",
      async run(_args, cwd, config) {
        const loaded = await load(cwd, config)
        if ("error" in loaded) return fail(loaded.error)
        console.log(showTree(loaded.layout))
        return 0
      },
      async data(_args, ctx) {
        const loaded = await load(ctx.cwd, ctx.config)
        if ("error" in loaded) throw new Error(loaded.error)
        return { structureRoot: loaded.layout.structureRoot, root: loaded.layout.root, rules: rulesOf(loaded.layout) }
      },
    },
    capture: {
      describe: "<폴더>  현재 트리 → structure 조각 JSON (stdout). layout.json 에 붙여 쓴다",
      run(args, cwd) {
        if (args[0] === undefined) return fail("사용: gnam run layout capture <폴더>")
        console.log(JSON.stringify(capture(workingFiles(cwd), args[0]), null, 2))
        return 0
      },
    },
  },
  status: {
    sections: {
      rules: {
        describe: "layout 규칙 (사용자 rules · plugin 규칙)",
        schema: {
          type: "array",
          items: { type: "object", properties: { id: { type: "string" }, owner: { type: "string" }, name: { type: "string" } } },
        },
        async collect(ctx) {
          const loaded = await load(ctx.cwd, ctx.config)
          return "error" in loaded ? [] : rulesOf(loaded.layout)
        },
        view: { title: "구조", view: "list", fields: { title: "id", badge: "owner", meta: "name" }, icon: "layout" },
      },
      violations: {
        describe: "작업 트리 layout 위반",
        deep: true,
        schema: {
          type: "array",
          items: { type: "object", properties: { rule: { type: "string" }, path: { type: "string" }, level: { type: "string" } } },
        },
        async collect(ctx) {
          const result = await checkData([], ctx.cwd, ctx.config)
          return result.violations.map((v) => ({ rule: v.rule, path: v.path, level: v.level }))
        },
      },
    },
    async summary(ctx) {
      if (!existsSync(join(ctx.cwd, LAYOUT_FILE))) return []
      const result = await checkData([], ctx.cwd, ctx.config)
      if (result.error !== null) return [`${LAYOUT_FILE} 형식 문제`]
      const n = result.violations.length
      return n === 0 ? [] : [`layout 위반 ${n} (${levelOf(ctx.config) === "error" ? "block" : "warn"})`]
    },
  },
  skills: ["skills/gnam-layout"],
  agentsMd: "agents.md",
  scaffold: { [LAYOUT_FILE]: "files/layout.json" },
  configProblems: layoutConfigProblems,
  configDefaults: { enforce: "warn" },
  rules: [
    { id: "layout/unlisted", why: "구조의 어떤 노드와도 맞지 않는 경로" },
    { id: "layout/existence", why: "enforceExistence 가 요구한 경로가 있다" },
    { id: "layout/recursion", why: "folderRecursionLimit 안의 깊이" },
    { id: "layout/schema", why: ".gnam/layout.json 형식" },
    { id: "commit/layout-files", why: "layout: 커밋은 .gnam/layout.json 만, layout.json 변경은 layout: 커밋에서만" },
    { id: "commit/layout-goal", why: "layout: 커밋 본문 Goal (구조를 정한 이유)" },
  ],
})
