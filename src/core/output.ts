/**
 * gnam status · gnam run --json 공통 출력 계층 (specs/info.md 고르기 · 형식).
 * 처리 순서 = 경로 → --where → --fields → 형식. 값은 JSON 값 (객체 getter 는 접근할 때 계산).
 */

/** code 1 = 사용 오류, 2 = 없는 경로 */
export class OutputError extends Error {
  readonly code: 1 | 2
  constructor(message: string, code: 1 | 2) {
    super(message)
    this.code = code
  }
}

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json }
type Obj = Record<string, unknown>

const isObject = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v)

/** 'a.b.0."c.d"' → ['a', 'b', '0', 'c.d']. 따옴표 안 \" · \\ 이스케이프 */
export function parsePath(path: string): string[] {
  if (path === "") return []
  const segments: string[] = []
  let i = 0
  while (i <= path.length) {
    if (path[i] === '"') {
      let j = i + 1
      let segment = ""
      while (j < path.length && path[j] !== '"') {
        if (path[j] === "\\" && j + 1 < path.length) j++
        segment += path[j]
        j++
      }
      if (j >= path.length) throw new OutputError(`경로의 닫는 따옴표 없음: ${path}`, 1)
      segments.push(segment)
      i = j + 1
      if (i < path.length && path[i] !== ".") throw new OutputError(`경로 형식: ${path}`, 1)
      i++
    } else {
      const end = path.indexOf(".", i)
      segments.push(path.slice(i, end < 0 ? path.length : end))
      if (end < 0) break
      i = end + 1
    }
  }
  return segments
}

