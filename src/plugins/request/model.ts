/**
 * request 커밋 · 첨부 줄 · Request 필드 형식 (specs/request.md).
 * 순수 함수만. git 조회는 CommitContext 의 subjectOf · isAncestor 로 받는다.
 */
import { fieldsOf, requestRefOf } from "../../core/fields.ts"

export { fieldsOf, requestRefOf }
export const REQUEST_SUBJECT = /^request: \S/
export const SHA256 = /^sha256:[0-9a-f]{64}$/
const HASH = /^[0-9a-f]{7,40}$/

export interface Problem {
  rule: string
  why: string
  current: string
  fix: string
}

export type Location =
  | { kind: "s3"; value: string }
  | { kind: "repo"; path: string; commit: string }
  | { kind: "url"; value: string }
  | { kind: "none" }

export interface Attachment {
  name: string
  sha256: string | null
  location: Location
  origin: string | null
}

/** 첨부 줄 하나. 형식이 틀리면 문제 문자열 */
export function parseAttachment(line: string): Attachment | string {
  let name: string
  let rest: string
  if (line.startsWith('"')) {
    const end = /^"((?:[^"\\]|\\.)*)"/.exec(line)
    if (end === null) return "닫는 큰따옴표 없음"
    name = (end[1] ?? "").replace(/\\(.)/g, "$1")
    rest = line.slice(end[0].length)
    if (rest !== "" && !/^\s{2,}/.test(rest)) return "이름 뒤 구분은 공백 두 칸 이상"
  } else {
    const split = /\s{2,}/.exec(line)
    name = split === null ? line : line.slice(0, split.index)
    rest = split === null ? "" : line.slice(split.index)
    if (/\s/.test(name)) return "공백이 든 이름은 큰따옴표로 감싼다"
  }
  if (name === "") return "이름 없음"
  const parts = rest.trim() === "" ? [] : rest.trim().split(/\s{2,}/)
  let origin: string | null = null
  if (parts.length > 0 && (parts.at(-1) ?? "").startsWith("← ")) origin = (parts.pop() ?? "").slice(2).trim() || null
  const sha = parts.length > 0 && (parts[0] ?? "").startsWith("sha256:") ? (parts.shift() ?? "") : null
  if (sha !== null && !SHA256.test(sha)) return `sha256 형식 아님: ${sha}`
  if (parts.length !== 1) return parts.length === 0 ? "위치 없음" : `알 수 없는 칸: ${parts.slice(1).join(" ")}`
  const raw = parts[0] ?? ""
  const location = locationOf(raw)
  if (location === null) return `위치 형식 아님: ${raw} (s3://… · <경로>@<커밋> · URL · 없음)`
  if (location.kind !== "url" && sha === null) return "sha256 없음 (URL 외 필수)"
  if (location.kind === "none" && origin === null) return "위치 없음이면 ← <원래 경로> 필수"
  return { name, sha256: sha, location, origin }
}

function locationOf(raw: string): Location | null {
  if (raw === "없음") return { kind: "none" }
  if (/^s3:\/\/[^/\s]+\/\S+$/.test(raw)) return { kind: "s3", value: raw }
  if (/^https?:\/\/\S+$/.test(raw)) return { kind: "url", value: raw }
  const repo = /^(\S+)@([0-9a-f]{7,40})$/.exec(raw)
  if (repo !== null) return { kind: "repo", path: repo[1] ?? "", commit: repo[2] ?? "" }
  return null
}

export interface RequestInput {
  body: string
  files: string[] | null
  merge: boolean
  subjectOf: (hash: string) => string | null
  isAncestor: (hash: string) => boolean
}

const problem = (rule: string, why: string, current: string, fix: string): Problem => ({ rule: `commit/${rule}`, why, current, fix })

