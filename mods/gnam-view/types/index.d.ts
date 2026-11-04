export type Line = { line: number; text: string }

export type Step = { n: number; title: string; isDone: boolean }

export type TopicStatus = 'done' | 'partial' | 'not-started' | 'none'

export type Topic = {
  name: string
  path: string
  status: TopicStatus
  planSha: string | null
  planSubject: string | null
  steps: Step[]
  superseded: number
  unimplemented: Line[]
  open: Line[]
  blocking: string[]
  chores: number
  isActive: boolean
  /** spec 제목 줄의 한 줄 설명 (`# topic — 설명`) */
  summary: string | null
  /** spec 첫 문단 */
  detail: string | null
  /** 진행 중 plan 본문의 Goal */
  goal: string | null
  /** 진행 중 plan 의 사람용 한 줄 (Summary:, gnam 0.5+) */
  planSummary: string | null
}

export type Decision = { kind: 'blocking' | 'open'; where: string; text: string }

export type RequestRow = { sha: string; subject: string; status: string; by: number }

export type Item = { kind: string; text: string; sha: string }

export type Commit = { sha: string; subject: string; age: string; time: number; owner: string; topic: string | null }

export type SectionRow = { name: string; lines: string[] }

export type GnamPlugin = {
  id: string
  version: string
  kind: string
  commands: string[]
  skills: string[]
  sections: SectionRow[]
  error: string | null
}

export type Setup = {
  source: string
  format: number
  inactive: string[]
  extraConfig: string[]
  hooksOk: boolean
  hooksPath: string | null
  skills: { dir: string; name: string; ok: boolean }[]
  agentsMd: { exists: boolean; inSync: boolean }
  claudeMd: { exists: boolean; importsAgents: boolean }
  problems: string[]
  handoff: boolean
  kinds: { label: string; owner: string }[]
}

/** gnam status views 의 탭 정의 (gnam specs/view.md) */
export type ViewDef = {
  id: string
  title: string
  source: string
  where: Record<string, string | number | boolean | null>
  view: 'list' | 'table' | 'progress'
  fields: Record<string, string | string[]>
  icon: string | null
  owner: string
}

/** 개인 화면 설정 ($.store, 프로젝트별) */
export type Prefs = {
  hidden: string[]
  order: string[]
  defaultTab: string | null
  icons: 'nerd' | 'plain' | null
  header: boolean
  graphs: { dist: boolean; steps: boolean; spark: boolean }
}

/** 새 탭 · 탭 편집 입력 */
export type Draft = {
  isOpen: boolean
  /** 편집 중인 프로젝트 탭 id (null = 새 탭) */
  editing: string | null
  /** '' = 자동 이름 */
  title: string
  /** status 경로 ('' = 미선택) */
  source: string
  /** 직접 입력 경로 */
  custom: string
  where: Record<string, string | number | boolean | null>
  view: 'list' | 'table' | 'progress'
  /** 직접 고른 필드 (나머지는 데이터 보고 자동) */
  fields: Record<string, string | string[]>
  /** source 의 status 값 (null = 못 읽음) */
  data: unknown
  isLoading: boolean
  error: string | null
}

export type Model = {
  project: string
  version: string
  /** README 첫 줄 · 첫 문단 (없으면 package.json description) */
  purpose: string | null
  /** purpose 를 읽은 파일 */
  purposeFrom: string | null
  /** gnam status 요약 중 plugin 이 더한 줄 */
  pluginLines: string[]
  branch: string | null
  summary: string[]
  topics: Topic[]
  decisions: Decision[]
  requests: RequestRow[]
  items: Item[]
  commits: Commit[]
  owners: string[]
  plugins: GnamPlugin[]
  setup: Setup
  /** 탭 정의 (gnam 0.5+ status views, 이전 판은 gnam.json view.tabs 원문) */
  views: ViewDef[]
  /** 탭 id → source 값. 못 읽으면 키 없음 */
  viewData: Record<string, unknown>
}

export type GnamView = {
  model: Model | null
  /** status 를 못 읽었을 때 이유 */
  error: string | null
  /** status 실패 시 gnam.json 원문 */
  rawConfig: string | null
  loadedAt: number
  isLoading: boolean
}

export type TopicFilter = 'active' | 'not-started' | 'done' | 'all'

export type ViewUi = {
  tab: string
  topicFilter: TopicFilter
  owner: string
  itemKind: string
  reqStatus: string
  commitTopic: string
  expanded: string[]
}

declare module 'claude-code' {
  interface PluginState {
    'gnam-view': { view: Shaped<GnamView>; ui: Shaped<ViewUi>; prefs: Shaped<Prefs>; draft: Shaped<Draft> }
  }
}
