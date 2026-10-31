/**
 * 커밋 본문 필드 해석. 필드 = 줄 머리 '<이름>:' 부터 다음 필드 머리 전까지 (commits/ 본문 필드 형식).
 * commit 검사 · request plugin · status trace 가 같이 쓴다.
 */
const FIELD = /^([A-Z][A-Za-z ]*):[ \t]*(.*)$/

/** 필드 이름 → 값 줄 (머리 줄 나머지 + 다음 줄들, 끝 빈 줄 제외). 같은 이름이 여러 번이면 마지막 */
export function fieldsOf(body: string): Map<string, string[]> {
  const fields = new Map<string, string[]>()
  let current: string[] | null = null
  for (const line of body.split("\n")) {
    const match = FIELD.exec(line)
    if (match !== null) {
      current = []
      fields.set(match[1] ?? "", current)
      if ((match[2] ?? "").trim() !== "") current.push(match[2] ?? "")
    } else current?.push(line)
  }
  for (const value of fields.values()) while (value.length > 0 && (value.at(-1) ?? "").trim() === "") value.pop()
  return fields
}

/** 필드 값 원문 (줄 합침, 앞뒤 공백 제거). 없으면 null */
export function fieldText(fields: Map<string, string[]>, name: string): string | null {
  const value = fields.get(name)
  return value === undefined ? null : value.join("\n").trim()
}

const ITEM_START = /^\s*(?:[-*]\s+|[A-Z][0-9]+[.:]\s*)/

/** 필드 값 → 항목. '- ' · '* ' · 'R1.' · 'D1:' 줄이 새 항목, 나머지는 앞 항목에 이어 붙인다. 글머리 '- ' 는 지우고 번호는 유지 */
export function itemsOf(lines: string[] | undefined): string[] {
  const items: string[][] = []
  for (const line of lines ?? []) {
    if (line.trim() === "") continue
    if (ITEM_START.test(line) || items.length === 0) items.push([line.trim().replace(/^[-*]\s+/, "")])
    else items.at(-1)?.push(line.trim())
  }
  return items.map((item) => item.join("\n"))
}

/** Request 필드. 없으면 null, '없음 (근거)' 면 { agent }, 아니면 hash 목록 */
export function requestRefOf(body: string): { agent: string } | { hashes: string[] } | null {
  const match = /^Request:[ \t]*(.*)$/m.exec(body)
  if (match === null) return null
  const value = (match[1] ?? "").trim()
  const agent = /^없음\s*\((.*)\)$/.exec(value)
  if (agent !== null) return { agent: (agent[1] ?? "").trim() }
  if (value.startsWith("없음")) return { agent: "" }
  return {
    hashes: value
      .split(",")
      .map((h) => h.trim())
      .filter((h) => h !== ""),
  }
}
