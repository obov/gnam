/**
 * plugin 의 외부 스킬 의존 (specs/skills.md).
 *   선언   GnamPlugin.skillDeps = [{ name · source (github:<owner>/<repo>[/<경로>]) · ref }]
 *   잠금   gnam.json skills = name → { source · ref · commit · sha256 · by }
 *   저장   .gnam/skills/<name>/ (커밋 대상). .claude/skills · .agents/skills 에 상대 링크
 */
import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import {
  chmodSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
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

// ---------- 받기 ----------

/** 저장 위치 (프로젝트 기준) */
export const SKILLS_DIR = ".gnam/skills"

/** 테스트 · 사내 미러용 git 기준 URL. <base>/<owner>/<repo>.git */
const GIT_BASE_ENV = "GNAM_SKILL_GIT_BASE"

export function repoUrl(source: GithubSource): string {
  const base = process.env[GIT_BASE_ENV] ?? "https://github.com"
  return `${base.replace(/\/$/, "")}/${source.owner}/${source.repo}.git`
}

function run(args: string[], cwd: string): { ok: boolean; out: string; err: string } {
  const r = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  })
  return { ok: r.status === 0, out: r.stdout ?? "", err: r.stderr ?? String(r.error ?? "") }
}

function must(args: string[], cwd: string): string {
  const r = run(args, cwd)
  if (!r.ok) throw new Error(`git ${args.join(" ")} 실패\n${r.err.trim()}`)
  return r.out
}

/** 디렉터리 안 일반 파일 (상대 경로, / 구분, 정렬). symlink · .git 은 제외하고 skipped 에 */
function walk(root: string): { files: string[]; skipped: string[] } {
  const files: string[] = []
  const skipped: string[] = []
  const visit = (rel: string) => {
    for (const entry of readdirSync(join(root, rel), { withFileTypes: true })) {
      const path = rel === "" ? entry.name : `${rel}/${entry.name}`
      if (entry.name === ".git") continue
      if (entry.isSymbolicLink()) skipped.push(path)
      else if (entry.isDirectory()) visit(path)
      else if (entry.isFile()) files.push(path)
      else skipped.push(path)
    }
  }
  visit("")
  files.sort()
  return { files, skipped: skipped.sort() }
}

/** 내용 해시. 파일마다 '<sha256(내용)>  <상대 경로>' 줄을 경로순으로 이어서 sha256 */
export function contentHash(dir: string): string {
  const { files } = walk(dir)
  const lines = files.map((f) => `${createHash("sha256").update(readFileSync(join(dir, f))).digest("hex")}  ${f}\n`)
  return createHash("sha256").update(lines.join("")).digest("hex")
}

export interface Fetched {
  commit: string
  sha256: string
  /** 받지 않은 symlink · 특수 파일 (상대 경로) */
  skipped: string[]
}

/** ref → commit. tag · origin 브랜치 · sha 순 */
function resolveRef(repo: string, ref: string): string {
  for (const candidate of [`refs/tags/${ref}`, `refs/remotes/origin/${ref}`, ref]) {
    const r = run(["rev-parse", "--verify", "--quiet", `${candidate}^{commit}`], repo)
    if (r.ok) return r.out.trim()
  }
  throw new Error(`ref 없음: ${ref}`)
}

/**
 * dep 을 받아 <project>/.gnam/skills/<name>/ 에 둔다. 실패하면 기존 디렉터리를 그대로 둔다.
 * 받은 내용은 프로젝트 안 임시 디렉터리에서 SKILL.md · 해시 확인 후 교체 (같은 파일 시스템에서 rename).
 */
export function fetchSkill(project: string, dep: SkillDep, pinned?: string): Fetched {
  const source = parseSource(dep.source)
  if (source === null) throw new Error(`${dep.name}: source 형식 (${dep.source})`)
  const work = mkdtempSync(join(tmpdir(), "gnam-skill-"))
  const base = join(project, SKILLS_DIR)
  mkdirSync(base, { recursive: true })
  const stage = mkdtempSync(join(base, `.${dep.name}.tmp-`))
  try {
    const repo = join(work, "repo")
    must(["clone", "--quiet", "--no-checkout", "--filter=blob:none", repoUrl(source), repo], work)
    const commit = pinned ?? resolveRef(repo, dep.ref)
    if (source.path !== "") must(["sparse-checkout", "set", "--no-cone", `/${source.path}/`], repo)
    must(["-c", "advice.detachedHead=false", "checkout", "--quiet", "--detach", commit], repo)
    const from = source.path === "" ? repo : join(repo, ...source.path.split("/"))
    if (!existsSync(from) || !lstatSync(from).isDirectory()) throw new Error(`${dep.name}: 경로 없음 (${source.path} @ ${commit.slice(0, 7)})`)
    const { files, skipped } = walk(from)
    if (!files.includes("SKILL.md")) throw new Error(`${dep.name}: SKILL.md 없음 (${dep.source} @ ${commit.slice(0, 7)})`)
    for (const file of files) {
      const to = join(stage, ...file.split("/"))
      mkdirSync(dirname(to), { recursive: true })
      copyFileSync(join(from, ...file.split("/")), to)
      chmodSync(to, statSync(join(from, ...file.split("/"))).mode & 0o777)
    }
    const sha256 = contentHash(stage)
    const target = join(base, dep.name)
    const old = existsSync(target) ? `${stage}.old` : null
    if (old !== null) renameSync(target, old)
    try {
      renameSync(stage, target)
    } catch (error) {
      if (old !== null) renameSync(old, target)
      throw error
    }
    if (old !== null) rmSync(old, { recursive: true, force: true })
    return { commit, sha256, skipped }
  } finally {
    rmSync(work, { recursive: true, force: true })
    rmSync(stage, { recursive: true, force: true })
  }
}
