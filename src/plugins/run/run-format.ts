/**
 * run 커밋 (.agents/skills/gnam-run/references/run.md) 형식. commit-msg 검사와 run-stats 조회가 같이 쓴다.
 *
 * 에이전트 하나 = 본문 마지막 문단의 'Agent: <이름> key=value …' 한 줄. git 검색이 줄 단위라
 * 여러 조건을 한 정규식으로 걸 수 있고, git trailer (%(trailers:key=Agent)) 로도 읽힌다.
 * reviewer 줄은 비용 기록만 (평가 · 예상 · impl_* 키 없음, Why: 선택). 키 순서는 KEYS 선언 순서.
 */

export const RUN_SUBJECT = /^run\.([A-Za-z0-9_-]+)\.(start|end|policy): \S/
const AGENT_LINE = /^Agent: (\S+)((?: [a-z_]+=\S*)*)[ \t]*$/

/** 측정하지 못한 값. 추정치로 채우지 않는다 */
export const NA = "na"

const ALIASES = ["opus", "sonnet", "haiku", "fable", "mythos", "default"]
const EFFORTS = ["none", "minimal", "low", "medium", "high", "xhigh", "max"]
const NOISES = ["wait", "api", "load", "flaky", "human", "rebase", "cache"]

type Check = (value: string) => boolean
const oneOf =
  (...values: string[]): Check =>
  (value) =>
    values.includes(value)
const count: Check = (value) => value === NA || /^\d+$/.test(value)

/** 허용 키. 선언 순서 = 줄 안 키 순서 (git 정규식이 줄 안 순서를 따르므로 고정) */
const KEYS: Record<string, Check> = {
  role: oneOf("runner", "reviewer", "delegator"),
  from: (value) => value !== "",
  step: (value) => value !== "",
  model: (value) => value !== "" && !ALIASES.includes(value),
  effort: oneOf(...EFFORTS, NA),
  size: oneOf("S", "M", "L"),
  difficulty: oneOf("K1", "K2", "K3"),
  explore: oneOf("yes", "no"),
  session: (value) => value !== "",
  est_min: count,
  est_out: count,
  firstpass: oneOf("yes", "no", NA),
  retries: count,
  blocked: count,
  cause: oneOf("none", "context", "effort", "capability", "plan", "env"),
  noise: (value) => value === "none" || value.split(",").every((n) => NOISES.includes(n)),
  verdict: oneOf("fit", "under", "over", NA),
  lines: count,
  active_min: count,
  out: count,
  impl_min: count,
  impl_out: count,
  wall_min: count,
  input: count,
  cache_write: count,
  cache_read: count,
  requests: count,
  api_errors: count,
  harness: (value) => value !== "",
  area: (value) => value !== "",
}

export const KEY_ORDER = Object.keys(KEYS)

/** reviewer 는 평가하지 않는다 (놓친 결함을 잴 수 없음). 비용 (active_min · out) 만 남긴다 */
const REVIEWER_REQUIRED = {
  start: ["role", "step", "model", "effort", "session"],
  end: ["role", "model", "effort", "noise", "active_min", "out"],
} as const
/** reviewer 줄에 두지 않는 키 (평가 · 예상, runner 줄 복사) */
const REVIEWER_FORBIDDEN = [
  "size",
  "difficulty",
  "explore",
  "est_min",
  "est_out",
  "firstpass",
  "retries",
  "blocked",
  "cause",
  "verdict",
  "lines",
  "impl_min",
  "impl_out",
]

const REQUIRED = {
  start: ["role", "step", "model", "effort", "size", "difficulty", "explore", "session", "est_min", "est_out"],
  end: [
    "role",
    "model",
    "effort",
    "size",
    "difficulty",
    "explore",
    "firstpass",
    "retries",
    "blocked",
    "cause",
    "noise",
    "verdict",
    "lines",
    "active_min",
    "out",
    "impl_min",
    "impl_out",
  ],
} as const

export interface Agent {
  name: string
  fields: Record<string, string>
}

/** 'Agent: …' 줄 전부. 형식이 깨진 줄은 name 이 빈 문자열 */
export function agentsOf(body: string): Agent[] {
  return body
    .split("\n")
    .filter((line) => line.startsWith("Agent:"))
    .map((line) => {
      const match = AGENT_LINE.exec(line)
      if (match === null) return { name: "", fields: { raw: line } }
      const fields: Record<string, string> = {}
      for (const pair of (match[2] ?? "").trim().split(" ").filter(Boolean)) {
        const at = pair.indexOf("=")
        fields[pair.slice(0, at)] = pair.slice(at + 1)
      }
      return { name: match[1] ?? "", fields }
    })
}

/** '<name>: <값>' 한 줄 필드의 값. 없으면 null */
export function fieldOf(body: string, name: string): string | null {
  const match = new RegExp(`^${name}:[ \\t]*(.*)$`, "m").exec(body)
  return match === null ? null : (match[1] ?? "").trim()
}

/** 'Why: <agent> <이유>' 줄의 agent 이름 */
const whyAgentsOf = (body: string) => [...body.matchAll(/^Why:[ \t]+(\S+)[ \t]+\S/gm)].map((match) => match[1] ?? "")

/** Agent 줄 형식 문제. 빈 배열이면 통과 */
export function agentProblems(kind: "start" | "end", body: string): string[] {
  const problems: string[] = []
  const agents = agentsOf(body)
  if (agents.length === 0) problems.push("Agent: 줄 없음")
  const paragraphs = body.trim().split(/\n[ \t]*\n/)
  const last = (paragraphs.at(-1) ?? "").split("\n")
  if (agents.length > 0 && (!last.every((line) => line.startsWith("Agent:")) || last.length !== agents.length)) {
    problems.push("Agent: 줄은 본문 마지막 문단에 모으고 그 문단에는 Agent: 줄만 둔다")
  }
  const names = new Set<string>()
  for (const { name, fields } of agents) {
    if (name === "") {
      problems.push(`형식 오류: ${fields["raw"]}`)
      continue
    }
    if (names.has(name)) problems.push(`${name}: 이름 중복`)
    names.add(name)
    const reviewer = fields["role"] === "reviewer"
    for (const key of (reviewer ? REVIEWER_REQUIRED : REQUIRED)[kind])
      if (!(key in fields)) problems.push(`${name}: ${key}= 없음`)
    if (reviewer)
      for (const key of REVIEWER_FORBIDDEN)
        if (key in fields) problems.push(`${name}: reviewer 는 ${key}= 를 적지 않는다`)
    for (const [key, value] of Object.entries(fields)) {
      const check = KEYS[key]
      if (check === undefined) problems.push(`${name}: 모르는 키 ${key}`)
      else if (!check(value)) problems.push(`${name}: ${key}=${value} 허용 안 됨`)
    }
    const known = Object.keys(fields).filter((key) => key in KEYS)
    const ordered = KEY_ORDER.filter((key) => known.includes(key))
    if (known.join(" ") !== ordered.join(" ")) problems.push(`${name}: 키 순서 ${ordered.join(" ")}`)
  }
  const whys = new Set(whyAgentsOf(body))
  const reviewers = new Set(agents.filter((agent) => agent.fields["role"] === "reviewer").map((agent) => agent.name))
  for (const name of names) if (!reviewers.has(name) && !whys.has(name)) problems.push(`${name}: Why: 줄 없음`)
  return problems
}
