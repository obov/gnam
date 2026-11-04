// 화면 상태 · 키 처리 · 갱신. React 밖의 작은 store (useSyncExternalStore 로 읽는다).
import type { Loader, Model } from './model.ts'
import { makeTheme, type TerminalColors, type Theme } from './theme.ts'

export const TABS = [
  { id: 'overview', label: '개요' },
  { id: 'decisions', label: '결정' },
  { id: 'history', label: '이력' },
  { id: 'commits', label: '커밋' },
  { id: 'items', label: '항목' },
] as const
export type TabId = (typeof TABS)[number]['id']

/** 커밋 탭에 그리는 최근 커밋 수 (나머지는 개수만) */
export const COMMIT_ROWS = 300

export type State = {
  model: Model | null
  /** 마지막 읽기 실패 (있으면 기존 화면 유지 + 오류 1줄) */
  error: string | null
  isLoading: boolean
  tab: TabId
  cursor: Record<TabId, number>
  /** 펼친 topic (1단: 하나만) */
  expanded: string | null
  theme: Theme
  loadedAt: number
}

export type Key = { key: string; mods?: { shift?: boolean; ctrl?: boolean; alt?: boolean; super?: boolean } }

export function overviewRows(m: Model | null): string[] {
  return m ? [...m.now, ...m.next, ...m.done] : []
}

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
      return Math.min(m.commits.length, COMMIT_ROWS)
    case 'items':
      return m.items.length
  }
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
      cursor: { overview: 0, decisions: 0, history: 0, commits: 0, items: 0 },
      expanded: null,
      theme: makeTheme(null, this.basePx, themePref),
      loadedAt: 0,
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
    const prevName = overviewRows(s.model)[s.cursor.overview]
    const rows = overviewRows(model)
    const at = prevName ? rows.indexOf(prevName) : -1
    cursor.overview = at >= 0 ? at : Math.min(s.cursor.overview, Math.max(0, rows.length - 1))
    for (const t of TABS) if (t.id !== 'overview') cursor[t.id] = Math.min(cursor[t.id], Math.max(0, rowCount(draft, t.id) - 1))
    const expanded = s.expanded && model.topics[s.expanded] ? s.expanded : null
    this.set({ model, cursor, expanded, error: null, isLoading: false, loadedAt: this.now() })
  }

  setTab(tab: TabId): void {
    if (tab !== this.state.tab) this.set({ tab })
  }

  move(by: number): void {
    const s = this.state
    const n = rowCount(s)
    if (n === 0) return
    const next = Math.max(0, Math.min(n - 1, s.cursor[s.tab] + by))
    if (next !== s.cursor[s.tab]) this.set({ cursor: { ...s.cursor, [s.tab]: next } })
  }

  moveTo(index: number): void {
    const s = this.state
    const n = rowCount(s)
    if (n === 0) return
    this.set({ cursor: { ...s.cursor, [s.tab]: Math.max(0, Math.min(n - 1, index)) } })
  }

  /** 개요 탭에서 topic 펼침 · 접기 (1단: 다른 topic 은 접힘) */
  toggle(name?: string): void {
    const s = this.state
    const rows = overviewRows(s.model)
    const target = name ?? rows[s.cursor.overview]
    if (!target) return
    const at = rows.indexOf(target)
    this.set({ expanded: s.expanded === target ? null : target, cursor: at >= 0 ? { ...s.cursor, overview: at } : s.cursor })
  }

  /** 키 하나. 처리했으면 true */
  key(e: Key): boolean {
    const k = e.key.toLowerCase()
    const shift = e.mods?.shift === true
    if (e.mods?.ctrl || e.mods?.super || e.mods?.alt) return false
    const tabIndex = TABS.findIndex(t => t.id === this.state.tab)
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
        this.setTab(TABS[(tabIndex + (shift ? TABS.length - 1 : 1)) % TABS.length]!.id)
        return true
      case 'right':
      case 'l':
        this.setTab(TABS[Math.min(TABS.length - 1, tabIndex + 1)]!.id)
        return true
      case 'left':
      case 'h':
        this.setTab(TABS[Math.max(0, tabIndex - 1)]!.id)
        return true
      case 'r':
        void this.refresh(true)
        return true
    }
    if (/^[1-9]$/.test(k)) {
      const t = TABS[Number(k) - 1]
      if (t) this.setTab(t.id)
      return true
    }
    return false
  }
}
