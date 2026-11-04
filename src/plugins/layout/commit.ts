/**
 * 커밋 검사 (specs/layout.md '검사' · '커밋 종류').
 * 부모 트리와 이 커밋 결과 트리를 각자의 layout.json 으로 검사해, 결과에만 있는 위반을 낸다.
 * index view (commit-msg hook) = HEAD 대비 index.
 */
import { git, nulList } from "../../core/git.ts"
import type { CommitContext, CommitKind, GnamPlugin, Violation } from "../../core/plugin.ts"
import { LAYOUT_FILE, levelOf, parseLayout } from "./config.ts"
import { type Found, findViolations } from "./match.ts"
import { schemaFound, toViolation } from "./found.ts"

type Rev = { kind: "index" } | { kind: "commit"; sha: string }

export const LAYOUT_SUBJECT = /^layout: \S/
/** layout: 커밋 · 도입 커밋에서 warn 으로 보여 줄 기존 파일 위반 최대 수 */
const LIST_LIMIT = 20

function layoutTextAt(cwd: string, rev: Rev): string | null {
  const result = git(["show", rev.kind === "index" ? `:${LAYOUT_FILE}` : `${rev.sha}:${LAYOUT_FILE}`], cwd)
  return result.ok ? result.out : null
}

function filesAt(cwd: string, rev: Rev): string[] {
  const result =
    rev.kind === "index" ? git(["ls-files", "-z"], cwd) : git(["ls-tree", "-r", "-z", "--name-only", rev.sha], cwd)
  return result.ok ? nulList(result.out) : []
}

function parentOf(cwd: string, rev: Rev): Rev | null {
  const result = git(["rev-parse", "-q", "--verify", rev.kind === "index" ? "HEAD^{commit}" : `${rev.sha}^^{commit}`], cwd)
  return result.ok ? { kind: "commit", sha: result.out.trim() } : null
}

/** sha → 위반 (null = layout.json 없음). history verify 에서 부모 결과를 다시 계산하지 않는다 (D2) */
const cache = new Map<string, { found: Found[]; schema: boolean } | null>()

function foundAt(cwd: string, rev: Rev, plugins: GnamPlugin[]): { found: Found[]; schema: boolean } | null {
  const key = rev.kind === "commit" ? `${cwd}\0${rev.sha}` : null
  if (key !== null && cache.has(key)) return cache.get(key) ?? null
  const text = layoutTextAt(cwd, rev)
  let value: { found: Found[]; schema: boolean } | null = null
  if (text !== null) {
    const parsed = parseLayout(text, plugins)
    value =
      parsed.layout === null
        ? { found: schemaFound(parsed.problems), schema: true }
        : { found: findViolations(parsed.layout, filesAt(cwd, rev)), schema: false }
  }
  if (key !== null) cache.set(key, value)
  return value
}

/** 그 커밋 시점 gnam.json 에 layout plugin 이 있는가. hook (index) 은 지금 활성이므로 true */
function activeAt(ctx: CommitContext): boolean {
  if (ctx.view.kind === "index") return true
  const result = git(["show", `${ctx.view.sha}:gnam.json`], ctx.cwd)
  if (!result.ok) return false
  try {
    const plugins = (JSON.parse(result.out) as { plugins?: unknown }).plugins
    return Array.isArray(plugins) && plugins.some((p) => p === "@gnam/layout" || p === "layout")
  } catch {
    return false
  }
}

const revOf = (ctx: CommitContext): Rev => (ctx.view.kind === "index" ? { kind: "index" } : { kind: "commit", sha: ctx.view.sha })

export function layoutEveryCommit(ctx: CommitContext, owner: string): Violation[] {
  if (ctx.merge || !activeAt(ctx)) return []
  const plugins = ctx.active ?? []
  const rev = revOf(ctx)
  const now = foundAt(ctx.cwd, rev, plugins)
  if (now === null) return []
  const parentRev = parentOf(ctx.cwd, rev)
  const before = parentRev === null ? null : foundAt(ctx.cwd, parentRev, plugins)
  const out: Violation[] = []
  if (owner !== "layout" && before !== null && (ctx.files ?? []).includes(LAYOUT_FILE))
    out.push({
      rule: "commit/layout-files",
      why: `${LAYOUT_FILE} 변경은 layout: 커밋에서만 (구조 결정 이력 = git log -- ${LAYOUT_FILE})`,
      current: ctx.subject,
      fix: `${LAYOUT_FILE} 를 이 커밋에서 빼고 'layout: <구조 결정>' 커밋 (본문 Goal:) 으로 따로 남긴다`,
    })
  if (owner === "layout" && now.schema) return out
  // 기준 없음 (도입 커밋 · 부모 layout.json 이 깨짐) 또는 layout: 커밋 = 규칙 변화로 생긴 위반 목록 (warn)
  const listing = owner === "layout" || before === null || before.schema
  const known = new Set(listing ? [] : before.found.map((f) => f.key))
  const fresh = now.found.filter((f) => !known.has(f.key))
  if (!listing) return [...out, ...fresh.map((f) => toViolation(f, levelOf(ctx.config)))]
  const shown = fresh.slice(0, LIST_LIMIT).map((f) => toViolation(f, "warn"))
  const last = shown.at(-1)
  if (last !== undefined && fresh.length > LIST_LIMIT)
    last.fix += `\n\n(기존 파일 위반 ${fresh.length - LIST_LIMIT}건 더: npx gnam run layout check)`
  return [...out, ...shown]
}

export const layoutKind: CommitKind = {
  label: "layout: …",
  subject: LAYOUT_SUBJECT,
  validate(ctx) {
    const out: Violation[] = []
    if (ctx.files !== null && (ctx.files.length !== 1 || ctx.files[0] !== LAYOUT_FILE))
      out.push({
        rule: "commit/layout-files",
        why: `layout: 커밋은 ${LAYOUT_FILE} 만 바꾼다. 규칙에 맞춘 파일 이동은 이후 refactor:`,
        current: ctx.files.join(", ") || "(변경 없음)",
        fix: `${LAYOUT_FILE} 외 파일을 이 커밋에서 뺀다 (git restore --staged <파일>)`,
      })
    if (!/^Goal:/m.test(ctx.body))
      out.push({
        rule: "commit/layout-goal",
        why: "구조를 정한 이유가 결정 이력이다 (git log -- .gnam/layout.json)",
        current: ctx.body === "" ? "(본문 없음)" : ctx.body.split("\n")[0] ?? "",
        fix: "본문에 'Goal: <이 구조를 정한 이유>' 를 쓴다",
      })
    const text = layoutTextAt(ctx.cwd, revOf(ctx))
    const problems = text === null ? [`${LAYOUT_FILE} 없음`] : parseLayout(text, ctx.active ?? []).problems
    out.push(...schemaFound(problems).map((f) => toViolation(f, "error")))
    return out
  },
}
