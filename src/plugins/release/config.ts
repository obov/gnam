/** gnam.json "release". 있으면 릴리스 사용. 없으면 release: 커밋 · version 검사 · 태그 생성을 하지 않는다 */
export const RELEASE_SCHEMES = ["semver", "calver", "openapi"] as const
export type ReleaseScheme = (typeof RELEASE_SCHEMES)[number]
const RELEASE_ADVISORS = ["jev"] as const
const RELEASE_KEYS = ["targets", "advisor"]
const TARGET_DIR = /^[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)*$/

export interface ReleaseConfig {
  /** 저장소 기준 package 디렉터리 → 방식. 예: { "packages/api": "openapi", "apps/web/site": "calver" } */
  targets: Record<string, ReleaseScheme>
  /** 로컬 보조 판정 (Breaking: 선언 누락 경고). CI 는 쓰지 않는다 */
  advisor?: (typeof RELEASE_ADVISORS)[number]
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v)

export function releaseConfigProblems(release: unknown): string[] {
  if (release === undefined) return []
  if (!isObject(release)) return ["release = 객체"]
  const problems = Object.keys(release)
    .filter((k) => !RELEASE_KEYS.includes(k))
    .map((k) => `release 알 수 없는 키 ${k}`)
  const { targets, advisor } = release
  if (!isObject(targets) || Object.keys(targets).length === 0)
    problems.push('release.targets = { "<package 디렉터리>": 방식 } (1개 이상)')
  else
    for (const [dir, scheme] of Object.entries(targets)) {
      if (!TARGET_DIR.test(dir)) problems.push(`release.targets ${dir} = 저장소 기준 디렉터리 (끝 / 없이)`)
      if (!(RELEASE_SCHEMES as readonly unknown[]).includes(scheme))
        problems.push(`release.targets ${dir} = ${RELEASE_SCHEMES.join(" · ")} 중 하나`)
    }
  if (advisor !== undefined && !(RELEASE_ADVISORS as readonly unknown[]).includes(advisor))
    problems.push(`release.advisor = ${RELEASE_ADVISORS.join(" · ")} 중 하나`)
  return problems
}

/** 설정 없음 = null */
export const releaseConfigOf = (value: unknown): ReleaseConfig | null =>
  value === undefined ? null : (value as ReleaseConfig)

/** OpenAPI YAML 의 info.version. 최상위 info: 블록의 바로 아래 단계 version: 만 읽는다 (YAML 의존 없이) */
export function infoVersion(text: string): string | null {
  const lines = text.split("\n")
  const start = lines.findIndex((l) => /^info:\s*(#.*)?$/.test(l))
  if (start < 0) return null
  let indent = -1
  for (const line of lines.slice(start + 1)) {
    if (line.trim() === "" || line.trim().startsWith("#")) continue
    if (/^\S/.test(line)) break
    const at = line.search(/\S/)
    if (indent < 0) indent = at
    if (at !== indent) continue
    const m = /^\s+version:\s*(?:"([^"]*)"|'([^']*)'|([^\s#]+))/.exec(line)
    if (m !== null) return m[1] ?? m[2] ?? m[3] ?? null
  }
  return null
}
