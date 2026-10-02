import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

/**
 * gnam.json. 저장소 루트에 하나.
 *   format   규약 판. 바꾼 커밋 = 검사 경계 (그 이전 커밋은 그 시점 규약으로 작성됨)
 *   plugins  활성 plugin 표기 (@gnam/<id> · ./로컬경로 · npm 패키지)
 *   <id>     plugin 설정 (예: release)
 */
export const CONFIG_FILE = "gnam.json"
export const FORMAT = 1

export interface GnamConfig {
  format: number
  plugins: string[]
  [plugin: string]: unknown
}

export const configPath = (root: string) => join(root, CONFIG_FILE)

export function readConfig(root: string): GnamConfig | null {
  const path = configPath(root)
  if (!existsSync(path)) return null
  const value = JSON.parse(readFileSync(path, "utf8")) as unknown
  const problems = configProblems(value)
  if (problems.length > 0) throw new Error(`${CONFIG_FILE}: ${problems.join(" · ")}`)
  return value as GnamConfig
}

export function requireConfig(root: string): GnamConfig {
  const config = readConfig(root)
  if (config === null) throw new Error(`${CONFIG_FILE} 없음. npx gnam init 먼저`)
  return config
}

export function writeConfig(root: string, config: GnamConfig): void {
  writeFileSync(configPath(root), `${JSON.stringify(config, null, 2)}\n`)
}

export function configProblems(value: unknown): string[] {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return ["객체가 아님"]
  const { format, plugins } = value as Record<string, unknown>
  const problems: string[] = []
  if (typeof format !== "number" || !Number.isInteger(format) || format < 1) problems.push("format = 1 이상 정수")
  else if (format > FORMAT) problems.push(`format ${format} > 설치된 gnam 이 아는 판 ${FORMAT}. gnam 을 갱신한다`)
  if (!Array.isArray(plugins) || !plugins.every((p) => typeof p === "string" && p !== ""))
    problems.push("plugins = 문자열 배열")
  return problems
}

export const defaultConfig = (): GnamConfig => ({ format: FORMAT, plugins: [] })
