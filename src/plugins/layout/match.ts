/**
 * 경로 ↔ 구조 일치 · 위반 계산 (specs/layout.md 'children 순서' · 'enforceExistence' · '재귀' · '규칙').
 * 입력은 파일 목록뿐이다 (디스크를 읽지 않는다). 커밋 검사는 트리의 파일 목록을 넘긴다.
 */
import { posix } from "node:path"
import type { LayoutRule } from "../../core/plugin.ts"
import { compileName, type Layout, LAYOUT_FILE, resolveRule, substituteNode } from "./config.ts"
import { ignored } from "./glob.ts"

export type LayoutRuleId = "layout/unlisted" | "layout/existence" | "layout/recursion" | "layout/schema"

/** 위반 하나. key = 부모 · 결과 트리 비교용 (rule + 경로 + 대상) */
export interface Found {
  rule: LayoutRuleId
  path: string
  key: string
  why: string
  current: string
  fix: string
}

export interface Step {
  segment: string
  /** 일치한 노드 name */
  name: string
  ruleId: string | null
}

export interface Match {
  path: string
  /** structureRoot 밖 · ignorePatterns = 검사 안 함 */
  checked: boolean
  ok: boolean
  steps: Step[]
  /** 실패 단계 (segment index) */
  failAt: number | null
  /** 실패 단계에서 허용된 이름 (폴더는 끝에 /) */
  allowed: string[]
  /** 실패 단계의 부모 노드 ruleId */
  parentRuleId: string | null
  /** 지나온 단계에서 folderRecursionLimit 때문에 뺀 노드가 있었는가 */
  limited: boolean
  /** 지나간 노드 (enforceExistence 계산용). 경로 = 저장소 기준 */
  nodes: { path: string; rule: LayoutRule; folder: boolean }[]
}

const kindOf = (rule: LayoutRule) => (rule.children === undefined ? "file" : "folder")
const classOf = (name: string) => (name.includes("*") ? 2 : /\{[A-Za-z][\w.-]*\}/.test(name) ? 1 : 0)

