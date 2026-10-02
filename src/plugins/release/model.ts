/**
 * 릴리스 판정 (순수 함수). 규칙은 .agents/skills/gnam-release/references/release.md. git 조회는 release/repo.ts 가 주입한다.
 *
 * 제목    release: <name> <version> · <name> <version>
 * 본문    대상마다 'Package: <name> <version>' 줄로 시작하는 절. 절 본문 = GitHub Release 본문
 * 수준    직전 release 커밋 이후 대상 경로 커밋의 근거에서 계산. 낮추기 불가
 */
import type { ReleaseScheme } from "./config.ts"

export type Level = "patch" | "minor" | "major"
export const LEVELS: readonly Level[] = ["patch", "minor", "major"]

export const RELEASE_SUBJECT = /^release: (.*)$/
const ENTRY = /^(\S+) (\S+)$/
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/
const PACKAGE_LINE = /^Package:[ \t]*(\S+)[ \t]+(\S+)[ \t]*$/
const BREAKING = /^Breaking:[ \t]*\S/m
const PLAN_REF = /^Plan: ([0-9a-f]{7,40})\b/
const PLAN_SUBJECT = /^spec\.[A-Za-z0-9_-]+\.plan: /
const IMPL_SUBJECT = /^spec\.[A-Za-z0-9_-]+\.impl: /

export interface Entry {
  name: string
  version: string
}

/** release 제목의 대상 목록. release 제목이 아니면 null, 형식이 틀린 항목은 invalid 로 */
export function entriesOf(subject: string): { entries: Entry[]; invalid: string[] } | null {
  const match = RELEASE_SUBJECT.exec(subject)
  if (match === null) return null
  const entries: Entry[] = []
  const invalid: string[] = []
  for (const part of (match[1] ?? "").split(" · ")) {
    const entry = ENTRY.exec(part.trim())
    if (entry === null) invalid.push(part)
    else entries.push({ name: entry[1] ?? "", version: entry[2] ?? "" })
  }
  return { entries, invalid }
}

/** 'Package: <name> <version>' 절. 절 본문 = 다음 Package: 줄 전까지 (앞뒤 빈 줄 제외) */
export function sectionsOf(body: string): Map<string, { version: string; notes: string }> {
  const sections = new Map<string, { version: string; lines: string[] }>()
  let current: string[] | null = null
  for (const line of body.split("\n")) {
    const match = PACKAGE_LINE.exec(line)
    if (match !== null) {
      current = []
      sections.set(match[1] ?? "", { version: match[2] ?? "", lines: current })
    } else current?.push(line)
  }
  return new Map([...sections].map(([name, { version, lines }]) => [name, { version, notes: lines.join("\n").trim() }]))
}

export const isSemver = (version: string) => SEMVER.test(version)

function parts(version: string): [number, number, number] | null {
  const match = SEMVER.exec(version)
  return match === null ? null : [Number(match[1]), Number(match[2]), Number(match[3])]
}

/** a > b 이면 양수. 형식이 틀리면 null */
function compareVersions(a: string, b: string): number | null {
  const x = parts(a)
  const y = parts(b)
  if (x === null || y === null) return null
  return x[0] - y[0] || x[1] - y[1] || x[2] - y[2]
}

/** 0.x 는 호환성 깨짐도 minor (SemVer 관례). 1.0.0 은 명시한 버전으로만 */
export function bump(version: string, level: Level): string | null {
  const p = parts(version)
  if (p === null) return null
  const [major, minor, patch] = p
  const effective = major === 0 && level === "major" ? "minor" : level
  if (effective === "major") return `${major + 1}.0.0`
  if (effective === "minor") return `${major}.${minor + 1}.0`
  return `${major}.${minor}.${patch + 1}`
}

/** YYYY.M.N (UTC). 같은 달의 직전 release 가 있으면 N + 1 */
export function calverNext(last: string | null, date: Date): string {
  const prefix = `${date.getUTCFullYear()}.${date.getUTCMonth() + 1}.`
  const n = last?.startsWith(prefix) === true ? Number(last.slice(prefix.length)) + 1 : 0
  return `${prefix}${Number.isInteger(n) ? n : 0}`
}

const maxLevel = (levels: Level[]): Level | null =>
  levels.reduce<Level | null>((a, b) => (a === null || LEVELS.indexOf(b) > LEVELS.indexOf(a) ? b : a), null)

export interface Commit {
  hash: string
  subject: string
  body: string
}

export interface Evidence extends Commit {
  level: Level
  reason: string
}

export interface HistoryLookup {
  subjectOf: (hash: string) => string | null
  bodyOf: (hash: string) => string | null
  /** 직전 release 커밋 이후에 커밋됐는가 (직전 release 가 없으면 true) */
  afterRelease: (hash: string) => boolean
  /** 파일을 바꾼 커밋인가 (빈 plan 이 아닌가) */
  changesFiles: (hash: string) => boolean
}

