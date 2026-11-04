/**
 * gnam.json "export" (specs/export.md 설정). 자격은 gnam.json 에 두지 않는다.
 */
export interface ExportTarget {
  /** 내보낼 하위 폴더 (저장소 루트 기준). 배포 저장소의 루트 */
  path: string
  /** 배포 저장소 URL (https · ssh · file) */
  repo: string
  branch: string
  /** 원본 경로 → 배포 저장소 안 경로 */
  include: Record<string, string>
  /** 배포 저장소 태그 형식. {version} 치환. null = 태그 없음 */
  tag: string | null
  /** 버전 한 줄 파일 (저장소 루트 기준). tag 가 있으면 필수 */
  version: string | null
}

export interface ExportConfig {
  targets: Record<string, ExportTarget>
}

export const ID = /^[a-z][a-z0-9-]*$/
const PATH = /^[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)*$/
const BRANCH = /^[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)*$/
const TARGET_KEYS = ["path", "repo", "branch", "include", "tag", "version"]
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/
/** git check-ref-format 의 대표 금지 문자 */
const BAD_REF = /[\s~^:?*[\\]|\.\.|@\{|^[./-]|[./]$|\.lock$/

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v)

export const isVersion = (v: string) => SEMVER.test(v)

/** 저장소 안 상대 경로 (. · .. 조각 · 끝 / 없음) */
export const isRepoPath = (p: unknown): p is string =>
  typeof p === "string" && PATH.test(p) && p.split("/").every((s) => s !== "." && s !== "..")

/** a 와 b 가 같거나 한쪽이 다른 쪽 아래 */
export const overlaps = (a: string, b: string) => a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`)

/** 자격이 들어간 URL 이면 그 설명, 아니면 null */
function repoProblem(repo: string): string | null {
  if (/^[\w.-]+@[\w.-]+:[^/].*$/.test(repo)) return null // scp 형식 ssh (git@host:owner/name.git)
  let url: URL
  try {
    url = new URL(repo)
  } catch {
    return "https · ssh URL"
  }
  if (!["https:", "ssh:", "file:"].includes(url.protocol)) return "https · ssh URL"
  if (url.password !== "" || (url.protocol === "https:" && url.username !== ""))
    return "URL 에 자격 금지 (git 자격 도우미 · ssh key 를 쓴다)"
  return null
}

export function exportConfigProblems(value: unknown): string[] {
  if (value === undefined) return []
  if (!isObject(value)) return ["export = 객체"]
  const problems = Object.keys(value)
    .filter((k) => k !== "targets")
    .map((k) => `export 알 수 없는 키 ${k}`)
  const { targets } = value
  if (!isObject(targets) || Object.keys(targets).length === 0) {
    problems.push('export.targets = { "<id>": { path · repo … } } (1개 이상)')
    return problems
  }
  const paths: [string, string][] = []
  for (const [id, target] of Object.entries(targets)) {
    const at = `export.targets.${id}`
    if (!ID.test(id)) problems.push(`${at}: id = [a-z][a-z0-9-]*`)
    if (!isObject(target)) {
      problems.push(`${at} = 객체`)
      continue
    }
    for (const k of Object.keys(target).filter((k) => !TARGET_KEYS.includes(k))) problems.push(`${at} 알 수 없는 키 ${k}`)
    const { path, repo, branch, include, tag, version } = target
    if (!isRepoPath(path)) problems.push(`${at}.path 필수 (저장소 루트 기준 폴더, 끝 / 없이)`)
    else paths.push([id, path])
    if (typeof repo !== "string" || repo === "") problems.push(`${at}.repo 필수 (배포 저장소 URL)`)
    else {
      const problem = repoProblem(repo)
      if (problem !== null) problems.push(`${at}.repo: ${problem}`)
    }
    if (branch !== undefined && (typeof branch !== "string" || !BRANCH.test(branch) || BAD_REF.test(branch)))
      problems.push(`${at}.branch = 브랜치 이름`)
    if (include !== undefined) {
      if (!isObject(include)) problems.push(`${at}.include = { "<원본 경로>": "<배포 저장소 안 경로>" }`)
      else {
        const dests: string[] = []
        for (const [from, to] of Object.entries(include)) {
          if (!isRepoPath(from)) problems.push(`${at}.include ${from}: 원본 = 저장소 루트 기준 경로`)
          else if (isRepoPath(path) && overlaps(from, path)) problems.push(`${at}.include ${from}: path 와 겹침 (이미 배포 트리에 있다)`)
          if (!isRepoPath(to)) problems.push(`${at}.include ${from}: 대상 = 배포 저장소 안 경로`)
          else {
            const clash = dests.find((d) => overlaps(d, to))
            if (clash !== undefined) problems.push(`${at}.include ${from}: 대상 ${to} 가 ${clash} 와 겹침`)
            dests.push(to)
          }
        }
      }
    }
    if (tag !== undefined) {
      if (typeof tag !== "string" || !tag.includes("{version}")) problems.push(`${at}.tag 에 {version} 필요`)
      else if (BAD_REF.test(tag.replaceAll("{version}", "1.0.0"))) problems.push(`${at}.tag: 태그 이름으로 쓸 수 없는 문자`)
      if (version === undefined) problems.push(`${at}.version 필수 (tag 가 있으면)`)
    }
    if (version !== undefined && !isRepoPath(version)) problems.push(`${at}.version = 저장소 루트 기준 파일 경로`)
  }
  for (const [i, [id, path]] of paths.entries())
    for (const [other, otherPath] of paths.slice(i + 1))
      if (overlaps(path, otherPath)) problems.push(`export.targets.${id}.path 가 ${other} 의 path 와 겹침`)
  return problems
}

/** 형식이 맞으면 기본값을 채운 설정, 없거나 틀리면 null */
export function exportConfigOf(value: unknown): ExportConfig | null {
  if (value === undefined || !isObject(value) || exportConfigProblems(value).length > 0) return null
  const targets = value["targets"] as Record<string, Record<string, unknown>>
  return {
    targets: Object.fromEntries(
      Object.entries(targets).map(([id, t]) => [
        id,
        {
          path: t["path"] as string,
          repo: t["repo"] as string,
          branch: (t["branch"] as string | undefined) ?? "main",
          include: (t["include"] as Record<string, string> | undefined) ?? {},
          tag: (t["tag"] as string | undefined) ?? null,
          version: (t["version"] as string | undefined) ?? null,
        },
      ]),
    ),
  }
}

/** 배포 브랜치 (원본 저장소 로컬) */
export const branchOf = (id: string) => `refs/heads/gnam/export/${id}`

/** 이 대상의 변경을 판정하는 원본 경로 (path + include 원본) */
export const sourcePaths = (t: ExportTarget) => [t.path, ...Object.keys(t.include)]

export const tagName = (t: ExportTarget, version: string) => (t.tag === null ? null : t.tag.replaceAll("{version}", version))
