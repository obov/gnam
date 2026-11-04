// 화면 상태 · 키 처리 · 갱신. React 밖의 작은 store (useSyncExternalStore 로 읽는다).
import { applyWhere, rowsOf, type Commit, type Item, type Loader, type Model, type Request, type ViewDef } from './model.ts'
import { makeTheme, type TerminalColors, type Theme } from './theme.ts'

export type TabId = string
export type Tab = { id: TabId; label: string }

/** 고정 탭 (요청은 요청이 있거나 request plugin 이 켜졌을 때만) */
export const TABS: Tab[] = [
  { id: 'overview', label: '개요' },
  { id: 'decisions', label: '결정' },
  { id: 'requests', label: '요청' },
  { id: 'history', label: '이력' },
  { id: 'commits', label: '커밋' },
  { id: 'items', label: '항목' },
]

/**
 * 이 모델에서 보이는 탭 (순서 = 숫자 키 1-9, 10번째부터 Tab · ←/→):
 * 고정 탭 → 사용자 정의 view (프로젝트 · plugin) → plugin (켜진 plugin 이 있을 때)
 */
export function tabsOf(m: Model | null): Tab[] {
  return [
    ...TABS.filter(t => t.id !== 'requests' || m?.hasRequests === true),
    ...(m?.views ?? []).map(v => ({ id: `view:${v.id}`, label: v.title })),
    ...(m?.plugins.length ? [{ id: 'plugins', label: 'plugin' }] : []),
  ]
}

/** view 탭에 그리는 최대 행 */
export const VIEW_ROWS = 200

export function viewOf(m: Model | null, tab: TabId): ViewDef | null {
  return tab.startsWith('view:') ? (m?.views.find(v => `view:${v.id}` === tab) ?? null) : null
}

/** view 의 행 (where 적용). data 가 없으면 null */
export function viewRows(m: Model, def: ViewDef): { all: number; rows: unknown[] } | null {
  const data = m.viewData[def.id]
  if (data === undefined) return null
  const all = rowsOf(data)
  return { all: all.length, rows: applyWhere(all, def.where) }
}

/** 요청 상태 (순서 = 필터 순환) */
export const REQUEST_STATUSES = ['open', 'started', 'refined']

/** 필터 키 → 고를 수 있는 값 ('all' 먼저) */
export function filterValues(s: State, key: string): string[] {
  const m = s.model
  if (!m) return ['all']
  switch (key) {
    case 'requests':
      return ['all', ...REQUEST_STATUSES]
    case 'items':
      return ['all', ...new Set(m.items.map(i => i.kind))]
    case 'commits.kind':
      return ['all', ...m.owners.filter(o => m.commits.some(c => c.owner === o)), ...(m.commits.some(c => c.owner === 'other') ? ['other'] : [])]
    case 'commits.topic':
      return ['all', ...new Set(m.commits.map(c => c.topic).filter((x): x is string => x !== null))]
  }
  return ['all']
}

export const filterOf = (s: State, key: string): string => {
  const v = s.filter[key] ?? 'all'
  return filterValues(s, key).includes(v) ? v : 'all'
}

export function requestRows(s: State): Request[] {
  const f = filterOf(s, 'requests')
  return (s.model?.requests ?? []).filter(r => f === 'all' || r.status === f)
}

export function itemRows(s: State): Item[] {
  const f = filterOf(s, 'items')
  return (s.model?.items ?? []).filter(i => f === 'all' || i.kind === f)
}

/** 커밋 (종류 · topic 필터 적용) */
export function commitRows(s: State): Commit[] {
  const k = filterOf(s, 'commits.kind')
  const t = filterOf(s, 'commits.topic')
  return (s.model?.commits ?? []).filter(c => (k === 'all' || c.owner === k) && (t === 'all' || c.topic === t))
}

/** 탭에서 f 가 바꾸는 필터 (커밋 탭의 t = topic) */
const MAIN_FILTER: Record<string, string> = { requests: 'requests', items: 'items', commits: 'commits.kind' }
export const hasFilter = (tab: TabId) => tab in MAIN_FILTER

/** 커밋 탭에 그리는 최근 커밋 수 (나머지는 개수만) */
export const COMMIT_ROWS = 300

export type State = {
  model: Model | null
  /** 마지막 읽기 실패 (있으면 기존 화면 유지 + 오류 1줄) */
  error: string | null
  isLoading: boolean
  tab: TabId
  /** 탭마다 선택 행 (없으면 0) */
  cursor: Record<TabId, number>
  /** 펼친 topic (1단: 하나만) */
  expanded: string | null
  theme: Theme
  loadedAt: number
  /** 화면 폭 (px, 모르면 0). 문단 말줄임 추정에 쓴다 */
  width: number
  /** 탭 필터 (키 → 값, 없으면 all) */
  filter: Record<string, string>
}

