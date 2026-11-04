/**
 * layout capture: 현재 트리 → structure 조각 (specs/layout.md '명령').
 * 형제 폴더 · 같은 확장자 파일을 내장 형식 파라미터로 묶는다 (D1).
 *   폴더  2개 이상 · 모두 같은 형식 · 바로 아래 공통 이름이 하나 이상 → { name: "{형식}", children: 합집합 },
 *         모든 폴더에 있는 파일은 enforceExistence
 *   파일  같은 확장자 2개 이상 · 이름 (첫 '.' 앞) 이 모두 같은 형식 → "{형식}<확장자>"
 *   나머지는 리터럴 (정규식 특수 문자 이스케이프)
 */
import type { LayoutRule } from "../../core/plugin.ts"
import { BUILTIN_PARAMS } from "./config.ts"

const CASE_ORDER = ["kebab-case", "snake_case", "camelCase", "PascalCase", "SNAKE_CASE"]

function commonCase(names: string[]): string | null {
  for (const name of CASE_ORDER) {
    const re = new RegExp(`^(?:${BUILTIN_PARAMS[name]})$`)
    if (names.every((n) => re.test(n))) return name
  }
  return null
}

/** 리터럴 이름. '.' 은 변환이 문자로 바꾸므로 그대로, '..' 는 \.\. */
export const literal = (name: string) => name.replace(/[*+?^${}()|[\]\\]/g, "\\$&").replace(/\.\./g, "\\.\\.")

function split(name: string): { stem: string; ext: string } {
  const dot = name.indexOf(".", 1)
  return dot < 0 ? { stem: name, ext: "" } : { stem: name.slice(0, dot), ext: name.slice(dot) }
}

/** paths = 이 폴더 기준 상대 경로 */
export function build(paths: string[]): LayoutRule[] {
  const files = [...new Set(paths.filter((p) => !p.includes("/")))].sort()
  const dirs = new Map<string, string[]>()
  for (const p of paths) {
    const slash = p.indexOf("/")
    if (slash < 0) continue
    const head = p.slice(0, slash)
    dirs.set(head, [...(dirs.get(head) ?? []), p.slice(slash + 1)])
  }
  const out: LayoutRule[] = []

  const byExt = new Map<string, string[]>()
  for (const f of files) {
    const { ext } = split(f)
    byExt.set(ext, [...(byExt.get(ext) ?? []), f])
  }
  for (const [ext, group] of byExt) {
    const shape = group.length >= 2 && ext !== "" ? commonCase(group.map((f) => split(f).stem)) : null
    if (shape !== null) out.push({ name: `{${shape}}${ext}` })
    else for (const f of group) out.push({ name: literal(f) })
  }

  const names = [...dirs.keys()].sort()
  const shape = names.length >= 2 ? commonCase(names) : null
  const direct = (dir: string) => new Set((dirs.get(dir) ?? []).map((p) => p.split("/")[0] ?? ""))
  const shared = names.length >= 2 ? names.map(direct).reduce((a, b) => new Set([...a].filter((x) => b.has(x)))) : new Set<string>()
  if (shape !== null && shared.size > 0) {
    const union = names.flatMap((n) => dirs.get(n) ?? [])
    const required = [...shared].filter((x) => names.every((n) => (dirs.get(n) ?? []).includes(x))).sort()
    out.push({ name: `{${shape}}`, ...(required.length > 0 ? { enforceExistence: required } : {}), children: build(union) })
  } else for (const n of names) out.push({ name: literal(n), children: build(dirs.get(n) ?? []) })
  return out
}

/** dir 아래 파일 → 저장소 루트부터 dir 까지 감싼 structure 조각 */
export function capture(files: string[], dir: string): LayoutRule[] {
  const clean = dir.split("/").filter((p) => p !== "" && p !== ".")
  const prefix = clean.length === 0 ? "" : `${clean.join("/")}/`
  let nodes = build(files.filter((f) => f.startsWith(prefix)).map((f) => f.slice(prefix.length)))
  for (const part of [...clean].reverse()) nodes = [{ name: literal(part), children: nodes }]
  return nodes
}