/** 새 spec 합의 = 직전 release 이후의, spec 을 바꾼 plan */
function newAgreement(hash: string, lookup: HistoryLookup): boolean {
  return PLAN_SUBJECT.test(lookup.subjectOf(hash) ?? "") && lookup.afterRelease(hash) && lookup.changesFiles(hash)
}

/** 대상 경로를 바꾼 커밋 하나의 수준과 근거 */
export function classify(commit: Commit, lookup: HistoryLookup): Evidence {
  const result = (level: Level, reason: string): Evidence => ({ ...commit, level, reason })
  if (BREAKING.test(commit.body)) return result("major", "Breaking: 선언")
  if (!IMPL_SUBJECT.test(commit.subject)) return result("patch", "plan 없는 변경")
  const plan = PLAN_REF.exec(commit.body.split("\n")[0] ?? "")?.[1]
  if (plan === undefined) return result("patch", "Plan: 없음")
  const planBody = lookup.bodyOf(plan) ?? ""
  if (BREAKING.test(planBody)) return result("major", `plan ${plan.slice(0, 7)} Breaking: 선언`)
  if (newAgreement(plan, lookup)) return result("minor", `새 spec 합의 (plan ${plan.slice(0, 7)})`)
  // 수집 plan: 모은 plan (Spec:) 중 새 합의가 있으면 minor
  const gathered = [...planBody.matchAll(/^[ \t]*Spec:[ \t]*([0-9a-f]{7,40})/gm)].map((m) => m[1] ?? "")
  if (gathered.some((hash) => newAgreement(hash, lookup))) return result("minor", `수집 plan 의 새 spec 합의`)
  return lookup.afterRelease(plan)
    ? result("patch", `spec 변경 없는 plan (${plan.slice(0, 7)})`)
    : result("patch", `이미 나간 동작의 수정 (plan ${plan.slice(0, 7)})`)
}

export interface ReleaseState {
  dir: string
  name: string
  scheme: ReleaseScheme
  /** 직전 release 커밋의 이 대상 항목. 없으면 첫 릴리스 */
  last: { hash: string; version: string } | null
  /** 이 커밋 (또는 작업 트리) 의 버전. semver · calver = package.json, openapi = active spec info.version */
  current: string
  /** 부모 커밋의 package.json 버전 (semver · calver). 없으면 null */
  before: string | null
  /** 직전 release 이후 대상 경로 커밋의 근거 (semver 만 계산) */
  evidence: () => Evidence[]
}

/** 릴리스할 수 있는 버전. 빈 배열 = 릴리스할 변경 없음. 첫 번째 = 계산한 최소 */
export function allowedVersions(state: ReleaseState, date: Date): string[] {
  const { scheme, last } = state
  if (scheme === "openapi") {
    const order = last === null ? 1 : compareVersions(state.current, last.version)
    return order !== null && order > 0 ? [state.current] : []
  }
  if (scheme === "calver") return [calverNext(last?.version ?? null, date)]
  // 첫 릴리스: 근거를 잴 기준이 없다. package.json 버전 그대로 (release 커밋에서 정할 수 있다)
  if (last === null) return isSemver(state.current) ? [state.current] : []
  const level = maxLevel(state.evidence().map((e) => e.level))
  if (level === null) return []
  const versions = LEVELS.slice(LEVELS.indexOf(level)).map((l) => bump(last.version, l))
  return [...new Set(versions.filter((v) => v !== null))]
}

export interface Problem {
  rule: string
  why: string
  current: string
  fix: string
}

const WHY_VERSION =
  "릴리스 버전은 직전 release 이후 커밋의 근거에서 계산한다 (.agents/skills/gnam-release/references/release.md). 낮추면 호환성 신호가 사라진다."