/** request 커밋 하나의 형식 문제 */
export function requestProblems({ body, files, merge, subjectOf, isAncestor }: RequestInput): Problem[] {
  const problems: Problem[] = []
  if (merge) {
    problems.push(
      problem(
        "merge-kind",
        "request 는 사용자 요청 원문 기록이다. 브랜치 통합을 request 로 쓰지 않는다.",
        "merge 커밋",
        "merge 제목을 'chore: …' 로 쓴다.",
      ),
    )
    return problems
  }
  if (files !== null && files.length > 0) {
    problems.push(
      problem(
        "request-files",
        "request 커밋은 원문만 남기는 빈 커밋이다. 첨부는 저장소 경로@커밋 · s3 · URL 로 가리킨다.",
        files.join(", "),
        "stage 를 비우고 --allow-empty 로 커밋한다. 파일 변경은 별도 커밋으로.",
      ),
    )
  }
  const fields = fieldsOf(body)
  const text = fields.get("Text")
  if (text === undefined || text.length === 0) {
    problems.push(
      problem(
        "request-text",
        "Text 가 의도 대조의 기준 (사용자 원문) 이다.",
        text === undefined ? "본문에 Text: 없음" : "Text: 비어 있음",
        "'Text:' 아래에 사용자 원문을 줄마다 '> ' 로 인용한다. 요약 · 수정 금지, 비밀값만 [REDACTED].",
      ),
    )
  } else {
    const bad = text.find((line) => !/^>( |$)/.test(line))
    if (bad !== undefined) {
      problems.push(
        problem(
          "request-text",
          "원문과 에이전트 서술을 구분하려고 Text 의 모든 줄을 인용한다.",
          bad || "(빈 줄)",
          "줄 앞에 '> ' 를 붙인다. 원문 안 빈 줄은 '>' 한 글자.",
        ),
      )
    }
  }
  for (const line of fields.get("Attachments") ?? []) {
    if (line.trim() === "") continue
    const parsed = parseAttachment(line.trim())
    if (typeof parsed === "string") {
      problems.push(
        problem(
          "request-attachment",
          "첨부 줄은 이름 · sha256 · 위치로 첨부를 다시 찾는 키다.",
          `${line.trim()} → ${parsed}`,
          "'<이름>  sha256:<hex>  <위치>  [← <원래 경로>]' (구분은 공백 두 칸 이상). 위치 = s3://… · <경로>@<커밋> · URL · 없음.",
        ),
      )
    }
  }
  const refines = fields.get("Refines")
  if (refines !== undefined) {
    const hash = (refines[0] ?? "").trim()
    const subject = HASH.test(hash) ? subjectOf(hash) : null
    const reason =
      subject === null ? "커밋 없음" : !REQUEST_SUBJECT.test(subject) ? `request 아님 (${subject})` : !isAncestor(hash) ? "조상 아님" : null
    if (reason !== null) {
      problems.push(
        problem(
          "request-refines",
          "Refines 는 이 요청이 바꾸거나 보충하는 먼저 커밋된 request 다.",
          `Refines: ${hash || "(빈 값)"} → ${reason}`,
          "git log --oneline --grep '^request: ' 에서 hash 를 고른다.",
        ),
      )
    }
  }
  return problems
}

export interface LinkInput {
  body: string
  subjectOf: (hash: string) => string | null
  isAncestor: (hash: string) => boolean
}

/** 작업 커밋 (plan · spec chore · chore · refactor) 의 Request 필드 문제 */
export function linkProblems({ body, subjectOf, isAncestor }: LinkInput): Problem[] {
  const ref = requestRefOf(body)
  const fix =
    "본문에 'Request: <request hash>[, <hash>]' (사용자 요청) 또는 'Request: 없음 (<발의 근거>)' (에이전트 발의) 를 쓴다. git log --oneline --grep '^request: '"
  const why = "작업이 어느 사용자 요청에서 시작했는지가 의도 대조의 연결이다 (specs/request.md 연결)."
  if (ref === null) return [problem("request-link", why, "본문에 Request: 없음", fix)]
  if ("agent" in ref)
    return ref.agent === "" ? [problem("request-link", why, "Request: 없음 → 근거 없음", "'Request: 없음 (<발의 근거>)' 로 괄호 안에 근거를 쓴다.")] : []
  if (ref.hashes.length === 0) return [problem("request-link", why, "Request: (빈 값)", fix)]
  const problems: Problem[] = []
  for (const hash of ref.hashes) {
    const subject = HASH.test(hash) ? subjectOf(hash) : null
    const reason =
      subject === null ? "커밋 없음" : !REQUEST_SUBJECT.test(subject) ? `request 아님 (${subject})` : !isAncestor(hash) ? "조상 아님" : null
    if (reason !== null) problems.push(problem("request-link", why, `Request: ${hash} → ${reason}`, fix))
  }
  return problems
}