export type Key = { key: string; mods?: { shift?: boolean; ctrl?: boolean; alt?: boolean; super?: boolean } }

export function overviewRows(m: Model | null): string[] {
  return m ? [...m.now, ...m.next, ...m.done] : []
}

export const cursorOf = (s: State, tab: TabId = s.tab): number => s.cursor[tab] ?? 0

export function rowCount(s: State, tab: TabId = s.tab): number {
  const m = s.model
  if (!m) return 0
  switch (tab) {
    case 'overview':
      return overviewRows(m).length
    case 'decisions':
      return m.decisions.length
    case 'history':
      return m.history.length
    case 'commits':
      return Math.min(commitRows(s).length, COMMIT_ROWS)
    case 'items':
      return itemRows(s).length
    case 'requests':
      return requestRows(s).length
    case 'plugins':
      return m.plugins.length
  }
  const def = viewOf(m, tab)
  if (def) return Math.min(VIEW_ROWS, viewRows(m, def)?.rows.length ?? 0)
  return 0
}

export class Controller {
  private state: State
  private listeners = new Set<() => void>()
  private colors: TerminalColors | null = null
  private basePx = 14
  private pending: Promise<void> | null = null

  constructor(
    private readonly loader: Loader,
    private readonly themePref: 'dark' | 'light' | null = null,
    private readonly now: () => number = Date.now,
  ) {
    this.state = {
      model: null,
      error: null,
      isLoading: false,
      tab: 'overview',
      cursor: {},
      expanded: null,
      theme: makeTheme(null, this.basePx, themePref),
      loadedAt: 0,
      width: 0,
      filter: {},
    }
  }

  getState = (): State => this.state

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  private set(patch: Partial<State>): void {
    this.state = { ...this.state, ...patch }
    for (const fn of this.listeners) fn()
  }

  setColors(colors: TerminalColors | null): void {
    this.colors = colors
    this.set({ theme: makeTheme(colors, this.basePx, this.themePref) })
  }

  setBasePx(px: number): void {
    if (!px || px === this.basePx) return
    this.basePx = px
    this.set({ theme: makeTheme(this.colors, px, this.themePref) })
  }

  setWidth(px: number): void {
    if (px > 0 && px !== this.state.width) this.set({ width: px })
  }

  /** 다시 읽기. force 가 아니면 HEAD · gnam.json · specs/ 가 그대로일 때 아무것도 안 함. 실패는 기존 화면 유지 */
  refresh(force = false): Promise<void> {
    if (this.pending) return this.pending
    this.set({ isLoading: true })
    this.pending = (async () => {
      try {
        const model = await this.loader.load(force)
        if (model) this.applyModel(model)
        else this.set({ isLoading: false, error: null })
      } catch (error) {
        this.set({ isLoading: false, error: error instanceof Error ? error.message : String(error) })
      } finally {
        this.pending = null
      }
    })()
    return this.pending
  }

  private applyModel(model: Model): void {
    const s = this.state
    const draft = { ...s, model }
    const cursor = { ...s.cursor }
    // 선택한 topic 을 이름으로 유지
    const prevName = overviewRows(s.model)[cursorOf(s, 'overview')]
    const rows = overviewRows(model)
    const at = prevName ? rows.indexOf(prevName) : -1
    cursor.overview = at >= 0 ? at : Math.min(cursorOf(s, 'overview'), Math.max(0, rows.length - 1))
    for (const id of Object.keys(cursor)) if (id !== 'overview') cursor[id] = Math.min(cursor[id] ?? 0, Math.max(0, rowCount(draft, id) - 1))
    const expanded = s.expanded && model.topics[s.expanded] ? s.expanded : null
    // 보던 탭이 사라졌으면 (plugin 꺼짐 등) 개요로
    const tab = tabsOf(model).some(t => t.id === s.tab) ? s.tab : 'overview'
    this.set({ model, cursor, expanded, tab, error: null, isLoading: false, loadedAt: this.now() })
  }

  /** 없는 탭 (요청 0 + plugin 꺼짐 등) 은 무시 */
  setTab(tab: TabId): void {
    if (tab !== this.state.tab && tabsOf(this.state.model).some(t => t.id === tab)) this.set({ tab })
  }

  move(by: number): void {
    const s = this.state
    const n = rowCount(s)
    if (n === 0) return
    const next = Math.max(0, Math.min(n - 1, cursorOf(s) + by))
    if (next !== cursorOf(s)) this.set({ cursor: { ...s.cursor, [s.tab]: next } })
  }

