/**
 * .gnam/layout.json 해석 (specs/layout.md '선언 파일' · 'Rule' · '이름' · 'plugin 이 주는 규칙').
 * 형식 검사 → Layout. 문제가 있으면 Layout 없이 문제 목록 (layout/schema).
 */
import type { GnamConfig, GnamPlugin, LayoutRule } from "../../core/plugin.ts"

export const LAYOUT_FILE = ".gnam/layout.json"

export interface Layout {
  /** 루트 폴더 노드. structure 가 배열이면 { children: structure } */
  root: LayoutRule
  /** ruleId → 규칙. 사용자 = <이름>, plugin = <plugin id>.<이름> */
  rules: Map<string, { rule: LayoutRule; owner: string }>
  /** {이름} → 정규식 조각 (내장 · plugin · 사용자 순으로 덮음) */
  params: Record<string, string>
  ignore: (string | string[])[]
  /** 정규화한 structureRoot. 저장소 루트 = "" */
  structureRoot: string
}

export type Parsed = { layout: Layout; problems: [] } | { layout: null; problems: string[] }

export const BUILTIN_PARAMS: Record<string, string> = {
  camelCase: "[a-z][a-zA-Z0-9]*",
  PascalCase: "[A-Z][a-zA-Z0-9]*",
  strictCamelCase: "[a-z][a-z0-9]*(?:[A-Z][a-z0-9]+)*[A-Z]?",
  StrictPascalCase: "[A-Z](?:[a-z0-9]+(?:[A-Z][a-z0-9]+)*[A-Z]?)?",
  snake_case: "[a-z0-9]+(?:_[a-z0-9]+)*",
  SNAKE_CASE: "[A-Z0-9]+(?:_[A-Z0-9]+)*",
  "kebab-case": "[a-z0-9]+(?:-[a-z0-9]+)*",
}

function words(name: string): string[] {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
}
const cap = (w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()

/** 이름 형식 변환. 키 = 참조 이름의 형식 (folderName · nodeName 계열 공통) */
const CASES: Record<string, (name: string) => string> = {
  camel: (n) => words(n).map((w, i) => (i === 0 ? w.toLowerCase() : cap(w))).join(""),
  pascal: (n) => words(n).map(cap).join(""),
  kebab: (n) => words(n).map((w) => w.toLowerCase()).join("-"),
  snake: (n) => words(n).map((w) => w.toLowerCase()).join("_"),
  upper: (n) => words(n).map((w) => w.toUpperCase()).join("_"),
}
const refs = (base: string): Record<string, (name: string) => string> => {
  const [lower, upper] = [base, base.charAt(0).toUpperCase() + base.slice(1)]
  const kebab = lower.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)
  const snake = kebab.replace(/-/g, "_")
  return {
    [lower]: CASES["camel"]!,
    [upper]: CASES["pascal"]!,
    [kebab]: CASES["kebab"]!,
    [snake]: CASES["snake"]!,
    [snake.toUpperCase()]: CASES["upper"]!,
  }
}
/** {folderName} · {FolderName} · {folder-name} · {folder_name} · {FOLDER_NAME} */
export const FOLDER_REFS = refs("folderName")
/** {nodeName} · {NodeName} · {node-name} · {node_name} · {NODE_NAME} (enforceExistence) */
export const NODE_REFS = refs("nodeName")

const TOKEN = /\{([A-Za-z][\w.-]*)\}/g
const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")

/** 이름의 {} 밖 부분: . → \. · .. → . · * → ([^/]*) · ** → * · \x 는 그대로 */
function convert(part: string): string {
  let out = ""
  for (let i = 0; i < part.length; i++) {
    const c = part[i] ?? ""
    const next = part[i + 1]
    if (c === "\\") {
      out += c + (next ?? "")
      i++
    } else if (c === "." && next === ".") {
      out += "."
      i++
    } else if (c === ".") out += "\\."
    else if (c === "*" && next === "*") {
      out += "*"
      i++
    } else if (c === "*") out += "([^/]*)"
    else out += c
  }
  return out
}

/** name → 정규식. parent = 부모 폴더 이름 ({folderName} 계열). 모르는 파라미터 · 잘못된 정규식은 throw */
export function compileName(name: string, params: Record<string, string>, parent: string): RegExp {
  let out = ""
  let last = 0
  for (const m of name.matchAll(TOKEN)) {
    const key = m[1] ?? ""
    out += convert(name.slice(last, m.index))
    const ref = FOLDER_REFS[key]
    if (ref !== undefined) out += escapeRegex(ref(parent))
    else if (key in params) out += `(?:${params[key]})`
    else throw new Error(`알 수 없는 파라미터 {${key}}`)
    last = (m.index ?? 0) + m[0].length
  }
  out += convert(name.slice(last))
  return new RegExp(`^${out}$`)
}