export function formatPath(segments: string[]): string {
  return segments.map((s) => (s === "" || /[."\\]/.test(s) ? `"${s.replace(/["\\]/g, "\\$&")}"` : s)).join(".")
}

const MISSING = Symbol("missing")

function step(value: unknown, segment: string): unknown {
  if (Array.isArray(value)) return /^(0|[1-9][0-9]*)$/.test(segment) && Number(segment) < value.length ? value[Number(segment)] : MISSING
  if (isObject(value)) return Object.hasOwn(value, segment) ? value[segment] : MISSING
  return MISSING
}

function lookup(value: unknown, segments: string[]): unknown {
  let current = value
  for (const segment of segments) {
    current = step(current, segment)
    if (current === MISSING || current === undefined) return MISSING
  }
  return current
}

export function getPath(value: unknown, path: string): unknown {
  const found = lookup(value, parsePath(path))
  if (found === MISSING) throw new OutputError(`없는 경로: ${path}`, 2)
  return found
}

/** 경로 없음 = 전체, 하나 = 그 값, 여럿 = { 경로: 값 } */
export function select(value: unknown, paths: string[]): unknown {
  if (paths.length === 0) return value
  if (paths.length === 1) return getPath(value, paths[0] ?? "")
  return Object.fromEntries(paths.map((p) => [p, getPath(value, p)]))
}

/** 배열 또는 값이 전부 객체인 객체 (id → 객체 같은 모음) */
function isCollection(value: unknown): boolean {
  if (Array.isArray(value)) return true
  if (!isObject(value)) return false
  const values = Object.values(value)
  return values.length > 0 && values.every(isObject)
}

const scalarText = (v: unknown) =>
  v === null ? "null" : typeof v === "object" ? JSON.stringify(v) : String(v)

/** --where key=value · key!=value. 여러 개 = AND */
export function where(value: unknown, conditions: string[]): unknown {
  if (conditions.length === 0) return value
  const parsed = conditions.map((c) => {
    const m = /^([^=!]+)(!?=)(.*)$/.exec(c)
    if (m === null) throw new OutputError(`--where 형식 아님: ${c} (key=value · key!=value)`, 1)
    return { path: parsePath(m[1] ?? ""), negate: m[2] === "!=", expected: m[3] ?? "" }
  })
  const keep = (item: unknown) =>
    parsed.every(({ path, negate, expected }) => {
      const found = lookup(item, path)
      const equal = found !== MISSING && scalarText(found) === expected
      return negate ? !equal : equal
    })
  if (Array.isArray(value)) return value.filter(keep)
  if (isObject(value) && (isCollection(value) || Object.keys(value).length === 0))
    return Object.fromEntries(Object.entries(value).filter(([, v]) => keep(v)))
  throw new OutputError("--where 는 배열 · 객체 모음에만 쓴다", 1)
}

function pick(item: unknown, paths: string[][]): unknown {
  if (!isObject(item)) return item
  const out: Obj = {}
  for (const path of paths) {
    const found = lookup(item, path)
    if (found === MISSING) continue
    let target = out
    for (const segment of path.slice(0, -1)) {
      if (!isObject(target[segment])) target[segment] = {}
      target = target[segment] as Obj
    }
    target[path.at(-1) ?? ""] = found
  }
  return out
}

/** --fields a,b.c. 모음이면 원소마다, 객체 하나면 그 객체에서 */
export function fields(value: unknown, list: string[]): unknown {
  if (list.length === 0) return value
  const paths = list.map(parsePath)
  if (Array.isArray(value)) return value.map((v) => pick(v, paths))
  if (isCollection(value)) return Object.fromEntries(Object.entries(value as Obj).map(([k, v]) => [k, pick(v, paths)]))
  if (isObject(value)) return pick(value, paths)
  throw new OutputError("--fields 는 객체 · 모음에만 쓴다", 1)
}

/** 잎 (스칼라 · 빈 배열 · 빈 객체) 경로 */
export function leafPaths(value: unknown, prefix: string[] = []): string[] {
  if (Array.isArray(value) && value.length > 0) return value.flatMap((v, i) => leafPaths(v, [...prefix, String(i)]))
  if (isObject(value) && Object.keys(value).length > 0)
    return Object.entries(value).flatMap(([k, v]) => leafPaths(v, [...prefix, k]))
  return [formatPath(prefix)]
}

export const CORE_FORMATS = ["json", "compact", "ndjson", "raw", "env", "text"] as const

export type Renderer = (value: unknown) => string

const compact = (v: unknown) => JSON.stringify(v) ?? "null"

function shellQuote(text: string): string {
  return `'${text.replace(/'/g, `'\\''`)}'`
}

function envLines(value: unknown, prefix: string[]): string[] {
  if (Array.isArray(value)) return value.flatMap((v, i) => envLines(v, [...prefix, String(i)]))
  if (isObject(value)) return Object.entries(value).flatMap(([k, v]) => envLines(v, [...prefix, k]))
  const name = ["GNAM", ...prefix.map((s) => s.toUpperCase().replace(/[^A-Z0-9]+/g, "_"))].join("_").replace(/_+$/, "")
  return [`${name}=${value === null ? "''" : shellQuote(String(value))}`]
}

function textLines(value: unknown, indent: string): string[] {
  const scalar = (v: unknown): string | null => {
    if (v === null) return "null"
    if (Array.isArray(v)) return v.length === 0 ? "[]" : null
    if (isObject(v)) return Object.keys(v).length === 0 ? "{}" : null
    return String(v)
  }
  const entry = (head: string, v: unknown, childIndent: string): string[] => {
    const s = scalar(v)
    if (s !== null && !s.includes("\n")) return [`${head} ${s}`.trimEnd()]
    if (s !== null) return [`${head} |`, ...s.split("\n").map((l) => `${childIndent}${l}`)]
    return [head, ...textLines(v, childIndent)]
  }
  if (Array.isArray(value)) {
    return value.flatMap((v) => {
      const s = scalar(v)
      if (s !== null || !isObject(v)) return entry(`${indent}-`, v, `${indent}  `)
      const [first, ...rest] = textLines(v, `${indent}  `)
      return [`${indent}- ${(first ?? "").trimStart()}`, ...rest]
    })
  }
  if (isObject(value)) return Object.entries(value).flatMap(([k, v]) => entry(`${indent}${k}:`, v, `${indent}  `))
  return [`${indent}${scalar(value) ?? ""}`]
}

export function render(value: unknown, format: string, extra: Record<string, Renderer> = {}): string {
  switch (format) {
    case "json":
      return `${JSON.stringify(value, null, 2) ?? "null"}\n`
    case "compact":
      return `${compact(value)}\n`
    case "ndjson": {
      if (Array.isArray(value)) return value.map((v) => `${compact(v)}\n`).join("")
      if (isObject(value)) return Object.entries(value).map(([key, v]) => `${compact({ key, value: v })}\n`).join("")
      return `${compact(value)}\n`
    }
    case "raw":
      return `${value === null ? "" : typeof value === "string" ? value : typeof value === "object" ? compact(value) : String(value)}\n`
    case "env":
      return `${envLines(value, []).join("\n")}\n`
    case "text":
      return `${textLines(value, "").join("\n")}\n`
  }
  const renderer = extra[format]
  if (renderer === undefined)
    throw new OutputError(`모르는 형식: ${format} (${[...CORE_FORMATS, ...Object.keys(extra)].join(" · ")})`, 1)
  const out = renderer(value)
  return out.endsWith("\n") ? out : `${out}\n`
}

export interface OutputOptions {
  paths: string[]
  where: string[]
  fields: string[]
  format: string
  keys: boolean
}

/** 경로 → where → fields → (keys) → 형식 */
export function output(value: unknown, options: OutputOptions, extra: Record<string, Renderer> = {}): string {
  let current = select(value, options.paths)
  current = where(current, options.where)
  current = fields(current, options.fields)
  if (options.keys) {
    const base = options.paths.length === 1 ? parsePath(options.paths[0] ?? "") : []
    current = leafPaths(current, base)
  }
  return render(current, options.format, extra)
}