  moveTo(index: number): void {
    const s = this.state
    const n = rowCount(s)
    if (n === 0) return
    this.set({ cursor: { ...s.cursor, [s.tab]: Math.max(0, Math.min(n - 1, index)) } })
  }

  /** 필터 바꾸기. 그 필터를 쓰는 탭의 선택은 맨 위로 */
  setFilter(key: string, value: string, tab: TabId = this.state.tab): void {
    const s = this.state
    if ((s.filter[key] ?? 'all') === value) return
    this.set({ filter: { ...s.filter, [key]: value }, cursor: { ...s.cursor, [tab]: 0 } })
  }

  /** 필터를 다음 (by = -1 이면 이전) 값으로 (끝 다음은 all) */
  cycleFilter(key: string, by = 1): void {
    const values = filterValues(this.state, key)
    const at = values.indexOf(filterOf(this.state, key))
    this.setFilter(key, values[(at + by + values.length) % values.length]!)
  }

  /** 개요 탭에서 topic 펼침 · 접기 (1단: 다른 topic 은 접힘) */
  toggle(name?: string): void {
    const s = this.state
    const rows = overviewRows(s.model)
    const target = name ?? rows[cursorOf(s, 'overview')]
    if (!target) return
    const at = rows.indexOf(target)
    this.set({ expanded: s.expanded === target ? null : target, cursor: at >= 0 ? { ...s.cursor, overview: at } : s.cursor })
  }

  /** 키 하나. 처리했으면 true */
  key(e: Key): boolean {
    const k = e.key.toLowerCase()
    const shift = e.mods?.shift === true
    if (e.mods?.ctrl || e.mods?.super || e.mods?.alt) return false
    const tabs = tabsOf(this.state.model)
    const tabIndex = Math.max(0, tabs.findIndex(t => t.id === this.state.tab))
    switch (k) {
      case 'j':
      case 'down':
        this.move(1)
        return true
      case 'k':
      case 'up':
        this.move(-1)
        return true
      case 'pagedown':
        this.move(10)
        return true
      case 'pageup':
        this.move(-10)
        return true
      case 'g':
      case 'home':
      case 'end':
        if (k === 'end' || e.key === 'G' || (k === 'g' && shift)) this.moveTo(Number.MAX_SAFE_INTEGER)
        else this.moveTo(0)
        return true
      case 'enter':
      case 'return':
      case ' ':
      case 'space':
        if (this.state.tab === 'overview') this.toggle()
        return true
      case 'escape':
        if (this.state.expanded) this.set({ expanded: null })
        return true
      case 'tab':
        this.setTab(tabs[(tabIndex + (shift ? tabs.length - 1 : 1)) % tabs.length]!.id)
        return true
      case 'right':
      case 'l':
        this.setTab(tabs[Math.min(tabs.length - 1, tabIndex + 1)]!.id)
        return true
      case 'left':
      case 'h':
        this.setTab(tabs[Math.max(0, tabIndex - 1)]!.id)
        return true
      case 'r':
        void this.refresh(true)
        return true
      case 'f': {
        const key = MAIN_FILTER[this.state.tab]
        if (key) this.cycleFilter(key)
        return true
      }
      case 't':
        if (this.state.tab === 'commits') {
          if (shift) this.cycleFilter('commits.topic', -1)
          else this.cycleFilter('commits.topic')
        }
        return true
    }
    if (/^[1-9]$/.test(k)) {
      const t = tabs[Number(k) - 1]
      if (t) this.setTab(t.id)
      return true
    }
    return false
  }
}

/** 독립 실행 (PIXEL_EMBED 없이, herdr 분할 pane) 의 기본 갱신 주기 */
export const POLL_MS = 5_000

export type Timer = { set: (fn: () => void, ms: number) => unknown; clear: (handle: unknown) => void }
const realTimer: Timer = { set: (fn, ms) => setInterval(fn, ms), clear: h => clearInterval(h as ReturnType<typeof setInterval>) }

/**
 * 독립 실행의 주기 갱신: ms 마다 refresh (force 아님). 바뀐 게 없으면 git rev-parse 1회 · stat 만 하고
 * gnam status 는 부르지 않는다. 진행 중인 읽기가 있으면 그것을 기다린다 (겹치지 않음). 반환 = 멈추기
 */
export function startPolling(c: Controller, ms: number = POLL_MS, timer: Timer = realTimer): () => void {
  const handle = timer.set(() => void c.refresh(), Math.max(1_000, ms))
  return () => timer.clear(handle)
}

/** GNAM_VIEW_POLL_MS (밀리초, 1000 이상) 또는 기본값 */
export function pollMs(value: string | undefined): number {
  const n = Number(value)
  return Number.isFinite(n) && n >= 1_000 ? n : POLL_MS
}
