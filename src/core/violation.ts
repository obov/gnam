/** 검사 결과 하나. rule = "<영역>/<규칙>" (예: commit/subject) */
export interface Violation {
  rule: string
  why: string
  current: string
  fix: string
}

export function format(violations: Violation[]): string {
  return violations
    .map((v) => `GNAM/${v.rule}\n\nWhy:\n${v.why}\n\nCurrent:\n${v.current}\n\nFix:\n${v.fix}`)
    .join("\n\n---\n\n")
}