/** enforceExistence 경로의 {nodeName} 계열 치환. 파일 이름은 첫 '.' 앞 */
export function substituteNode(path: string, nodeName: string): string {
  return path.replace(TOKEN, (whole, key: string) => {
    const ref = NODE_REFS[key]
    return ref === undefined ? whole : ref(nodeName)
  })
}

const TOP_KEYS = new Set(["structure", "rules", "regexParameters", "ignorePatterns", "structureRoot"])
const RULE_KEYS = new Set(["name", "children", "enforceExistence", "ruleId", "folderRecursionLimit"])
const RULE_NAME = /^[A-Za-z0-9_-]+$/

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v)

/** plugin 규칙 안의 bare ruleId 를 <plugin id>.<이름> 으로 */
function qualify(rule: LayoutRule, id: string, own: Set<string>): LayoutRule {
  const out: LayoutRule = { ...rule }
  if (rule.ruleId !== undefined && own.has(rule.ruleId)) out.ruleId = `${id}.${rule.ruleId}`
  if (Array.isArray(rule.children)) out.children = rule.children.map((c) => (isObject(c) ? qualify(c, id, own) : c))
  return out
}

export function parseLayout(text: string, plugins: GnamPlugin[] = []): Parsed {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch (error) {
    return { layout: null, problems: [`JSON 파싱 실패: ${(error as Error).message}`] }
  }
  return layoutOf(value, plugins)
}

