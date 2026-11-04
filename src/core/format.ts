/**
 * 커밋 메시지 판 (specs/commit-format.md).
 *   format 1  제목 접두 spec.<topic>.<kind>: · chore: · refactor: · plugin 접두
 *   format 2  제목 Conventional Commits, gnam 종류는 메시지 끝 trailer 'Gnam: <종류>'
 * 읽기는 두 판을 모두 받는다. normalize 가 format 2 메시지를 format 1 모양 (제목 접두 + 본문 필드) 으로 바꿔
 * 기존 조회 · 검사 코드가 판을 몰라도 되게 한다.
 */

/** format 2 제목에 쓰는 Conventional Commits type */
export const CC_TYPES = ["feat", "fix", "perf", "revert", "chore", "build", "ci", "docs", "test", "style", "refactor"] as const
export const CC_HEADER = /^([a-z]+)(?:\(([^()\s]+)\))?(!)?: (\S.*)$/
const TRAILER_LINE = /^(BREAKING CHANGE|[A-Za-z0-9][A-Za-z0-9-]*): ?(.*)$/

export interface Trailer {
  key: string
  value: string
}

export interface Header {
  type: string
  scope: string | null
  breaking: boolean
  description: string
}

export function headerOf(subject: string): Header | null {
  const match = CC_HEADER.exec(subject)
  if (match === null) return null
  return { type: match[1] ?? "", scope: match[2] ?? null, breaking: match[3] === "!", description: match[4] ?? "" }
}

/**
 * 본문 (제목 다음) 을 trailer 단락과 나머지로 나눈다. trailer 단락 = 마지막 단락이고 모든 줄이
 * 'Key: value' 또는 들여쓴 이어짐 줄. 아니면 trailer 없음
 */
export function splitTrailers(body: string): { text: string; trailers: Trailer[] } {
  const trimmed = body.replace(/\s+$/, "")
  const at = trimmed.lastIndexOf("\n\n")
  const last = at < 0 ? trimmed : trimmed.slice(at + 2)
  const lines = last.split("\n")
  const trailers: Trailer[] = []
  for (const line of lines) {
    const match = TRAILER_LINE.exec(line)
    if (match !== null) trailers.push({ key: match[1] ?? "", value: (match[2] ?? "").trim() })
    else if (/^[ \t]+\S/.test(line) && trailers.length > 0) {
      const prev = trailers[trailers.length - 1] as Trailer
      prev.value = `${prev.value} ${line.trim()}`
    } else return { text: trimmed, trailers: [] }
  }
  if (trailers.length === 0) return { text: trimmed, trailers: [] }
  return { text: at < 0 ? "" : trimmed.slice(0, at).replace(/\s+$/, ""), trailers }
}

export const trailerValues = (trailers: Trailer[], key: string) =>
  trailers.filter((t) => t.key.toLowerCase() === key.toLowerCase()).map((t) => t.value)

/** format 2 메시지인가 (Gnam: trailer 가 있거나 제목 type 이 CC type 이고 format 1 접두가 아님) */
export function isFormat2(subject: string, body: string): boolean {
  if (trailerValues(splitTrailers(body).trailers, "Gnam").length > 0) return true
  const header = headerOf(subject)
  if (header === null) return false
  if ((header.type === "chore" || header.type === "refactor") && header.scope === null && !header.breaking) return false
  return (CC_TYPES as readonly string[]).includes(header.type)
}

/**
 * format 2 메시지를 format 1 모양으로. format 1 이면 그대로.
 *   Gnam: <종류>  → 제목 '<종류>: <설명>'
 *   refactor      → 'refactor: <설명>'
 *   그 밖 CC type → 'chore: <설명>' (gnam chore)
 * 본문 = trailer (Gnam 제외, Plan 먼저) + 빈 줄 + trailer 단락을 뺀 본문
 */
export function normalize(subject: string, body: string): { subject: string; body: string } {
  if (!isFormat2(subject, body)) return { subject, body }
  const header = headerOf(subject)
  const { text, trailers } = splitTrailers(body)
  const gnam = trailerValues(trailers, "Gnam")[0]
  const description = header?.description ?? subject
  const kind = gnam !== undefined && gnam !== "" ? gnam : header?.type === "refactor" ? "refactor" : "chore"
  const rest = trailers.filter((t) => t.key.toLowerCase() !== "gnam")
  const ordered = [...rest.filter((t) => t.key === "Plan"), ...rest.filter((t) => t.key !== "Plan")]
  const fields = ordered.map((t) => `${t.key}: ${t.value}`).join("\n")
  return { subject: `${kind}: ${description}`, body: [fields, text].filter((part) => part !== "").join("\n\n") }
}

/** 한 메시지 (제목 + 본문) 를 normalize */
export function normalizeMessage(message: string): string {
  const [subject = "", ...rest] = message.split("\n")
  const out = normalize(subject, rest.join("\n").trim())
  return out.body === "" ? out.subject : `${out.subject}\n\n${out.body}`
}

/** git log --grep 인자: 종류 정규식 (예: run\.[^.]+\.end, ^ · ': ' 없이) 을 두 판 모두 찾게. 여러 --grep 은 OR */
export const grepBoth = (kind: string) => [`--grep=^${kind}: `, `--grep=^Gnam: ${kind}$`]

/** 릴리스 태그 이름 (release-please 기본: v<semver> · <component>-v<semver>) */
export const RELEASE_TAG = /^(?:.+-)?v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/
