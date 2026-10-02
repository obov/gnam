/**
 * plugin 계약. 내장 plugin (@gnam/<id>) · 로컬 plugin (./경로) · npm 패키지가 같은 형식을 쓴다.
 *
 *   import { definePlugin } from "gnam/plugin"
 *   export default definePlugin({ id: "x", version: "0.1.0", kinds: [...] })
 */
import type { GnamConfig } from "./config.ts"
import type { Violation } from "./violation.ts"

export type { Violation } from "./violation.ts"
export type { GnamConfig } from "./config.ts"

/** 검사 시점. index = commit-msg hook (staged), commit = 이미 있는 커밋 (verify · CI) */
export type View = { kind: "index" } | { kind: "commit"; sha: string }

export interface CommitContext {
  cwd: string
  view: View
  config: GnamConfig
  message: string
  subject: string
  body: string
  /** 이 커밋이 바꾼 파일. 알 수 없으면 null */
  files: string[] | null
  /** 부모가 둘 이상인 커밋 (hook 에서는 merge 진행 중) */
  merge: boolean
  /** hash → 그 커밋 제목. 없으면 null */
  subjectOf: (hash: string) => string | null
  /** hash → 그 커밋 본문. 없으면 null */
  bodyOf: (hash: string) => string | null
  /** 이 커밋 시점에 specs/<topic>.md 가 있는가 */
  specExists: (topic: string) => boolean
  /** hash 가 이 커밋의 조상인가 (먼저 커밋됐는가) */
  isAncestor: (hash: string) => boolean
  /** 활성 plugin id 목록 */
  plugins: string[]
}

/** 커밋 종류 하나. 제목이 subject 에 맞으면 이 종류가 커밋 검사를 맡는다 */
export interface CommitKind {
  /** 오류 메시지에 보이는 제목 형식. 예: "run.<topic>.<start|end|policy>: …" */
  label: string
  subject: RegExp
  validate(ctx: CommitContext): Violation[]
}

export interface Command {
  describe: string
  run(args: string[], cwd: string, config: GnamConfig): number | Promise<number>
}

export interface GnamPlugin {
  id: string
  version: string
  /** 함께 켜야 하는 plugin id. add 때 빠진 내장 plugin 은 자동 추가 */
  requires?: string[]
  /** 이 plugin 이 소유하는 커밋 종류 */
  kinds?: CommitKind[]
  /** 모든 커밋에 덧붙이는 검사. owner = 그 커밋 제목을 맡은 종류의 소유자 ("core" 또는 plugin id) */
  everyCommit?(ctx: CommitContext, owner: string): Violation[]
  /** gnam verify 의 저장소 파일 검사. files = git 추적 · 미추적 (무시 제외) 파일 */
  verify?(cwd: string, files: string[], config: GnamConfig): Violation[]
  /** gnam.json 의 이 plugin 설정 (config[id]) 형식 문제 */
  configProblems?(value: unknown): string[]
  /** gnam run <id> <name> */
  commands?: Record<string, Command>
  /** plugin 루트 기준 스킬 디렉터리. .agents/skills · .claude/skills 에 symlink */
  skills?: string[]
  /** plugin 루트 기준 AGENTS.md 조각 */
  agentsMd?: string
  /** 없을 때만 만드는 파일. 저장소 경로 → plugin 루트 기준 원본 */
  scaffold?: Record<string, string>
}

export function definePlugin(plugin: GnamPlugin): GnamPlugin {
  return plugin
}