/** 부모 노드의 children → 정렬 · 중복 제거 · 재귀 제한을 적용한 후보 */
function optionsOf(layout: Layout, children: LayoutRule[], counts: Map<string, number>, limits: boolean) {
  let limited = false
  const resolved = children.flatMap((child) => {
    const r = resolveRule(layout, child)
    if (r.id !== null && limits) {
      const limit = limitOf(layout, r.id)
      if (limit !== null && (counts.get(r.id) ?? 0) >= limit) {
        limited = true
        return []
      }
    }
    return r.rule.name === undefined ? [] : [{ ...r, name: r.rule.name }]
  })
  const sorted = resolved
    .map((r, i) => ({ r, i }))
    .sort((a, b) => {
      const ka = kindOf(a.r.rule) === "file" ? 0 : 1
      const kb = kindOf(b.r.rule) === "file" ? 0 : 1
      return ka - kb || classOf(a.r.name) - classOf(b.r.name) || a.i - b.i
    })
    .map(({ r }) => r)
  const seen = new Set<string>()
  const options = sorted.filter((r) => {
    const key = `${kindOf(r.rule)}\0${r.name}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  return { options, limited }
}

const limitOf = (layout: Layout, id: string) => resolveRule(layout, { ruleId: id }).limit

const regexCache = new WeakMap<Layout, Map<string, RegExp>>()
function test(layout: Layout, name: string, parent: string, segment: string): boolean {
  let cache = regexCache.get(layout)
  if (cache === undefined) regexCache.set(layout, (cache = new Map()))
  const key = `${name}\0${parent}`
  let re = cache.get(key)
  if (re === undefined) cache.set(key, (re = compileName(name, layout.params, parent)))
  return re.test(segment)
}

const rootName = (layout: Layout) => posix.basename(layout.structureRoot)

/** 경로 하나를 구조에 맞춘다. path = 저장소 기준 */
export function matchPath(layout: Layout, path: string, limits = true): Match {
  const base: Match = { path, checked: false, ok: true, steps: [], failAt: null, allowed: [], parentRuleId: null, limited: false, nodes: [] }
  const prefix = layout.structureRoot === "" ? "" : `${layout.structureRoot}/`
  if (!path.startsWith(prefix) || ignored(layout.ignore, path) || path === LAYOUT_FILE) return base
  const segments = path.slice(prefix.length).split("/")
  const match: Match = { ...base, checked: true, nodes: [{ path: layout.structureRoot, rule: layout.root, folder: true }] }
  let children = layout.root.children
  if (children === undefined || children.length === 0) return match
  let parent = rootName(layout)
  let parentRuleId: string | null = null
  const counts = new Map<string, number>()
  let limitedSoFar = false
  for (const [i, segment] of segments.entries()) {
    const last = i === segments.length - 1
    const { options, limited } = optionsOf(layout, children, counts, limits)
    limitedSoFar ||= limited
    const fits = options.filter((o) => kindOf(o.rule) === (last ? "file" : "folder"))
    const hit = fits.find((o) => test(layout, o.name, parent, segment))
    if (hit === undefined) {
      return {
        ...match,
        ok: false,
        failAt: i,
        allowed: options.map((o) => (kindOf(o.rule) === "folder" ? `${o.name}/` : o.name)),
        parentRuleId,
        limited: limitedSoFar,
      }
    }
    match.steps.push({ segment, name: hit.name, ruleId: hit.id })
    match.nodes.push({ path: prefix + segments.slice(0, i + 1).join("/"), rule: hit.rule, folder: !last })
    if (hit.id !== null) counts.set(hit.id, (counts.get(hit.id) ?? 0) + 1)
    if (last) break
    children = hit.rule.children ?? []
    if (children.length === 0) break
    parent = segment
    parentRuleId = hit.id
  }
  return match
}

/** 실패 경로를 같은 파일 이름으로 옮길 가장 가까운 위치 (실패 단계부터 위로) */
export function suggestion(layout: Layout, match: Match): string | null {
  if (match.failAt === null) return null
  const prefix = layout.structureRoot === "" ? "" : `${layout.structureRoot}/`
  const segments = match.path.slice(prefix.length).split("/")
  const file = segments.at(-1) ?? ""
  for (let k = Math.min(match.failAt, segments.length - 1); k >= 0; k--) {
    const candidate = prefix + [...segments.slice(0, k), file].join("/")
    if (candidate !== match.path && matchPath(layout, candidate).ok) return candidate
  }
  return null
}

const display = (match: Match) => match.steps.map((s) => s.name).join("/")

function unlisted(layout: Layout, match: Match): Found {
  const prefix = layout.structureRoot === "" ? "" : `${layout.structureRoot}/`
  const segments = match.path.slice(prefix.length).split("/")
  const failAt = match.failAt ?? 0
  const segment = segments[failAt] ?? ""
  const folder = failAt < segments.length - 1
  const at = display(match) || "(structure 루트)"
  const ruleNote = match.parentRuleId === null ? "" : ` (rule ${match.parentRuleId})`
  const recursion = match.limited && matchPath(layout, match.path, false).ok
  const move = suggestion(layout, match)
  const target = match.parentRuleId === null ? `${at} 의 children` : `rules.${match.parentRuleId}.children`
  return {
    rule: recursion ? "layout/recursion" : "layout/unlisted",
    path: match.path,
    key: `${recursion ? "layout/recursion" : "layout/unlisted"}\0${match.path}`,
    why: recursion
      ? `${at} 에서 folderRecursionLimit 도달${ruleNote}`
      : `${at} 아래 허용: ${match.allowed.join(" · ") || "(없음)"}${ruleNote}`,
    current: `${match.path}\n  ${segment}${folder ? "/" : ""} ← 일치하는 노드 없음`,
    fix: [
      ...(move === null ? [] : [`A. 이동: ${move}`]),
      `${move === null ? "A" : "B"}. 구조 변경: ${LAYOUT_FILE} 의 ${target} 에 추가 → layout: 커밋`,
      `확인: npx gnam run layout where ${match.path}`,
    ].join("\n"),
  }
}

/** 파일 목록 전체의 위반. files = 저장소 기준 경로 */
export function findViolations(layout: Layout, files: string[]): Found[] {
  const set = new Set(files)
  const dirs = new Set<string>()
  for (const file of files) {
    const parts = file.split("/")
    for (let i = 1; i < parts.length; i++) dirs.add(parts.slice(0, i).join("/"))
  }
  const exists = (path: string) => path === "" || set.has(path) || dirs.has(path)
  const found: Found[] = []
  const nodes = new Map<string, { path: string; rule: LayoutRule; folder: boolean }>()
  for (const file of [...files].sort()) {
    const match = matchPath(layout, file)
    if (!match.checked) continue
    for (const node of match.nodes) nodes.set(`${node.folder ? "d" : "f"}\0${node.path}`, node)
    if (!match.ok) found.push(unlisted(layout, match))
  }
  const root = layout.structureRoot
  for (const node of nodes.values()) {
    const list = node.rule.enforceExistence
    if (list === undefined) continue
    const base = node.folder ? node.path : posix.dirname(node.path) === "." ? "" : posix.dirname(node.path)
    const name = posix.basename(node.path)
    const nodeName = node.folder ? name : (name.split(".")[0] ?? name)
    for (const entry of Array.isArray(list) ? list : [list]) {
      const target = posix.normalize(posix.join(base || ".", substituteNode(entry, nodeName)))
      const outside = target === ".." || target.startsWith("../") || (root !== "" && target !== root && !target.startsWith(`${root}/`))
      if (outside) {
        found.push({
          rule: "layout/schema",
          path: node.path,
          key: `layout/schema\0${node.path}\0${entry}`,
          why: "enforceExistence 가 structureRoot 밖을 가리킨다",
          current: `${node.path || "(루트)"}: ${entry} → ${target}`,
          fix: `${LAYOUT_FILE} 의 enforceExistence 경로를 고친다 → layout: 커밋`,
        })
        continue
      }
      const normalized = target === "." ? "" : target
      if (exists(normalized)) continue
      found.push({
        rule: "layout/existence",
        path: normalized,
        key: `layout/existence\0${node.path}\0${normalized}`,
        why: `${node.path || "(루트)"} 가 있으면 ${normalized} 도 있어야 한다 (enforceExistence ${entry})`,
        current: `${normalized} 없음`,
        fix: `${normalized} 를 만들거나, ${node.path} 를 옮기거나, ${LAYOUT_FILE} 의 enforceExistence 를 바꾼다 (layout: 커밋)`,
      })
    }
  }
  return found
}

/** structure 를 트리 텍스트로 (ruleId 펼침, 같은 ruleId 는 경로당 한 번) */
export function showTree(layout: Layout): string {
  const out: string[] = []
  const walk = (children: LayoutRule[], depth: number, seen: Set<string>) => {
    for (const child of children) {
      const r = resolveRule(layout, child)
      const name = r.rule.name ?? "(이름 없음)"
      const folder = r.rule.children !== undefined
      const tags = [
        ...(r.id === null ? [] : [`rule ${r.id}`]),
        ...(r.limit === null ? [] : [`limit ${r.limit}`]),
        ...(r.rule.enforceExistence === undefined ? [] : [`requires ${[r.rule.enforceExistence].flat().join(", ")}`]),
        ...(folder && r.rule.children?.length === 0 ? ["자유"] : []),
      ]
      out.push(`${"  ".repeat(depth)}${name}${folder ? "/" : ""}${tags.length ? `   ${tags.join(" · ")}` : ""}`)
      if (!folder) continue
      if (r.id !== null && seen.has(r.id)) {
        out.push(`${"  ".repeat(depth + 1)}↻ ${r.id}`)
        continue
      }
      walk(r.rule.children ?? [], depth + 1, r.id === null ? seen : new Set([...seen, r.id]))
    }
  }
  out.push(`${layout.structureRoot || "."}/${layout.root.enforceExistence ? `   requires ${[layout.root.enforceExistence].flat().join(", ")}` : ""}`)
  walk(layout.root.children ?? [], 1, new Set())
  return out.join("\n")
}
