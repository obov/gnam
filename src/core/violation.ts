/** 검사 결과 하나. rule = "<영역>/<규칙>" (예: commit/subject) */
export interface Violation {
  rule: string
  why: string
  current: string
  fix: string
  /** warn = 출력만 하고 실패시키지 않는다. 없으면 error */
  level?: "error" | "warn"
}

export const isError = (v: Violation) => v.level !== "warn"

export function format(violations: Violation[]): string {
  return violations
    .map((v) => `GNAM/${v.rule}${v.level === "warn" ? " (warn)" : ""}\n\nWhy:\n${v.why}\n\nCurrent:\n${v.current}\n\nFix:\n${v.fix}`)
    .join("\n\n---\n\n")
}
