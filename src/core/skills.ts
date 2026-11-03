/**
 * plugin 의 외부 스킬 의존 (specs/skills.md).
 *   선언   GnamPlugin.skillDeps = [{ name · source (github:<owner>/<repo>[/<경로>]) · ref }]
 *   잠금   gnam.json skills = name → { source · ref · commit · sha256 · by }
 *   저장   .gnam/skills/<name>/ (커밋 대상). .claude/skills · .agents/skills 에 상대 링크
 */
import type { GnamPlugin } from "./plugin.ts"

export interface SkillDep {
  /** 링크 이름. 소문자 · 숫자 · - */
  name: string
  /** github:<owner>/<repo>[/<경로>] */
  source: string
  /** tag · branch · commit sha. 받은 시점의 commit 으로 잠근다 */
  ref: string
}

export interface SkillLock {
  source: string
  ref: string
  commit: string
  sha256: string
  /** 이 스킬을 선언한 활성 plugin id */
  by: string[]
}

/** gnam.json 의 잠금 키. plugin id 로 쓸 수 없다 */
export const SKILLS_KEY = "skills"

const NAME = /^[a-z0-9][a-z0-9-]*$/
const SEGMENT = /^[A-Za-z0-9_.-]+$/
const COMMIT = /^[0-9a-f]{40}$/
const SHA256 = /^[0-9a-f]{64}$/

export interface GithubSource {
  owner: string
  repo: string
  /** 저장소 안 경로. 루트면 "" */
  path: string
}

/** github:<owner>/<repo>[/<경로>]. 형식이 틀리면 null. 경로에 . · .. · 빈 세그먼트 금지 */
export function parseSource(source: string): GithubSource | null {
  if (!source.startsWith("github:")) return null
  const parts = source.slice("github:".length).split("/")
  if (parts.length < 2) return null
  const [owner = "", repo = "", ...rest] = parts
  if (![owner, repo].every((s) => SEGMENT.test(s) && s !== "." && s !== "..")) return null
  if (rest.some((s) => s === "" || s === "." || s === ".." || !SEGMENT.test(s))) return null
  return { owner, repo, path: rest.join("/") }
}

/** 한 plugin 의 skillDeps 형식 문제 */
export function skillDepProblems(plugin: GnamPlugin): string[] {
  const deps = plugin.skillDeps
  if (deps === undefined) return []
  if (!Array.isArray(deps)) return [`${plugin.id}: skillDeps = 배열`]
  const problems: string[] = []
  for (const [i, dep] of (deps as unknown[]).entries()) {
    const at = `${plugin.id}: skillDeps[${i}]`
    if (typeof dep !== "object" || dep === null) {
      problems.push(`${at} = 객체 { name · source · ref }`)
      continue
    }
    const { name, source, ref } = dep as Record<string, unknown>
    if (typeof name !== "string" || !NAME.test(name)) problems.push(`${at}.name = 소문자 · 숫자 · - (${String(name)})`)
    if (typeof source !== "string" || parseSource(source) === null)
      problems.push(`${at}.source = github:<owner>/<repo>[/<경로>] (${String(source)})`)
    if (typeof ref !== "string" || ref.trim() === "") problems.push(`${at}.ref 빈 값`)
  }
  return problems
}

/** 활성 plugin 사이 충돌: 같은 name 을 다른 source 로 선언 */
export function skillDepConflicts(plugins: GnamPlugin[]): string[] {
  const seen = new Map<string, { source: string; id: string }>()
  const problems: string[] = []
  for (const plugin of plugins)
    for (const dep of Array.isArray(plugin.skillDeps) ? plugin.skillDeps : []) {
      const first = seen.get(dep.name)
      if (first === undefined) seen.set(dep.name, { source: dep.source, id: plugin.id })
      else if (first.source !== dep.source)
        problems.push(`${plugin.id}: 스킬 ${dep.name} 출처 충돌 (${plugin.id} ${dep.source} · ${first.id} ${first.source})`)
    }
  return problems
}

/** gnam.json skills 형식 문제. 없으면 문제 없음 */
export function skillsLockProblems(value: unknown): string[] {
  if (value === undefined) return []
  if (typeof value !== "object" || value === null || Array.isArray(value)) return ["skills = 객체 (name → 잠금)"]
  const problems: string[] = []
  for (const [name, entry] of Object.entries(value)) {
    const at = `skills.${name}`
    if (!NAME.test(name)) problems.push(`${at}: 이름 = 소문자 · 숫자 · -`)
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      problems.push(`${at} = 객체 { source · ref · commit · sha256 · by }`)
      continue
    }
    const { source, ref, commit, sha256, by } = entry as Record<string, unknown>
    if (typeof source !== "string" || parseSource(source) === null) problems.push(`${at}.source = github:<owner>/<repo>[/<경로>]`)
    if (typeof ref !== "string" || ref.trim() === "") problems.push(`${at}.ref 빈 값`)
    if (typeof commit !== "string" || !COMMIT.test(commit)) problems.push(`${at}.commit = 40자 hex`)
    if (typeof sha256 !== "string" || !SHA256.test(sha256)) problems.push(`${at}.sha256 = 64자 hex`)
    if (!Array.isArray(by) || by.length === 0 || !by.every((id) => typeof id === "string" && id !== ""))
      problems.push(`${at}.by = plugin id 배열 (1개 이상)`)
  }
  return problems
}
