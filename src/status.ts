/**
 * 프로그래밍 API: gnam status 트리 (형식 적용 전 값). specs/info.md '프로그래밍 API'.
 *
 *   import { status } from "@obov/gnam/status"
 *   const tree = await status({ cwd: "/repo", paths: ["trace"], since: lastHead })
 */
import { realProject } from "./core/project.ts"
import { collectStatus } from "./core/status.ts"

export interface StatusApiOptions {
  /** 저장소 안 아무 경로. 기본 process.cwd() */
  cwd?: string
  /** 고를 최상위 경로 (계산 범위를 좁힌다). 비면 전체 */
  paths?: string[]
  deep?: boolean
  since?: string
}

export async function status(options: StatusApiOptions = {}): Promise<Record<string, unknown>> {
  const { cwd = process.cwd(), paths, deep, since } = options
  return collectStatus({ cwd: realProject(cwd), paths, deep, since })
}

export type { Trace, Plan, Request, Step, Impl, Item, Topic } from "./core/trace.ts"
