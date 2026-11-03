/**
 * 새 버전 확인 · 업그레이드 후 이전 안내 (specs/upgrade.md).
 *   이전 항목   CHANGELOG.md 버전 절 (## <version>) 안의 '- 이전: <할 일>' 줄
 *   outdated    npm registry dist-tags.latest + 그 버전 tarball 의 CHANGELOG.md
 *   link        <git common dir>/gnam/version 과 설치 버전 비교
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { git } from "./git.ts"
import { PACKAGE_ROOT } from "./loader.ts"

export interface Migration {
  version: string
  text: string
}

/** major.minor.patch[-pre]. 숫자 비교, prerelease 는 같은 판의 정식보다 낮다 */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string) => {
    const [core = "", pre] = v.trim().replace(/^v/, "").split("-", 2)
    return { nums: core.split(".").map((n) => Number.parseInt(n, 10) || 0), pre: pre ?? null }
  }
  const x = parse(a)
  const y = parse(b)
  for (let i = 0; i < Math.max(x.nums.length, y.nums.length, 3); i++) {
    const d = (x.nums[i] ?? 0) - (y.nums[i] ?? 0)
    if (d !== 0) return Math.sign(d)
  }
  if (x.pre === y.pre) return 0
  if (x.pre === null) return 1
  if (y.pre === null) return -1
  return x.pre < y.pre ? -1 : 1
}

const SECTION = /^##\s+v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)\s*$/
const MIGRATION = /^\s*-\s*이전:\s*(.+?)\s*$/

/** 버전 절마다 이전 항목 (문서 순서) */
export function changelogMigrations(text: string): Migration[] {
  const out: Migration[] = []
  let version: string | null = null
  for (const line of text.split(/\r?\n/)) {
    const section = SECTION.exec(line)
    if (section !== null) {
      version = section[1] ?? null
      continue
    }
    if (/^#{1,2}\s/.test(line)) {
      version = null
      continue
    }
    const migration = MIGRATION.exec(line)
    if (version !== null && migration !== null) out.push({ version, text: migration[1] ?? "" })
  }
  return out
}

/** from 초과 · to 이하 버전의 이전 항목. 오래된 버전부터, 같은 버전 안은 문서 순서 */
export function migrationsBetween(text: string, from: string, to: string): Migration[] {
  if (compareVersions(from, to) >= 0) return []
  const all = changelogMigrations(text)
  const order = new Map<string, number>()
  for (const [i, m] of all.entries()) if (!order.has(m.version)) order.set(m.version, i)
  return all
    .filter((m) => compareVersions(m.version, from) > 0 && compareVersions(m.version, to) <= 0)
    .map((m, i) => ({ m, i }))
    .sort((p, q) => compareVersions(p.m.version, q.m.version) || p.i - q.i)
    .map(({ m }) => m)
}

// ---------- link 의 이전 안내 ----------

export const installedVersion = (): string =>
  (JSON.parse(readFileSync(join(PACKAGE_ROOT, "package.json"), "utf8")) as { version: string }).version

const installedChangelog = (): string => {
  const path = join(PACKAGE_ROOT, "CHANGELOG.md")
  return existsSync(path) ? readFileSync(path, "utf8") : ""
}

/** <git common dir>/gnam/version. git 밖이면 null */
export function versionRecordPath(project: string): string | null {
  const r = git(["rev-parse", "--path-format=absolute", "--git-common-dir"], project)
  return r.ok ? join(r.out.trim(), "gnam", "version") : null
}

export const formatMigrations = (migrations: Migration[]): string[] => migrations.map((m) => `  ${m.version}  ${m.text}`)

/**
 * 기록한 버전보다 설치 버전이 높으면 그 사이 이전 항목을 report 에. 기록은 항상 설치 버전으로.
 * 기록 없음 (첫 link · 새 clone) · 다운그레이드 = 안내 없이 기록만. 네트워크 없음
 */
export function upgradeNotice(
  project: string,
  report: string[],
  installed: string = installedVersion(),
  changelog: () => string = installedChangelog,
): void {
  const path = versionRecordPath(project)
  if (path === null) return
  const recorded = existsSync(path) ? readFileSync(path, "utf8").trim() : ""
  if (recorded === installed) return
  if (recorded !== "" && compareVersions(installed, recorded) > 0) {
    const migrations = migrationsBetween(changelog(), recorded, installed)
    if (migrations.length > 0) report.push(`gnam ${recorded} → ${installed} 이전 항목:`, ...formatMigrations(migrations))
  }
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${installed}\n`)
}