export function layoutOf(value: unknown, plugins: GnamPlugin[] = []): Parsed {
  const problems: string[] = []
  if (!isObject(value)) return { layout: null, problems: ["최상위가 객체가 아님"] }
  for (const key of Object.keys(value)) if (!TOP_KEYS.has(key)) problems.push(`모르는 키 ${key}`)

  const rules = new Map<string, { rule: LayoutRule; owner: string }>()
  const params: Record<string, string> = { ...BUILTIN_PARAMS }
  for (const plugin of plugins) {
    const own = new Set(Object.keys(plugin.layout?.rules ?? {}))
    for (const [name, rule] of Object.entries(plugin.layout?.rules ?? {}))
      rules.set(`${plugin.id}.${name}`, { rule: qualify(rule, plugin.id, own), owner: plugin.id })
    for (const [name, regex] of Object.entries(plugin.layout?.regexParameters ?? {})) params[`${plugin.id}.${name}`] = regex
  }

  const userRules = value["rules"]
  if (userRules !== undefined && !isObject(userRules)) problems.push("rules = 객체")
  else
    for (const [name, rule] of Object.entries(userRules ?? {})) {
      if (!RULE_NAME.test(name)) problems.push(`rules.${name}: 이름은 [A-Za-z0-9_-]+ ('.' 은 plugin 규칙 표기)`)
      else rules.set(name, { rule: rule as LayoutRule, owner: "project" })
    }

  const userParams = value["regexParameters"]
  if (userParams !== undefined && !isObject(userParams)) problems.push("regexParameters = 객체")
  else
    for (const [name, regex] of Object.entries(userParams ?? {})) {
      if (typeof regex !== "string") problems.push(`regexParameters.${name}: 문자열 아님`)
      else if (name.includes(".")) problems.push(`regexParameters.${name}: '.' 은 plugin 파라미터 표기`)
      else if (name in FOLDER_REFS) continue
      else
        try {
          new RegExp(regex)
          params[name] = regex
        } catch {
          problems.push(`regexParameters.${name}: 잘못된 정규식 ${regex}`)
        }
    }

  const check = (rule: unknown, where: string, inRules: boolean, isRoot: boolean) => {
    if (!isObject(rule)) {
      problems.push(`${where}: 객체가 아님`)
      return
    }
    for (const key of Object.keys(rule)) if (!RULE_KEYS.has(key)) problems.push(`${where}: 모르는 키 ${key}`)
    const { name, children, enforceExistence, ruleId, folderRecursionLimit } = rule
    if (name !== undefined) {
      if (typeof name !== "string") problems.push(`${where}.name: 문자열 아님`)
      else
        try {
          compileName(name, params, "x")
        } catch (error) {
          problems.push(`${where}.name '${name}': ${(error as Error).message}`)
        }
    }
    if (ruleId !== undefined) {
      if (typeof ruleId !== "string") problems.push(`${where}.ruleId: 문자열 아님`)
      else if (!rules.has(ruleId))
        problems.push(
          ruleId.includes(".")
            ? `${where}.ruleId '${ruleId}': 꺼진 plugin 이거나 plugin 에 없는 규칙`
            : `${where}.ruleId '${ruleId}': rules 에 없음`,
        )
    }
    if (!isRoot && name === undefined && ruleId === undefined && !inRules) problems.push(`${where}: name 또는 ruleId 필요`)
    if (enforceExistence !== undefined) {
      const list = Array.isArray(enforceExistence) ? enforceExistence : [enforceExistence]
      if (!list.every((e) => typeof e === "string" && e !== "")) problems.push(`${where}.enforceExistence: 문자열 또는 문자열 배열`)
    }
    if (folderRecursionLimit !== undefined) {
      if (!inRules) problems.push(`${where}.folderRecursionLimit: rules 안에서만`)
      else if (typeof folderRecursionLimit !== "number" || !Number.isInteger(folderRecursionLimit) || folderRecursionLimit < 1)
        problems.push(`${where}.folderRecursionLimit: 1 이상 정수`)
    }
    if (children !== undefined) {
      if (!Array.isArray(children)) problems.push(`${where}.children: 배열 아님`)
      else children.forEach((c, i) => check(c, `${where}.children[${i}]`, false, false))
    }
  }

  const structure = value["structure"]
  if (structure === undefined) problems.push("structure 없음")
  else if (Array.isArray(structure)) structure.forEach((c, i) => check(c, `structure[${i}]`, false, false))
  else check(structure, "structure", false, true)
  for (const [key, { rule, owner }] of rules) check(rule, owner === "project" ? `rules.${key}` : `plugin ${owner} rules.${key}`, true, false)

  // ruleId 만으로 이어지는 순환 (a → b → a)
  for (const key of rules.keys()) {
    const seen = new Set<string>()
    let at: string | undefined = key
    while (at !== undefined && rules.has(at)) {
      if (seen.has(at)) {
        problems.push(`rules.${key}: ruleId 순환 (${[...seen].join(" → ")} → ${at})`)
        break
      }
      seen.add(at)
      at = rules.get(at)?.rule.ruleId
    }
  }

  const ignorePatterns = value["ignorePatterns"]
  let ignore: (string | string[])[] = []
  if (ignorePatterns !== undefined) {
    const list = Array.isArray(ignorePatterns) ? ignorePatterns : [ignorePatterns]
    if (!list.every((p) => typeof p === "string" || (Array.isArray(p) && p.every((q) => typeof q === "string"))))
      problems.push("ignorePatterns = 문자열 | (문자열 | 문자열 배열) 배열")
    else ignore = list as (string | string[])[]
  }

  const rawRoot = value["structureRoot"] ?? "."
  let structureRoot = ""
  if (typeof rawRoot !== "string") problems.push("structureRoot = 문자열")
  else {
    const parts = rawRoot.split("/").filter((p) => p !== "" && p !== ".")
    if (rawRoot.startsWith("/") || parts.includes("..")) problems.push(`structureRoot '${rawRoot}': 저장소 안 상대 경로`)
    structureRoot = parts.join("/")
  }

  if (problems.length > 0) return { layout: null, problems }
  const root: LayoutRule = Array.isArray(structure) ? { children: structure as LayoutRule[] } : (structure as LayoutRule)
  return { layout: { root, rules, params, ignore, structureRoot }, problems: [] }
}

/** ruleId 를 펼친 노드. 노드에 쓴 키가 규칙의 키를 덮는다. id = 처음 참조한 ruleId */
export function resolveRule(layout: Layout, rule: LayoutRule): { rule: LayoutRule; id: string | null; limit: number | null } {
  if (rule.ruleId === undefined) return { rule, id: null, limit: null }
  const { ruleId, ...own } = rule
  const base = layout.rules.get(ruleId)?.rule ?? {}
  const inner = resolveRule(layout, base)
  const merged: LayoutRule = { ...inner.rule, ...own }
  delete merged.folderRecursionLimit
  return { rule: merged, id: ruleId, limit: base.folderRecursionLimit ?? inner.limit }
}

/** gnam.json layout.enforce → 위반 등급 */
export function levelOf(config: GnamConfig): "warn" | "error" {
  const value = config["layout"]
  return isObject(value) && value["enforce"] === "block" ? "error" : "warn"
}

export function layoutConfigProblems(value: unknown): string[] {
  if (value === undefined) return []
  if (!isObject(value)) return ["객체가 아님"]
  const problems: string[] = []
  for (const key of Object.keys(value)) if (key !== "enforce") problems.push(`모르는 키 ${key}`)
  if (value["enforce"] !== undefined && value["enforce"] !== "warn" && value["enforce"] !== "block")
    problems.push(`enforce = "warn" | "block" (현재 ${JSON.stringify(value["enforce"])})`)
  return problems
}
