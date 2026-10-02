import { readFileSync } from "node:fs"
import { join } from "node:path"
import type { Violation } from "../../core/violation.ts"
const readText = (path: string) => readFileSync(path, "utf8")

export const LORE_DIR = "lore/"
const LORE_INDEX = "lore/README.md"
const LORE_FILE = /^lore\/[a-z0-9]+(?:-[a-z0-9]+)*\.md$/
export const LORE_FIELDS = {
  When: /^When:\s*\S/,
  Basis: /^Basis:\s*(실측|경험칙)\s*$/,
  Evidence: /^Evidence:\s*\S/,
} as const

/** ## 항목별 누락 필드. 코드 블록 안 줄은 보지 않는다. 항목이 없으면 null */
export function loreEntryProblems(source: string): string[] | null {
  const entries: { title: string; lines: string[] }[] = []
  let fenced = false
  for (const line of source.split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced
    if (fenced) continue
    if (line.startsWith("## ")) entries.push({ title: line.slice(3).trim(), lines: [] })
    else entries.at(-1)?.lines.push(line.trim())
  }
  if (entries.length === 0) return null
  return entries.flatMap(({ title, lines }) =>
    Object.entries(LORE_FIELDS)
      .filter(([, pattern]) => !lines.some((l) => pattern.test(l)))
      .map(([field]) => `'${title}' ${field}: 없음`),
  )
}

export function loreViolations(cwd: string, files: string[]): Violation[] {
  const violations: Violation[] = []
  const lore = files.filter((f) => f.startsWith(LORE_DIR) && f !== LORE_INDEX)
  const index = files.includes(LORE_INDEX) ? readText(join(cwd, LORE_INDEX)) : null
  for (const file of lore) {
    if (!LORE_FILE.test(file)) {
      violations.push({
        rule: "lore/location",
        why: "lore 는 주제별 markdown 한 층이다. 하위 디렉터리 · 다른 형식은 인덱스와 검사에서 빠진다.",
        current: file,
        fix: "lore/<kebab-case 주제>.md 로 옮긴다. 자료 (스크린샷 · 데이터) 는 researches/ 등 다른 곳에 두고 Evidence 로 가리킨다.",
      })
      continue
    }
    const problems = loreEntryProblems(readText(join(cwd, file)))
    if (problems === null || problems.length > 0) {
      violations.push({
        rule: "lore/entry-fields",
        why: "적용 조건 · 근거 수준 · 근거가 없는 노하우는 언제 쓰는지, 얼마나 믿을지, 틀렸을 때 무엇을 다시 볼지 알 수 없다.",
        current: problems === null ? `${file}: ## 항목 없음` : `${file}: ${problems.join(" · ")}`,
        fix: "항목마다 '## 제목' 아래 When: <적용 조건> · Basis: 실측|경험칙 · Evidence: <커밋 hash · 자료 경로> 줄을 둔다 (.agents/skills/gnam-lore/references/lore.md).",
      })
    }
    const name = file.slice(LORE_DIR.length)
    if (index === null || !index.includes(name)) {
      violations.push({
        rule: "lore/index",
        why: "새 세션은 lore/README.md 인덱스만 읽고 필요한 파일을 고른다. 인덱스에 없는 파일은 읽히지 않는다.",
        current: index === null ? `${LORE_INDEX} 없음` : `${LORE_INDEX} 에 ${name} 없음`,
        fix: `${LORE_INDEX} 인덱스에 '${name}  <적용 조건 요약>' 한 줄을 추가한다.`,
      })
    }
  }
  for (const [, name] of index?.matchAll(/^([a-z0-9-]+\.md)\s/gm) ?? []) {
    if (!lore.includes(`${LORE_DIR}${name}`)) {
      violations.push({
        rule: "lore/index",
        why: "인덱스가 없는 파일을 가리키면 새 세션이 지운 노하우를 찾는다.",
        current: `${LORE_INDEX}: ${name} 파일 없음`,
        fix: "파일을 지웠거나 옮겼으면 인덱스 줄도 지우거나 고친다.",
      })
    }
  }
  return violations
}