/** release: 커밋 검사. files = 이 커밋이 바꾼 파일 */
export function releaseProblems(
  subject: string,
  body: string,
  files: string[] | null,
  states: ReleaseState[],
  date: Date,
): Problem[] {
  const problems: Problem[] = []
  const add = (rule: string, why: string, current: string, fix: string) => problems.push({ rule, why, current, fix })
  const parsed = entriesOf(subject)
  if (parsed === null) return problems
  const { entries, invalid } = parsed
  if (entries.length === 0 || invalid.length > 0)
    add(
      "release-subject",
      "제목의 대상 목록이 태그 · GitHub Release 생성 기준이다.",
      invalid.length > 0 ? invalid.join(" · ") : subject,
      "제목을 'release: <package name> <version> · <package name> <version>' 로 쓴다.",
    )
  const names = entries.map((e) => e.name)
  for (const name of names.filter((n, i) => names.indexOf(n) !== i))
    add("release-subject", "대상 하나에 버전 하나.", name, "중복 항목을 지운다.")

  const sections = sectionsOf(body)
  const allowedFiles = new Set<string>()
  for (const { name, version } of entries) {
    const state = states.find((s) => s.name === name)
    if (state === undefined) {
      add(
        "release-target",
        "릴리스 대상은 gnam.json release.targets 가 정한다.",
        name,
        `대상 package name 중 하나를 쓴다: ${states.map((s) => s.name).join(" · ") || "(없음)"}`,
      )
      continue
    }
    if (state.scheme !== "openapi") allowedFiles.add(`${state.dir}/package.json`)
    const allowed = allowedVersions(state, date)
    if (!allowed.includes(version)) {
      const evidence = state.scheme === "semver" && state.last !== null ? state.evidence() : []
      add(
        "release-version",
        WHY_VERSION,
        `${name} ${version} (직전 ${state.last?.version ?? "없음"}${evidence.length > 0 ? `, 근거 ${evidence.map((e) => `${e.hash.slice(0, 7)} ${e.level}`).join(" · ")}` : ""})`,
        allowed.length === 0
          ? "직전 release 이후 변경이 없다. 이 대상을 제목에서 뺀다."
          : `허용 버전: ${allowed.join(" · ")}. gnam run release bump 가 계산한다.`,
      )
    } else if (state.current !== version)
      add(
        "release-version",
        "제목 버전과 실제 버전이 같아야 태그가 코드와 맞는다.",
        `${name}: 제목 ${version}, ${state.scheme === "openapi" ? "active spec info.version" : `${state.dir}/package.json`} ${state.current}`,
        state.scheme === "openapi"
          ? "info.version 은 check:api 가 정한다. 제목을 그 값으로 쓴다."
          : `${state.dir}/package.json version 을 ${version} 으로 바꾼다 (gnam run release bump).`,
      )
    const section = sections.get(name)
    if (section === undefined || section.version !== version || section.notes === "")
      add(
        "release-section",
        "절 본문이 GitHub Release 본문이 된다. 대상마다 변경 요약이 있어야 한다.",
        section === undefined
          ? `Package: ${name} 절 없음`
          : `Package: ${name} ${section.version} (본문 ${section.notes === "" ? "없음" : "있음"})`,
        `본문에 'Package: ${name} ${version}' 줄과 그 아래 제품 말 요약을 쓴다.`,
      )
  }
  for (const name of [...sections.keys()].filter((n) => !names.includes(n)))
    add(
      "release-section",
      "제목에 없는 절은 태그가 만들어지지 않는다.",
      `Package: ${name}`,
      "제목에 추가하거나 절을 지운다.",
    )
  for (const file of (files ?? []).filter((f) => !allowedFiles.has(f)))
    add(
      "release-files",
      "release 커밋은 버전만 바꾼다. 변경은 앞선 커밋에 두어야 근거 계산에 들어간다.",
      file,
      "이 파일 변경을 별도 커밋으로 나눈다.",
    )
  return problems
}

/** release 가 아닌 커밋이 대상 버전을 바꿨는가 */
export function outsideProblems(states: ReleaseState[]): Problem[] {
  return states
    .filter((s) => s.scheme !== "openapi" && s.before !== null && s.before !== s.current)
    .map((s) => ({
      rule: "version-outside",
      why: "버전은 release 커밋에서만 바뀐다. 그래야 버전 변경마다 근거와 태그가 남는다.",
      current: `${s.dir}/package.json version ${s.before} → ${s.current}`,
      fix: "버전 변경을 되돌리고 gnam run release bump 로 release 커밋을 만든다.",
    }))
}

/** GitHub Release 본문 초안. 근거 목록을 제품 말 요약으로 바꾸는 것은 작성자 몫 */
export function draftMessage(picks: { state: ReleaseState; version: string }[]): string {
  const subject = `release: ${picks.map((p) => `${p.state.name} ${p.version}`).join(" · ")}`
  const sections = picks.map(({ state, version }) => {
    const evidence = state.scheme === "semver" && state.last !== null ? state.evidence() : []
    const breaking = evidence.filter((e) => e.level === "major")
    const lines = [
      `Package: ${state.name} ${version}`,
      ...breaking.map((e) => `- Breaking: ${e.subject} (${e.hash.slice(0, 7)})`),
      ...evidence.filter((e) => e.level !== "major").map((e) => `- ${e.subject} (${e.hash.slice(0, 7)}, ${e.level})`),
    ]
    if (lines.length === 1) lines.push(state.last === null ? "- 첫 릴리스" : "- <변경 요약>")
    return lines.join("\n")
  })
  return [subject, ...sections].join("\n\n")
}
