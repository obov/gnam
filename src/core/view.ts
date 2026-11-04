/**
 * 탭 정의 (specs/view.md). gnam.json view.tabs 와 plugin 섹션 view 를 같은 형식으로 검사해 views 로 모은다.
 * gnam 은 그리지 않는다. 검사 실패는 문제 줄 (readConfig · hook 은 실패하지 않는다).
 */
import type { GnamConfig } from "./config.ts"
import { parsePath } from "./output.ts"
import type { GnamPlugin, ViewHint } from "./plugin.ts"

export const VIEW_KINDS = ["list", "table", "progress"] as const
export type ViewKind = (typeof VIEW_KINDS)[number]
export const FIELD_KEYS = ["title", "badge", "meta", "detail", "done", "total", "columns"] as const

export interface ViewTab {
  id: string
  title: string
  source: string
  where: Record<string, string | number | boolean | null>
  view: ViewKind
  fields: Record<string, string | string[]>
  icon: string | null
  owner: string
}

const ID = /^[a-z0-9-]{1,32}$/
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v)
const isScalar = (v: unknown) => v === null || ["string", "number", "boolean"].includes(typeof v)

/** 정의 하나 검사. 문제 목록 (비면 통과). requireIdSource = 프로젝트 탭 (plugin 섹션 view 는 id · source 를 gnam 이 정한다) */
export function tabProblems(raw: unknown, requireIdSource: boolean): string[] {
  if (!isObject(raw)) return ["객체가 아님"]
  const problems: string[] = []
  if (requireIdSource) {
    if (typeof raw["id"] !== "string" || !ID.test(raw["id"])) problems.push("id = 소문자 · 숫자 · '-' 1-32자")
    if (typeof raw["source"] !== "string" || raw["source"] === "") problems.push("source = status 경로 문자열")
    else {
      try {
        parsePath(raw["source"])
      } catch (error) {
        problems.push(`source 경로 형식: ${(error as Error).message}`)
      }
    }
  }
  const title = raw["title"]
  if (typeof title !== "string" || title.trim() === "" || [...title].length > 24) problems.push("title = 1-24자 문자열")
  if (!VIEW_KINDS.includes(raw["view"] as ViewKind)) problems.push(`view = ${VIEW_KINDS.join(" | ")}`)
  const where = raw["where"]
  if (where !== undefined && (!isObject(where) || !Object.values(where).every(isScalar))) problems.push("where = { 키: 스칼라 }")
  const fields = raw["fields"]
  if (fields !== undefined) {
    if (!isObject(fields)) problems.push("fields = 객체")
    else
      for (const [key, value] of Object.entries(fields)) {
        if (!(FIELD_KEYS as readonly string[]).includes(key)) problems.push(`fields.${key} = ${FIELD_KEYS.join(" · ")} 중 하나`)
        else if (key === "columns" ? !(Array.isArray(value) && value.every((c) => typeof c === "string")) : typeof value !== "string")
          problems.push(`fields.${key} = ${key === "columns" ? "문자열 배열" : "키 점 경로 문자열"}`)
      }
  }
  if (raw["icon"] !== undefined && typeof raw["icon"] !== "string") problems.push("icon = 문자열")
  return problems
}

function toTab(raw: Record<string, unknown>, id: string, source: string, owner: string): ViewTab {
  return {
    id,
    title: (raw["title"] as string).trim(),
    source,
    where: (raw["where"] as ViewTab["where"] | undefined) ?? {},
    view: raw["view"] as ViewKind,
    fields: (raw["fields"] as ViewTab["fields"] | undefined) ?? {},
    icon: typeof raw["icon"] === "string" ? raw["icon"] : null,
    owner,
  }
}

/** 프로젝트 탭 (gnam.json view.tabs) 먼저, 그다음 plugin 순서의 섹션 view. 실패한 정의는 빼고 문제 줄로 */
export function collectViews(config: GnamConfig | null, plugins: GnamPlugin[]): { views: ViewTab[]; problems: string[] } {
  const views: ViewTab[] = []
  const problems: string[] = []
  const view = config?.["view"]
  if (view !== undefined) {
    const tabs = isObject(view) ? view["tabs"] : undefined
    if (!isObject(view) || (tabs !== undefined && !Array.isArray(tabs))) problems.push("view = { tabs: [탭 정의] }")
    else
      (tabs ?? []).forEach((raw: unknown, i: number) => {
        const label = isObject(raw) && typeof raw["id"] === "string" ? raw["id"] : `#${i}`
        const issues = tabProblems(raw, true)
        if (issues.length === 0 && views.some((t) => t.id === (raw as Record<string, unknown>)["id"])) issues.push("id 중복")
        if (issues.length > 0) problems.push(`view.tabs ${label}: ${issues.join(" · ")}`)
        else {
          const r = raw as Record<string, unknown>
          views.push(toTab(r, r["id"] as string, r["source"] as string, "project"))
        }
      })
  }
  for (const plugin of plugins)
    for (const [name, section] of Object.entries(plugin.status?.sections ?? {})) {
      const hint: ViewHint | undefined = section.view
      if (hint === undefined) continue
      const id = `${plugin.id}-${name}`.toLowerCase()
      const issues = tabProblems(hint, false)
      if (!ID.test(id)) issues.push(`id ${id} = 소문자 · 숫자 · '-' 1-32자`)
      if (issues.length === 0 && views.some((t) => t.id === id)) issues.push("id 가 프로젝트 탭과 겹침")
      if (issues.length > 0) problems.push(`plugin ${plugin.id} 섹션 ${name} view: ${issues.join(" · ")}`)
      else views.push(toTab(hint as unknown as Record<string, unknown>, id, `plugins.${plugin.id}.sections.${name}`, plugin.id))
    }
  return { views, problems }
}
