/**
 * gnam status 트리의 JSON Schema (--schema). core 는 고정, plugin 은 섹션 schema 를 합성한다.
 */
import type { Loaded } from "./loader.ts"
import { parsePath } from "./output.ts"

type Schema = Record<string, unknown>

const str = (description?: string): Schema => ({ type: "string", ...(description ? { description } : {}) })
const strOrNull = (description?: string): Schema => ({ type: ["string", "null"], ...(description ? { description } : {}) })
const bool: Schema = { type: "boolean" }
const int: Schema = { type: "integer" }
const arr = (items: Schema, description?: string): Schema => ({ type: "array", items, ...(description ? { description } : {}) })
const obj = (properties: Record<string, Schema>, description?: string, extra: Schema = {}): Schema => ({
  type: "object",
  properties,
  ...(description ? { description } : {}),
  ...extra,
})
const marker = obj({ line: int, text: str() })

const STEP = obj({ n: int, title: str(), done: strOrNull("완료: 조건"), impls: arr(str(), "그 단계를 Plan: 으로 가리킨 impl sha") })
const IMPL = obj({
  sha: str(),
  subject: str(),
  step: str("Plan: 줄의 단계 표기"),
  deviation: strOrNull(),
  decisions: strOrNull(),
  remaining: strOrNull(),
  deferred: strOrNull(),
})
const PLAN = obj({
  sha: str(),
  subject: str(),
  requests: arr(str()),
  supersedes: strOrNull(),
  supersededBy: strOrNull(),
  dropped: arr(str()),
  blocking: arr(str()),
  decisionsExpected: arr(str()),
  risks: arr(str()),
  open: arr(str()),
  steps: arr(STEP),
  status: { enum: ["superseded", "done", "partial", "not-started"] },
  impls: arr(IMPL),
})

const TRACE = obj(
  {
    head: strOrNull("HEAD sha. 다음 --since 에 넘길 값"),
    since: strOrNull(),
    boundary: { type: ["object", "null"], properties: { sha: str(), subject: str() } },
    requests: arr(
      obj({
        sha: str(),
        subject: str(),
        refines: strOrNull(),
        refinedBy: arr(str()),
        by: arr(str(), "Request: 로 가리킨 커밋"),
        status: { enum: ["open", "started", "refined"] },
      }),
    ),
    topics: obj(
      {},
      "topic → spec · plan · chore",
      {
        additionalProperties: obj({
          path: str(),
          exists: bool,
          unimplemented: arr(marker),
          open: arr(marker),
          plans: arr(PLAN),
          chores: arr(obj({ sha: str(), subject: str(), requests: arr(str()) })),
        }),
      },
    ),
    agent: arr(obj({ sha: str(), subject: str(), reason: str() }), "Request: 없음 (근거) 커밋"),
    items: arr(obj({ kind: { enum: ["remaining", "deferred", "open", "risk", "blocking"] }, text: str(), sha: str() }), "미해결 후보"),
    decisions: obj(
      {
        blocking: arr(obj({ topic: str(), plan: str(), id: strOrNull(), text: str() })),
        open: arr(obj({ path: str(), line: int, text: str(), introducedBy: strOrNull() })),
      },
      "사람 결정이 필요한 것",
    ),
  },
  "기록의 연결 (요청 → plan → impl → spec)",
)

const PLUGIN: Record<string, Schema> = {
  spec: str(),
  kind: { enum: ["builtin", "local", "package"] },
  version: str(),
  root: str(),
  requires: arr(str()),
  kinds: arr(obj({ label: str(), subject: str() })),
  commands: arr(obj({ name: str(), describe: str(), json: bool })),
  formats: arr(str()),
  skills: arr(str()),
  agentsMd: bool,
  scaffold: arr(str()),
  configProblems: arr(str()),
  error: str("로드 실패 메시지"),
}

export function statusSchema(loaded: Loaded[]): Schema {
  const plugins: Record<string, Schema> = {}
  for (const { plugin } of loaded) {
    const sections: Record<string, Schema> = {}
    for (const [name, section] of Object.entries(plugin.status?.sections ?? {}))
      sections[name] = { ...(section.schema ?? {}), description: section.describe }
    plugins[plugin.id] = obj({ ...PLUGIN, ...(Object.keys(sections).length > 0 ? { sections: obj(sections) } : {}) })
  }
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    ...obj({
      schema: { const: 1, description: "출력 구조 판" },
      gnam: obj({ version: str(), root: str(), source: { enum: ["package", "checkout"] }, format: int }),
      project: str("저장소 루트"),
      config: obj({ path: str(), raw: { description: "gnam.json 원문 (없거나 깨지면 null)" }, effective: { type: ["object", "null"] } }),
      plugins: obj(plugins, "id → plugin", { additionalProperties: obj(PLUGIN) }),
      builtins: arr(obj({ id: str(), active: bool, requires: arr(str()) })),
      kinds: arr(obj({ label: str(), subject: str(), owner: str() })),
      rules: arr(obj({ id: str(), owner: str(), why: str() })),
      install: obj({
        hooks: obj({ hooksPath: strOrNull(), expected: str(), commitMsg: bool }),
        skills: arr(obj({ dir: str(), name: str(), target: strOrNull(), ok: bool })),
        agentsMd: obj({ exists: bool, inSync: bool }),
        claudeMd: obj({ exists: bool, importsAgents: bool }),
      }),
      problems: arr(obj({ source: str("config · install · plugin:<id>"), message: str() })),
      handoff: obj({ path: strOrNull(), exists: bool, content: strOrNull(), modifiedAt: strOrNull("ISO 8601") }),
      env: obj({
        node: strOrNull(),
        bun: strOrNull(),
        git: strOrNull(),
        ci: bool,
        gitDir: strOrNull(),
        commonDir: strOrNull(),
        worktree: bool,
        branch: strOrNull(),
      }),
      trace: TRACE,
    }),
  }
}

/** 경로가 가리키는 하위 schema. 모르는 곳이면 {} */
export function schemaAt(schema: Schema, path: string): Schema {
  let current: Schema = schema
  for (const segment of parsePath(path)) {
    const properties = current["properties"] as Record<string, Schema> | undefined
    if (properties?.[segment] !== undefined) current = properties[segment]
    else if (/^\d+$/.test(segment) && current["items"] !== undefined) current = current["items"] as Schema
    else if (typeof current["additionalProperties"] === "object") current = current["additionalProperties"] as Schema
    else return {}
  }
  return current
}
