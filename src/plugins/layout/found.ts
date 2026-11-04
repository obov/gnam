/** Found → Violation 변환 · layout.json 형식 문제 */
import type { Violation } from "../../core/plugin.ts"
import { LAYOUT_FILE } from "./config.ts"
import type { Found } from "./match.ts"

export const toViolation = (found: Found, level: "warn" | "error"): Violation => ({
  rule: found.rule,
  why: found.why,
  current: found.current,
  fix: found.fix,
  level,
})

export const schemaFound = (problems: string[]): Found[] =>
  problems.map((p) => ({
    rule: "layout/schema",
    path: LAYOUT_FILE,
    key: `layout/schema\0${p}`,
    why: `${LAYOUT_FILE} 형식 (specs/layout.md)`,
    current: p,
    fix: `${LAYOUT_FILE} 를 고친다 → layout: 커밋. 형식: .agents/skills/gnam-layout/references/layout.md`,
  }))
