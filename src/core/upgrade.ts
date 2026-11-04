/**
 * 새 버전 확인 · 업그레이드 후 이전 안내 (specs/upgrade.md).
 *   이전 항목   CHANGELOG.md 버전 절 (## <version> · ## [<version>](…)) 안의 '- 이전: <할 일>' 줄 · BREAKING CHANGES 절의 '이전:'
 *   outdated    npm registry dist-tags.latest + 그 버전 tarball 의 CHANGELOG.md
 *   link        <git common dir>/gnam/version 과 설치 버전 비교
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { gunzipSync } from "node:zlib"
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

const SECTION = /^##\s+(?:v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)|\[v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)\]\([^)]*\)(?:\s+\([^)]*\))?)\s*$/
const MIGRATION = /^\s*-\s*이전:\s*(.+?)\s*$/
/** release-please 의 BREAKING CHANGES 절 머리 (### ⚠ BREAKING CHANGES) */
const BREAKING = /^###\s+(?:⚠\s*)?BREAKING CHANGES\s*$/
/** BREAKING CHANGES 절의 목록 줄 중 '이전:' 뒤. 끝의 커밋 링크 ([hash](url)) 는 뺀다 */
const BREAKING_MIGRATION = /^\s*[-*]\s.*?이전:\s*(.+?)\s*$/
const COMMIT_LINK = /\s*\(\[[0-9a-f]{7,40}\]\([^)]*\)\)\s*$/

/**
 * 버전 절마다 이전 항목 (문서 순서).
 * 절 머리 = '## <version>' · '## [<version>](<link>) (<date>)' (release-please).
 * 이전 항목 = '- 이전: <할 일>' 줄 · BREAKING CHANGES 절의 '이전:' 을 포함한 목록 줄
 */
export function changelogMigrations(text: string): Migration[] {
  const out: Migration[] = []
  let version: string | null = null
  let breaking = false
  for (const line of text.split(/\r?\n/)) {
    const section = SECTION.exec(line)
    if (section !== null) {
      version = section[1] ?? section[2] ?? null
      breaking = false
      continue
    }
    if (/^#{1,2}\s/.test(line)) {
      version = null
      continue
    }
    if (/^###\s/.test(line)) {
      breaking = BREAKING.test(line)
      continue
    }
    if (version === null) continue
    const migration = MIGRATION.exec(line) ?? (breaking ? BREAKING_MIGRATION.exec(line) : null)
    const value = (migration?.[1] ?? "").replace(COMMIT_LINK, "").trim()
    if (migration !== null && value !== "") out.push({ version, text: value })
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

// ---------- gnam outdated ----------

export const PACKAGE_NAME = "@obov/gnam"
const TIMEOUT_MS = 2000

/** npm_config_registry (npm · 사내 registry) 를 따른다 */
export const registryUrl = (): string => (process.env["npm_config_registry"] ?? "https://registry.npmjs.org").replace(/\/$/, "")

export interface Outdated {
  installed: string
  latest: string
  /** 새 버전이 없으면 null */
  upgrade: string | null
  migrations: Migration[]
}

async function get(url: string, accept?: string): Promise<Response> {
  const response = await fetch(url, {
    headers: accept === undefined ? {} : { accept },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`)
  return response
}

/** tar (ustar) 에서 파일 하나. 없으면 null */
export function tarEntry(tar: Uint8Array, wanted: string): Buffer | null {
  const text = (from: number, to: number) => Buffer.from(tar.subarray(from, to)).toString("utf8").replace(/\0.*$/s, "")
  for (let at = 0; at + 512 <= tar.length; ) {
    const name = text(at, at + 100)
    if (name === "") return null
    const prefix = text(at + 345, at + 500)
    const size = Number.parseInt(text(at + 124, at + 136).trim() || "0", 8)
    const full = prefix === "" ? name : `${prefix}/${name}`
    if (full === wanted) return Buffer.from(tar.subarray(at + 512, at + 512 + size))
    at += 512 + Math.ceil(size / 512) * 512
  }
  return null
}

export const upgradeCommand = (pm: "bun" | "pnpm" | "yarn" | "npm"): string =>
  pm === "npm" ? `npm install -D ${PACKAGE_NAME}@latest` : `${pm} add -D ${PACKAGE_NAME}@latest`

/** registry dist-tags.latest 와 비교. 새 버전이면 그 tarball 의 CHANGELOG.md 에서 이전 항목 */
export async function outdated(
  pm: "bun" | "pnpm" | "yarn" | "npm",
  installed: string = installedVersion(),
  registry: string = registryUrl(),
): Promise<Outdated> {
  const meta = (await (await get(`${registry}/${PACKAGE_NAME.replace("/", "%2f")}`, "application/vnd.npm.install-v1+json")).json()) as {
    "dist-tags"?: { latest?: string }
    versions?: Record<string, { dist?: { tarball?: string } }>
  }
  const latest = meta["dist-tags"]?.latest
  if (latest === undefined) throw new Error(`${registry}: ${PACKAGE_NAME} dist-tags.latest 없음`)
  if (compareVersions(latest, installed) <= 0) return { installed, latest, upgrade: null, migrations: [] }
  const tarball = meta.versions?.[latest]?.dist?.tarball
  if (tarball === undefined) throw new Error(`${registry}: ${PACKAGE_NAME}@${latest} tarball 없음`)
  const tar = gunzipSync(Buffer.from(await (await get(tarball)).arrayBuffer()))
  const changelog = tarEntry(tar, "package/CHANGELOG.md")?.toString("utf8") ?? ""
  return { installed, latest, upgrade: upgradeCommand(pm), migrations: migrationsBetween(changelog, installed, latest) }
}

export function formatOutdated(o: Outdated): string[] {
  if (o.upgrade === null) return [`gnam ${o.installed} (latest ${o.latest}) · 최신`]
  return [
    `gnam ${o.installed} → ${o.latest} (latest)`,
    `업그레이드  ${o.upgrade}`,
    ...(o.migrations.length > 0 ? ["이전 항목", ...o.migrations.map((m) => `  ${m.version}  ${m.text}`)] : []),
  ]
}
