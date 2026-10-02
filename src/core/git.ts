import { spawnSync } from "node:child_process"

export interface Result {
  ok: boolean
  out: string
  err: string
}

/** 명령 실행. node · bun 공통 (child_process) */
export function exec(cmd: string, args: string[], cwd: string, input?: string): Result {
  const result = spawnSync(cmd, args, { cwd, encoding: "utf8", input, maxBuffer: 256 * 1024 * 1024 })
  return { ok: result.status === 0, out: result.stdout ?? "", err: result.stderr ?? String(result.error ?? "") }
}

export const git = (args: string[], cwd: string): Result => exec("git", args, cwd)

/** 실패를 빈 결과로 삼키지 않는다 */
export function gitOrThrow(args: string[], cwd: string): string {
  const result = git(args, cwd)
  if (!result.ok) throw new Error(`git ${args.join(" ")} 실패\n${result.err}`)
  return result.out
}

export const nulList = (text: string): string[] => text.split("\0").filter(Boolean)
export const lines = (text: string): string[] => text.split("\n").filter(Boolean)

/** 저장소 최상위. git 밖이면 null */
export function topLevel(cwd: string): string | null {
  const result = git(["rev-parse", "--show-toplevel"], cwd)
  return result.ok ? result.out.trim() : null
}

/** 명령이 PATH 에 있는가 */
export function which(cmd: string): boolean {
  return exec(process.platform === "win32" ? "where" : "which", [cmd], process.cwd()).ok
}
