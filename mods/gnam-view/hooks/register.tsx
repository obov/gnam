import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type {
  Commit,
  Decision,
  GnamPlugin,
  GnamView,
  Item,
  Line,
  Model,
  RequestRow,
  SectionRow,
  Setup,
  Topic,
  TopicFilter,
  TopicStatus,
  Draft,
  Prefs,
  ViewDef,
  ViewUi,
} from '../types'
import { renderView, rowsOf } from './views'

const PANE = 'gnam-view'
const TITLE = 'gnam'
const SECTIONS = ['gnam', 'project', 'config', 'plugins', 'builtins', 'kinds', 'install', 'problems', 'handoff', 'env', 'trace']
const MAX_ROWS = 60

const EMPTY: GnamView = { model: null, error: null, rawConfig: null, loadedAt: 0, isLoading: false }
const UI0: ViewUi = { tab: '', topicFilter: 'active', owner: 'all', itemKind: 'all', reqStatus: 'all', commitTopic: 'all', expanded: [] }
const view = atom({ plugin: 'gnam-view', key: 'view' } as const, EMPTY, { shape: 'view-7' })
const ui = atom({ plugin: 'gnam-view', key: 'ui' } as const, UI0, { shape: 'ui-4' })
const PREFS0: Prefs = { hidden: [], order: [], defaultTab: null, icons: null, header: true, graphs: { dist: true, steps: true, spark: true } }
const prefs = atom({ plugin: 'gnam-view', key: 'prefs' } as const, PREFS0, { shape: 'prefs-1' })
const DRAFT0: Draft = { isOpen: false, editing: null, title: '', source: '', custom: '', where: {}, view: 'list', fields: {}, data: null, isLoading: false, error: null }
const draft = atom({ plugin: 'gnam-view', key: 'draft' } as const, DRAFT0, { shape: 'draft-2' })

type Json = Record<string, any>

let isOpen = false

// Nerd Font 글리프 (Font Awesome 4 · Octicons · Devicons 범위: v2 · v3 패치 폰트 공통). plain = 폰트 없을 때
const NERD = {
  logo: '', md: '', branch: '',
  refresh: '', close: '',
  spec: '', decide: '', request: '', items: '', commit: '', plugin: '', setup: '',
  done: '', partial: '', notStarted: '', none: '',
  check: '', pending: '',
  unimpl: '', open: '', block: '',
  risk: '', remaining: '', deferred: '', item: '',
  ok: '', bad: '', hook: '', link: '', note: '', tasks: '', warn: '',
}
type Icons = typeof NERD
const PLAIN: Icons = {
  logo: '◆', md: '', branch: '',
  refresh: '⟳', close: '✕',
  spec: '', decide: '', request: '', items: '', commit: '', plugin: '', setup: '',
  done: '●', partial: '◐', notStarted: '○', none: '·',
  check: '✓', pending: '○',
  unimpl: '●', open: '●', block: '●',
  risk: '!', remaining: '·', deferred: '·', item: '·',
  ok: '✓', bad: '✗', hook: '', link: '', note: '', tasks: '', warn: '!',
}
let I: Icons = NERD
let DEFAULT_I: Icons = NERD
/** 아이콘 + 공백 (plain 에서 빈 아이콘이면 공백 없음) */
function ic(name: keyof Icons): string {
  return I[name] === '' ? '' : `${I[name]} `
}
const ITEM_ICON: Record<string, keyof Icons> = { risk: 'risk', remaining: 'remaining', deferred: 'deferred', open: 'open', blocking: 'block' }
const TAB_ICON: Record<string, keyof Icons> = { spec: 'spec', decide: 'decide', request: 'request', items: 'items', commits: 'commit', setup: 'setup' }

// ---------- 데이터 ----------

/** 프로젝트에 맞는 gnam 실행 argv (로컬 설치 → gnam checkout → npx) */
async function gnamArgv($: EngineInterface, cwd: string): Promise<string[]> {
  const local = `${cwd}/node_modules/.bin/gnam`
  if (await $.fs.exists(local)) return [local]
  const checkout = `${cwd}/bin/gnam.js`
  if (await $.fs.exists(checkout)) {
    try {
      const pkg = JSON.parse(await $.fs.read(`${cwd}/package.json`)) as Json
      if (pkg.name === '@obov/gnam') return ['node', checkout]
    } catch {}
  }
  return ['npx', '--no-install', 'gnam']
}

function arr(v: unknown): Json[] {
  return Array.isArray(v) ? (v as Json[]) : []
}

function lines(v: unknown): Line[] {
  return arr(v).map(x => ({ line: Number(x.line ?? 0), text: String(x.text ?? '') }))
}

function toTopic(name: string, t: Json, blocking: Json[]): Topic {
  const plans = arr(t.plans)
  const live = [...plans].reverse().find(p => p.status !== 'superseded') ?? null
  const status: TopicStatus = live === null ? 'none' : (live.status as TopicStatus)
  const steps = arr(live?.steps).map(s => ({ n: Number(s.n), title: String(s.title ?? ''), isDone: arr(s.impls).length > 0 }))
  const unimplemented = lines(t.unimplemented)
  const open = lines(t.open)
  const block = blocking.filter(b => b.topic === name).map(b => (b.id ? `${b.id}. ` : '') + String(b.text))
  return {
    name,
    path: String(t.path ?? ''),
    status,
    planSha: live ? String(live.sha) : null,
    planSubject: live ? String(live.subject) : null,
    steps,
    superseded: plans.filter(p => p.status === 'superseded').length,
    unimplemented,
    open,
    blocking: block,
    chores: arr(t.chores).length,
    summary: typeof t.summary === 'string' ? t.summary : null,
    detail: null,
    goal: null,
    planSummary: live && typeof live.summary === 'string' ? live.summary : null,
    isActive: status === 'partial' || status === 'not-started' || unimplemented.length > 0 || open.length > 0 || block.length > 0,
  }
}

/** plugin 섹션을 모양과 무관하게 몇 줄로 요약 */
function oneLine(x: unknown): string {
  if (x === null || x === undefined) return '-'
  if (typeof x !== 'object') return String(x)
  if (Array.isArray(x)) return `${x.length}개`
  const o = x as Json
  const head = ['title', 'subject', 'summary', 'text', 'name', 'id', 'file', 'topic'].find(k => typeof o[k] === 'string')
  const rest = Object.entries(o)
    .filter(([k, v]) => k !== head && (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') && String(v).length < 40)
    .slice(0, 3)
    .map(([k, v]) => `${k}=${v}`)
  return [head ? String(o[head]) : null, ...rest].filter(Boolean).join(' · ') || `{${Object.keys(o).length}}`
}

function sectionRows(sections: unknown): SectionRow[] {
  if (sections === null || typeof sections !== 'object') return []
  return Object.entries(sections as Json).map(([name, v]) => {
    if (Array.isArray(v)) return { name, lines: [`${v.length}개`, ...v.slice(0, 12).map(oneLine)] }
    if (v !== null && typeof v === 'object') return { name, lines: Object.entries(v as Json).slice(0, 12).map(([k, x]) => `${k}: ${oneLine(x)}`) }
    return { name, lines: [oneLine(v)] }
  })
}

function toSetup(d: Json): Setup {
  const raw: Json = d.config?.raw ?? {}
  const hooks: Json = d.install?.hooks ?? {}
  return {
    source: String(d.gnam?.source ?? '?'),
    format: Number(raw.format ?? d.gnam?.format ?? 0),
    inactive: arr(d.builtins).filter(b => !b.active).map(b => String(b.id)),
    extraConfig: Object.keys(raw).filter(k => k !== 'format' && k !== 'plugins'),
    hooksOk: hooks.hooksPath === hooks.expected && hooks.commitMsg === true,
    hooksPath: hooks.hooksPath ?? null,
    skills: arr(d.install?.skills).map(s => ({ dir: String(s.dir), name: String(s.name), ok: s.ok === true })),
    agentsMd: { exists: d.install?.agentsMd?.exists === true, inSync: d.install?.agentsMd?.inSync === true },
    claudeMd: { exists: d.install?.claudeMd?.exists === true, importsAgents: d.install?.claudeMd?.importsAgents === true },
    problems: arr(d.problems).map(p => (p.source ? `[${p.source}] ` : '') + String(p.message)),
    handoff: d.handoff?.exists === true,
    kinds: arr(d.kinds).map(k => ({ label: String(k.label), owner: String(k.owner) })),
  }
}

function toCommits(log: string, kinds: Json[]): Commit[] {
  const matchers = kinds.flatMap(k => {
    try {
      return [{ re: new RegExp(String(k.subject)), owner: String(k.owner) }]
    } catch {
      return []
    }
  })
  return log
    .split('\n')
    .filter(Boolean)
    .map(row => {
      const [sha = '', subject = '', age = '', time = '0'] = row.split('\x1f')
      const owner = matchers.find(m => m.re.test(subject))?.owner ?? 'other'
      const topic = /^[a-z-]+\.([A-Za-z0-9_-]+)\.[a-z-]+: /.exec(subject)?.[1] ?? null
      return { sha, subject, age, time: Number(time), owner, topic }
    })
}

const STATUS_ORDER: Record<TopicStatus, number> = { partial: 0, 'not-started': 1, none: 2, done: 3 }

export function toModel(d: Json, summary: string, log: string): Model {
  const trace: Json = d.trace ?? {}
  const blocking = arr(trace.decisions?.blocking)
  const topics = Object.entries((trace.topics ?? {}) as Json)
    .filter(([name]) => name !== '' && name.toLowerCase() !== 'readme')
    .map(([name, t]) => toTopic(name, t as Json, blocking))
    .sort((a, b) => Number(b.isActive) - Number(a.isActive) || STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.name.localeCompare(b.name))
  const decisions: Decision[] = [
    ...blocking.map(b => ({ kind: 'blocking' as const, where: `${b.topic} ${String(b.plan ?? '').slice(0, 7)}`, text: (b.id ? `${b.id}. ` : '') + String(b.text) })),
    ...arr(trace.decisions?.open).map(o => ({ kind: 'open' as const, where: `${o.path}:${o.line}`, text: String(o.text) })),
  ]
  const requests: RequestRow[] = arr(trace.requests).map(r => ({
    sha: String(r.sha).slice(0, 7),
    subject: String(r.subject),
    status: String(r.status),
    by: arr(r.by).length,
  }))
  const items: Item[] = arr(trace.items).map(i => ({ kind: String(i.kind), text: String(i.text), sha: String(i.sha).slice(0, 7) }))
  const kinds = arr(d.kinds)
  const plugins: GnamPlugin[] = Object.entries((d.plugins ?? {}) as Json).map(([id, p]: [string, Json]) => ({
    id,
    version: String(p.version ?? '?'),
    kind: String(p.kind ?? '?'),
    commands: arr(p.commands).map(c => String(c.name)),
    skills: arr(p.skills).map(String),
    sections: sectionRows(p.sections),
    error: p.error ? String(p.error) : null,
  }))
  return {
    project: String(d.project ?? ''),
    version: String(d.gnam?.version ?? '?'),
    branch: d.env?.branch ?? null,
    summary: summary.split('\n').slice(1).map(s => s.trimEnd()).filter(Boolean),
    purpose: null,
    purposeFrom: null,
    pluginLines: summary
      .split('\n')
      .slice(1)
      .map(s => s.trim())
      .filter(s => s !== '' && !/^(- |인계 메모|plan\s|미결\s)/.test(s))
      .map(s => s.replace(/\s{2,}/g, '  ')),
    topics,
    decisions,
    requests,
    items,
    commits: toCommits(log, kinds),
    owners: [...new Set(kinds.map(k => String(k.owner)))],
    plugins,
    setup: toSetup(d),
    views: [],
    viewData: {},
  }
}

/** 문단 하나를 한 줄로 (빈 줄 · 제목 · 코드 · 목록 · 표 전까지) */
function firstParagraph(lines: string[]): string | null {
  const out: string[] = []
  for (const l of lines) {
    const t = l.trim()
    if (t === '') {
      if (out.length > 0) break
      continue
    }
    if (/^(#|```|[-*|>]\s|\d+\.\s)/.test(t)) {
      if (out.length > 0) break
      continue
    }
    out.push(t)
  }
  return out.length === 0 ? null : out.join(' ')
}

/** `# topic — 설명` · `# topic: 설명` → 설명. 제목이 이름뿐이면 null */
export function parseSpec(name: string, text: string): { summary: string | null; detail: string | null } {
  const lines = text.split('\n')
  const h1 = lines.find(l => /^#\s/.test(l))?.replace(/^#\s+/, '').trim() ?? ''
  const rest = h1.startsWith(name) ? h1.slice(name.length) : h1
  const summary = rest.replace(/^\s*[—:–-]\s*/, '').trim() || null
  const body = lines.slice(lines.findIndex(l => /^#\s/.test(l)) + 1)
  return { summary, detail: firstParagraph(body) }
}

/** plan 본문의 Goal: 필드 (다음 필드 머리 전까지, 한 줄로) */
export function parseGoal(body: string): string | null {
  const lines = body.split('\n')
  const k = lines.findIndex(l => /^Goal:/.test(l))
  if (k < 0) return null
  const out: string[] = []
  const head = (lines[k] ?? '').replace(/^Goal:\s*/, '').trim()
  if (head !== '') out.push(head)
  for (const l of lines.slice(k + 1)) {
    if (/^[A-Z][A-Za-z-]*:/.test(l) || (l.trim() === '' && out.length > 0)) break
    if (l.trim() !== '') out.push(l.trim())
  }
  return out.length === 0 ? null : out.join(' ')
}

/** 사람용 설명을 채운다: spec 제목 · 첫 문단, plan Goal, 프로젝트 목적 */
async function enrich($: EngineInterface, cwd: string, m: Model): Promise<Model> {
  const read = async (path: string) => ((await $.fs.exists(path)) ? await $.fs.read(path) : null)
  const root = m.project || cwd
  const topics = await Promise.all(
    m.topics.map(async t => {
      try {
        const text = t.path ? await read(`${root}/${t.path}`) : null
        if (text === null) return t
        const parsed = parseSpec(t.name, text)
        return { ...t, summary: t.summary ?? parsed.summary, detail: parsed.detail }
      } catch {
        return t
      }
    }),
  )
  const shas = topics.filter(t => t.planSummary === null).map(t => t.planSha).filter((x): x is string => x !== null)
  const goals = new Map<string, string>()
  if (shas.length > 0) {
    try {
      const r = await $.process.run(['git', 'show', '-s', '--format=%H%x1f%B%x1e', ...shas], { cwd: root, timeoutMs: 10000 })
      for (const rec of r.stdout.split('\x1e')) {
        const [sha = '', body = ''] = rec.replace(/^\s+/, '').split('\x1f')
        const goal = parseGoal(body)
        if (sha && goal) goals.set(sha, goal)
      }
    } catch {}
  }
  let purpose: string | null = null
  let purposeFrom: string | null = null
  try {
    const readme = await read(`${root}/README.md`)
    if (readme !== null) {
      const h1 = readme.split('\n').find(l => /^#\s/.test(l))?.replace(/^#\s+/, '').trim() ?? ''
      const para = firstParagraph(readme.split('\n').slice(readme.split('\n').findIndex(l => /^#\s/.test(l)) + 1))
      purpose = [h1.replace(/^[^—:–-]*[—:–-]\s*/, '') || null, para].filter(Boolean).join(' · ') || null
      if (purpose !== null) purposeFrom = 'README.md'
    }
    if (purpose === null) {
      const pkg = await read(`${root}/package.json`)
      const desc = pkg === null ? null : (JSON.parse(pkg) as Json).description
      if (typeof desc === 'string' && desc !== '') {
        purpose = desc
        purposeFrom = 'package.json'
      }
    }
    if (purpose === null) {
      const overview = topics.find(t => ['system', 'overview', 'index', 'project'].includes(t.name) && (t.detail ?? t.summary) !== null)
      if (overview !== undefined) {
        purpose = overview.detail ?? overview.summary
        purposeFrom = overview.path
      }
    }
  } catch {}
  return { ...m, purpose, purposeFrom, topics: topics.map(t => ({ ...t, goal: t.planSha ? goals.get(t.planSha) ?? null : null })) }
}

/** gnam.json view.tabs 원문을 느슨하게 읽는다 (status views 가 없는 gnam 0.4 이하) */
function rawTabs(d: Json): ViewDef[] {
  const tabs = d.config?.raw?.view?.tabs
  if (!Array.isArray(tabs)) return []
  return tabs
    .filter((t: Json) => t && typeof t.id === 'string' && typeof t.title === 'string' && typeof t.source === 'string')
    .map((t: Json) => ({
      id: t.id,
      title: t.title,
      source: t.source,
      where: t.where ?? {},
      view: ['list', 'table', 'progress'].includes(t.view) ? t.view : 'list',
      fields: t.fields ?? {},
      icon: typeof t.icon === 'string' ? t.icon : null,
      owner: 'project',
    }))
}

/** 탭 정의 (status views) 와 탭마다 source 값 */
async function loadViews($: EngineInterface, argv: string[], cwd: string, m: Model, d: Json): Promise<Model> {
  let views: ViewDef[]
  try {
    const r = await $.process.run([...argv, 'status', 'views', '--json'], { cwd, timeoutMs: 30000 })
    const parsed = r.exitCode === 0 ? (JSON.parse(r.stdout) as unknown) : null
    views = Array.isArray(parsed) ? (parsed as ViewDef[]) : rawTabs(d)
  } catch {
    views = rawTabs(d)
  }
  const viewData: Record<string, unknown> = {}
  await Promise.all(
    views.map(async v => {
      try {
        const r = await $.process.run([...argv, 'status', v.source, '--json'], { cwd, timeoutMs: 30000 })
        if (r.exitCode === 0) viewData[v.id] = JSON.parse(r.stdout) as unknown
      } catch {}
    }),
  )
  return { ...m, views, viewData }
}

let prefsFor: string | null = null
const prefsKey = (project: string) => `prefs:${project}`

async function loadPrefs($: EngineInterface, project: string): Promise<void> {
  if (prefsFor === project) return
  prefsFor = project
  const stored = (await $.store.get(prefsKey(project))) as Partial<Prefs> | undefined
  await update($, prefs, () => ({ ...PREFS0, ...(stored ?? {}), graphs: { ...PREFS0.graphs, ...(stored?.graphs ?? {}) } }))
}

async function setPrefs($: EngineInterface, fn: (p: Prefs) => Prefs): Promise<void> {
  const next = fn(await read($, prefs))
  await update($, prefs, () => next)
  if (prefsFor !== null) await $.store.set(prefsKey(prefsFor), next)
}

async function setDraft($: EngineInterface, patch: Partial<Draft>): Promise<void> {
  await update($, draft, d => ({ ...d, ...patch }))
}

/** 새 탭의 데이터 후보: 자주 쓰는 status 경로 + plugin 섹션 */
function sourceList(m: Model): [string, string][] {
  return [
    ['trace.items', '항목'],
    ['trace.requests', '요청'],
    ['trace.decisions.blocking', 'Blocking'],
    ['trace.decisions.open', '미결'],
    ['problems', '설정 문제'],
    ['install.skills', 'skill 링크'],
    ['kinds', '커밋 종류'],
    ['rules', '검사 규칙'],
    ...m.plugins.flatMap(pl => pl.sections.map(sec => [`plugins.${pl.id}.sections.${sec.name}`, `${pl.id} ${sec.name}`] as [string, string])),
  ]
}

const sourceLabel = (m: Model, source: string) => sourceList(m).find(([k]) => k === source)?.[1] ?? source

const TEXT_KEYS = ['title', 'summary', 'subject', 'text', 'message', 'why', 'name', 'label', 'id', 'file', 'key']
const META_KEYS = ['sha', 'file', 'path', 'owner']

/** 원소의 스칼라 키 (앞 20개 원소 기준, 처음 나온 순서) */
function scalarKeysOf(rows: unknown[]): string[] {
  const keys: string[] = []
  for (const r of rows.slice(0, 20))
    if (r !== null && typeof r === 'object')
      for (const [k, x] of Object.entries(r as Json)) if ((x === null || typeof x !== 'object') && !keys.includes(k)) keys.push(k)
  return keys
}

type Scalar = string | number | boolean | null
/** 거르기 후보: 값 종류가 2-8개인 스칼라 키 → [값, 개수] */
function categories(rows: unknown[]): [string, [Scalar, number][]][] {
  const out: [string, [Scalar, number][]][] = []
  for (const k of scalarKeysOf(rows)) {
    if (TEXT_KEYS.includes(k) || META_KEYS.includes(k) || k === 'line') continue
    const counts = new Map<string, [Scalar, number]>()
    for (const r of rows) {
      const x = (r as Json | null)?.[k] as Scalar | undefined
      if (x === undefined || (x !== null && typeof x === 'object')) continue
      const c = counts.get(String(x))
      counts.set(String(x), [x, (c?.[1] ?? 0) + 1])
    }
    if (counts.size >= 2 && counts.size <= 8) out.push([k, [...counts.values()]])
  }
  return out
}

/** 저장할 fields: 고른 것 + 데이터 보고 정한 기본값 */
function autoFields(d: Draft): Record<string, string | string[]> {
  const rows = rowsOf(d.data)
  const keys = scalarKeysOf(rows)
  const out: Record<string, string | string[]> = {}
  if (d.view === 'table') {
    out.columns = Array.isArray(d.fields.columns) ? d.fields.columns : keys.slice(0, 4)
    return out
  }
  const title = typeof d.fields.title === 'string' ? d.fields.title : TEXT_KEYS.find(k => keys.includes(k)) ?? keys[0]
  if (title !== undefined) out.title = title
  if (d.view === 'list') {
    const badge = categories(rows).map(([k]) => k).find(k => !(k in d.where) && k !== title)
    const meta = META_KEYS.find(k => keys.includes(k) && k !== title)
    if (badge !== undefined) out.badge = badge
    if (meta !== undefined) out.meta = meta
  }
  for (const [k, x] of Object.entries(d.fields)) if (k !== 'columns') out[k] = x
  return out
}

const autoTitle = (label: string, where: Draft['where']) =>
  [...[label, ...Object.values(where).map(String)].join(' · ')].slice(0, 24).join('')

/** 그리는 쪽과 저장이 같은 정의를 쓴다 */
function draftDef(m: Model, d: Draft, id: string): ViewDef {
  return {
    id,
    title: d.title.trim() !== '' ? d.title.trim() : autoTitle(sourceLabel(m, d.source), d.where),
    source: d.source,
    where: d.where,
    view: d.view,
    fields: autoFields(d),
    icon: null,
    owner: 'project',
  }
}

async function loadDraftData($: EngineInterface, source: string): Promise<void> {
  const cwd = await $.session.cwd()
  let data: unknown = null
  try {
    const argv = await gnamArgv($, cwd)
    const r = await $.process.run([...argv, 'status', source, '--json'], { cwd, timeoutMs: 30000 })
    if (r.exitCode === 0) data = JSON.parse(r.stdout) as unknown
  } catch {}
  await update($, draft, d => (d.source === source ? { ...d, data, isLoading: false } : d))
}

async function pickSource($: EngineInterface, source: string): Promise<void> {
  const s = source.trim()
  if (s === '') return
  await update($, draft, d => ({ ...d, source: s, where: {}, fields: {}, title: '', data: null, isLoading: true, error: null }))
  await loadDraftData($, s)
}

async function toggleWhere($: EngineInterface, key: string, value: Scalar | undefined): Promise<void> {
  await update($, draft, d => {
    const where = { ...d.where }
    if (value === undefined || where[key] === value) delete where[key]
    else where[key] = value
    return { ...d, where }
  })
}

async function toggleColumn($: EngineInterface, key: string, current: string[]): Promise<void> {
  const columns = current.includes(key) ? current.filter(x => x !== key) : [...current, key]
  await update($, draft, d => ({ ...d, fields: { ...d.fields, columns } }))
}

/** 저장: gnam.json view.tabs (커밋은 사용자). id 는 이름 · 데이터에서 만든다 */
async function saveDraft($: EngineInterface): Promise<void> {
  const d = await read($, draft)
  const m = (await read($, view)).model
  if (!m) return
  if (d.source === '') return setDraft($, { error: '데이터 선택 필요' })
  const path = `${m.project}/gnam.json`
  const config = JSON.parse(await $.fs.read(path)) as Json
  const tabs: Json[] = Array.isArray(config.view?.tabs) ? [...config.view.tabs] : []
  const def = draftDef(m, d, '')
  let id = d.editing
  if (id === null) {
    const base =
      [d.source.split('.').pop() ?? 'tab', ...Object.values(d.where).map(String)]
        .join('-')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 28) || 'tab'
    const taken = new Set([...tabs.map(t => String(t.id)), ...m.views.map(x => x.id)])
    id = base
    for (let n = 2; taken.has(id); n++) id = `${base}-${n}`
  }
  const tab: Json = { id, title: def.title, source: def.source, view: def.view }
  if (Object.keys(def.where).length > 0) tab.where = def.where
  if (Object.keys(def.fields).length > 0) tab.fields = def.fields
  const at = tabs.findIndex(t => t.id === d.editing)
  if (at >= 0) tabs[at] = tab
  else tabs.push(tab)
  config.view = { ...(config.view ?? {}), tabs }
  await $.fs.write(path, `${JSON.stringify(config, null, 2)}\n`)
  await update($, draft, () => DRAFT0)
  $.ui.toast(`탭 ${d.editing === null ? '추가' : '수정'}: ${def.title}`)
  await refresh($)
  await setUi($, { tab: `view:${id}` })
}

async function deleteTab($: EngineInterface, id: string): Promise<void> {
  const v = await read($, view)
  const project = v.model?.project
  if (!project) return
  const path = `${project}/gnam.json`
  const config = JSON.parse(await $.fs.read(path)) as Json
  const tabs: Json[] = Array.isArray(config.view?.tabs) ? config.view.tabs.filter((t: Json) => t.id !== id) : []
  if (tabs.length === 0) delete config.view
  else config.view = { ...config.view, tabs }
  await $.fs.write(path, `${JSON.stringify(config, null, 2)}\n`)
  $.ui.toast(`탭 삭제: ${id}`)
  await refresh($)
}

async function editTab($: EngineInterface, def: ViewDef): Promise<void> {
  await update($, draft, () => ({
    ...DRAFT0,
    isOpen: true,
    editing: def.id,
    title: def.title,
    source: def.source,
    where: def.where,
    view: def.view,
    fields: def.fields,
    isLoading: true,
  }))
  await loadDraftData($, def.source)
}

async function moveTab($: EngineInterface, ids: string[], id: string, by: number): Promise<void> {
  const order = [...ids]
  const at = order.indexOf(id)
  const to = at + by
  if (at < 0 || to < 0 || to >= order.length) return
  order.splice(at, 1)
  order.splice(to, 0, id)
  await setPrefs($, p => ({ ...p, order }))
}

async function refresh($: EngineInterface): Promise<void> {
  await update($, view, v => ({ ...v, isLoading: true }))
  const cwd = await $.session.cwd()
  const loadedAt = await $.clock.now()
  let next: GnamView
  try {
    const argv = await gnamArgv($, cwd)
    const [tree, text, log] = await Promise.all([
      $.process.run([...argv, 'status', ...SECTIONS, '--json'], { cwd, timeoutMs: 30000 }),
      $.process.run([...argv, 'status'], { cwd, timeoutMs: 30000 }),
      $.process.run(['git', 'log', '-n', '150', '--format=%h%x1f%s%x1f%cr%x1f%ct'], { cwd, timeoutMs: 10000 }),
    ])
    const parsed = JSON.parse(tree.stdout) as Json
    const base = await enrich($, cwd, toModel(parsed, text.stdout, log.stdout))
    const model = await loadViews($, argv, cwd, base, parsed)
    await loadPrefs($, model.project)
    next = { ...EMPTY, model, loadedAt }
  } catch {
    const configPath = `${cwd}/gnam.json`
    const rawConfig = (await $.fs.exists(configPath)) ? await $.fs.read(configPath) : null
    const error = rawConfig === null ? 'gnam.json 없음 (gnam 미설치 프로젝트)' : 'gnam status --json 실패 (gnam < 0.3 또는 미설치)'
    next = { ...EMPTY, error, rawConfig, loadedAt }
  }
  await update($, view, () => next)
}

async function open($: EngineInterface): Promise<void> {
  isOpen = true
  await $.ui.open({ id: PANE, title: TITLE })
  void refresh($)
}

async function setUi($: EngineInterface, patch: Partial<ViewUi>): Promise<void> {
  await update($, ui, u => ({ ...u, ...patch }))
}

async function toggleTopic($: EngineInterface, name: string): Promise<void> {
  await update($, ui, u => ({
    ...u,
    expanded: u.expanded.includes(name) ? u.expanded.filter(x => x !== name) : [...u.expanded, name],
  }))
}

// ---------- 화면 ----------

const STATUS_ICON: Record<TopicStatus, keyof Icons> = { done: 'done', partial: 'partial', 'not-started': 'notStarted', none: 'none' }
const STATUS_LABEL: Record<TopicStatus, string> = { done: '끝남', partial: '진행 중', 'not-started': '시작 전', none: 'plan 없음' }
const STATUS_COLOR: Record<TopicStatus, string> = { done: 'success', partial: 'claude', 'not-started': 'suggestion', none: 'inactive' }
const FILTERS: [TopicFilter, string][] = [['active', '할 일 남음'], ['not-started', '시작 전'], ['done', '끝남'], ['all', '전체']]

function passes(t: Topic, f: TopicFilter): boolean {
  if (f === 'all') return true
  if (f === 'active') return t.isActive
  if (f === 'not-started') return t.status === 'not-started'
  return t.status === 'done' && !t.isActive
}

export const register: Register = (on, options) => {
  isOpen = false
  DEFAULT_I = (options as { icons?: string } | undefined)?.icons === 'plain' ? PLAIN : NERD
  I = DEFAULT_I

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'gnam-view', description: 'gnam spec 진행 · 결정 · 요청 · plugin 상태를 pane 으로 표시' })
    return next(e)
  })

  on('command.run', { command: 'gnam-view' }, async $ => {
    await open($)
    return { text: 'gnam pane 열림' }
  })

  on('ui.close', async ($, e, next) => {
    if (e.id === PANE) isOpen = false
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (isOpen) void refresh($)
    return next(e)
  })

  // /clear 는 session.start 없이 새 세션으로 넘어가며 $.state 가 비므로, 열린 pane 을 다시 읽는다
  on('classic.SessionStart', async ($, e, next) => {
    if (isOpen && e.source === 'clear') void refresh($)
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const els = $.ui.resolve(e)
    const { Box, Text, Button } = els
    const Select = 'Select' in els ? els.Select : undefined
    const v = await read($, view)
    const u = await read($, ui)
    const pr = await read($, prefs)
    const dr = await read($, draft)
    I = pr.icons === null ? DEFAULT_I : pr.icons === 'plain' ? PLAIN : NERD
    const Input = 'Input' in els ? els.Input : undefined
    const cols = Math.max(30, (e.props as { bodyColumns?: number }).bodyColumns ?? 80)
    const graphW = Math.max(10, Math.min(40, cols - 34))

    // ---- 그래프 3종: 누적 막대 (분포) · 단계 막대 (topic) · 스파크라인 (시간) ----
    type Seg = { n: number; color: string; label: string }
    const stacked = (segs: Seg[], w = graphW) => {
      const total = segs.reduce((a, x) => a + x.n, 0)
      if (total === 0) return <Text color="inactive">{'─'.repeat(w)}</Text>
      const widths = segs.map(x => (x.n === 0 ? 0 : Math.max(1, Math.round((x.n / total) * w))))
      let over = widths.reduce((a, x) => a + x, 0) - w
      while (over > 0) {
        const k = widths.indexOf(Math.max(...widths))
        widths[k] = (widths[k] ?? 1) - 1
        over -= 1
      }
      return (
        <Text>
          {segs.map((x, k) => (
            <Text color={x.color}>{'█'.repeat(widths[k] ?? 0)}</Text>
          ))}
        </Text>
      )
    }
    const legend = (segs: Seg[]) => (
      <Text>
        {segs
          .filter(x => x.n > 0)
          .map(x => (
            <Text>
              <Text color={x.color}>{'● '}</Text>
              <Text dimColor>{`${x.label} ${x.n}   `}</Text>
            </Text>
          ))}
      </Text>
    )
    /** 단계 막대: topic 마다 같은 폭 w, 단계 수만큼 나눈 칸 (칸이 1 보다 좁으면 이어진 막대) */
    const steps = (done: number, total: number, color: string, w = graphW) => {
      if (total === 0) return <Text color="inactive">{'┄'.repeat(w)}</Text>
      if (total * 2 - 1 > w) {
        const fill = Math.round((done / total) * w)
        return (
          <Text>
            <Text color={color}>{'━'.repeat(fill)}</Text>
            <Text color="inactive">{'━'.repeat(w - fill)}</Text>
          </Text>
        )
      }
      const avail = w - (total - 1)
      const base = Math.floor(avail / total)
      const extra = avail % total
      return (
        <Text>
          {Array.from({ length: total }, (_, k) => (
            <Text color={k < done ? color : 'inactive'}>{'━'.repeat(base + (k < extra ? 1 : 0)) + (k < total - 1 ? ' ' : '')}</Text>
          ))}
        </Text>
      )
    }
    const field = (label: string, content: unknown, color?: string) => (
      <Box>
        <Box width={12} flexShrink={0}>
          <Text color={color ?? 'inactive'}>{label}</Text>
        </Box>
        <Box flexDirection="column" flexGrow={1} flexShrink={1}>
          {content as any}
        </Box>
      </Box>
    )
    const BLOCKS = ' ▁▂▃▄▅▆▇█'
    const spark = (values: number[], color: string) => {
      const max = Math.max(1, ...values)
      return <Text color={color}>{values.map(x => (x === 0 ? '·' : BLOCKS[Math.max(1, Math.round((x / max) * 8))])).join('')}</Text>
    }
    const DAYS = 14
    const perDay = (times: number[]) => {
      const now = v.loadedAt > 0 ? v.loadedAt / 1000 : Math.max(0, ...times)
      const out = Array.from({ length: DAYS }, () => 0)
      for (const t of times) {
        const d = Math.floor((now - t) / 86400)
        if (d >= 0 && d < DAYS) out[DAYS - 1 - d] = (out[DAYS - 1 - d] ?? 0) + 1
      }
      return out
    }
    const metric = (label: string, graph: unknown, tail?: unknown) => (
      <Box>
        <Box width={12}>
          <Text dimColor>{label}</Text>
        </Box>
        {graph as any}
        {tail !== undefined && <Text>{'  '}</Text>}
        {tail as any}
      </Box>
    )

    const badge = (label: string, color: string) => (
      <Text color={color} weight="bold">
        {label}
      </Text>
    )
    const section = (title: string, children: unknown, right?: unknown) => (
      <Box flexDirection="column" marginTop={1}>
        <Box justifyContent="space-between">
          <Text weight="bold">{title}</Text>
          {right as any}
        </Box>
        {children as any}
      </Box>
    )
    const empty = (text: string) => <Text dimColor>{`  ${text}`}</Text>
    const select = (key: string, label: string, value: string, options: [string, string][], pick: (v: string) => unknown) =>
      Select !== undefined ? (
        <Select key={key} label={`${label} `} value={value} options={options.map(([value, label]) => ({ value, label }))} onSelect={(x: string) => void pick(x)} />
      ) : (
        <Box gap={1} flexWrap="wrap">
          {options.map(([o, l]) => (
            <Button key={`${key}:${o}`} plain dimColor={o !== value} onPress={() => pick(o)}>
              {l}
            </Button>
          ))}
        </Box>
      )
    const headerButtons = (
      <Box gap={2}>
        <Button key="refresh" hotkey="r" plain dimColor onPress={() => refresh($)}>
          {v.isLoading ? `${ic('refresh')}읽는 중` : `${ic('refresh')}새로고침`}
        </Button>
        <Button key="close" role="dismiss" plain dimColor onPress={() => $.ui.close({ id: PANE })}>
          {I.close}
        </Button>
      </Box>
    )

    if (v.model === null) {
      return (
        <Box flexDirection="column">
          <Box borderStyle="round" borderColor="inactive" paddingX={1} justifyContent="space-between">
            <Text weight="bold" color="claude">{`${I.logo} gnam`}</Text>
            {headerButtons}
          </Box>
          <Box flexDirection="column" paddingX={1}>
            {v.error === null ? empty('읽는 중…') : <Text color="warning">{v.error}</Text>}
            {v.rawConfig !== null && <Text dimColor>{v.rawConfig.trim()}</Text>}
          </Box>
        </Box>
      )
    }

    const m = v.model
    const activeTopics = m.topics.filter(t => t.isActive)
    const openReq = m.requests.filter(r => r.status !== 'refined').length
    const hasRequest = m.requests.length > 0 || m.plugins.some(p => p.id === 'request')
    // 탭 등록표: 기본 탭 · gnam views (프로젝트 · plugin) · view 없는 plugin 섹션. 순서 · 숨김은 개인 설정
    type TabEntry = { id: string; title: string; icon: keyof Icons; owner: string; def?: ViewDef }
    const VIEW_ICON: Record<string, keyof Icons> = { risk: 'risk', lore: 'note', agents: 'tasks', list: 'items', table: 'items', progress: 'tasks' }
    const builtin: TabEntry[] = [
      { id: 'spec', title: 'Spec', icon: 'spec', owner: '기본' },
      { id: 'decide', title: '결정', icon: 'decide', owner: '기본' },
      ...(hasRequest ? [{ id: 'request', title: '요청', icon: 'request' as const, owner: '기본' }] : []),
      { id: 'items', title: '항목', icon: 'items', owner: '기본' },
      { id: 'commits', title: '커밋', icon: 'commit', owner: '기본' },
    ]
    const viewTabs: TabEntry[] = m.views.map(d => ({
      id: `view:${d.id}`,
      title: d.title,
      icon: VIEW_ICON[d.icon ?? ''] ?? VIEW_ICON[d.view] ?? 'items',
      owner: d.owner === 'project' ? '프로젝트' : `plugin ${d.owner}`,
      def: d,
    }))
    const legacy: TabEntry[] = m.plugins
      .filter(p => (p.sections.length > 0 || p.error !== null) && !m.views.some(d => d.owner === p.id))
      .map(p => ({ id: `plugin:${p.id}`, title: p.id, icon: 'plugin' as const, owner: `plugin ${p.id}` }))
    const defaultOrder = [...builtin, ...viewTabs, ...legacy]
    const rank = (id: string) => {
      const k = pr.order.indexOf(id)
      return k < 0 ? pr.order.length + defaultOrder.findIndex(t => t.id === id) : k
    }
    const allTabs = [...defaultOrder].sort((a, b) => rank(a.id) - rank(b.id))
    const setupTab: TabEntry = { id: 'setup', title: '설정', icon: 'setup', owner: '기본' }
    const visibleTabs = [...allTabs.filter(t => !pr.hidden.includes(t.id)), setupTab]
    const tabs: [string, string][] = visibleTabs.map(t => [t.id, t.title])
    const wanted = u.tab !== '' ? u.tab : pr.defaultTab ?? ''
    const tab = tabs.some(([id]) => id === wanted) ? wanted : tabs[0]?.[0] ?? 'setup'


    let body: unknown
    if (tab === 'spec') {
      const shown = m.topics.filter(t => passes(t, u.topicFilter))
      const dist: Seg[] = [
        { n: m.topics.filter(t => t.status === 'done' && !t.isActive).length, color: 'success', label: '끝남' },
        { n: m.topics.filter(t => t.status === 'done' && t.isActive).length, color: 'warning', label: '다음 계획 필요' },
        { n: m.topics.filter(t => t.status === 'partial').length, color: 'claude', label: '진행 중' },
        { n: m.topics.filter(t => t.status === 'not-started').length, color: 'suggestion', label: '시작 전' },
        { n: m.topics.filter(t => t.status === 'none').length, color: 'inactive', label: 'plan 없음' },
      ]
      const stepTotal = m.topics.reduce((a, t) => a + t.steps.length, 0)
      const stepDone = m.topics.reduce((a, t) => a + t.steps.filter(x => x.isDone).length, 0)
      const specCommits = m.commits.filter(c => c.topic !== null)
      body = (
        <Box flexDirection="column">
          <Box flexDirection="column" marginTop={1}>
            {pr.graphs.dist && metric('topic 상태', stacked(dist), legend(dist))}
            {pr.graphs.steps && metric('단계', stacked([{ n: stepDone, color: 'success', label: '완료' }, { n: stepTotal - stepDone, color: 'inactive', label: '남음' }]), <Text dimColor>{`${stepDone}/${stepTotal}`}</Text>)}
            {pr.graphs.spark && metric(`커밋 ${DAYS}일`, spark(perDay(specCommits.map(c => c.time)), 'suggestion'), <Text dimColor>{`spec 커밋 ${perDay(specCommits.map(c => c.time)).reduce((a, x) => a + x, 0)}`}</Text>)}
          </Box>
          {section(
            `Topics ${shown.length}`,
            <Box flexDirection="column" gap={1}>
              {shown.length === 0 && empty('해당 topic 없음')}
              {shown.map(t => {
                const done = t.steps.filter(x => x.isDone).length
                const isExpanded = u.expanded.includes(t.name)
                const color = STATUS_COLOR[t.status]
                const extra = [
                  t.blocking.length > 0 ? { text: `Blocking ${t.blocking.length}`, color: 'error' } : null,
                  t.unimplemented.length > 0 ? { text: `미구현 ${t.unimplemented.length}`, color: 'warning' } : null,
                  t.open.length > 0 ? { text: `미결 ${t.open.length}`, color: 'warning' } : null,
                ].filter((x): x is { text: string; color: string } => x !== null)
                const topicCommits = m.commits.filter(c => c.topic === t.name)
                return (
                  <Box key={`row:${t.name}`} flexDirection="column">
                    <Box justifyContent="space-between">
                      <Box flexShrink={1}>
                        <Button key={`topic:${t.name}`} plain onPress={() => toggleTopic($, t.name)}>
                          <Text dimColor>{isExpanded ? '▾ ' : '▸ '}</Text>
                          <Text weight="bold">{t.name}</Text>
                        </Button>
                        {t.summary !== null && (
                          <Text dimColor wrap="truncate-end">{`  ${t.summary}`}</Text>
                        )}
                      </Box>
                      <Box flexShrink={0} paddingLeft={1}>
                        {t.status === 'done' && t.isActive
                          ? badge(`${ic('remaining')}다음 계획 필요`, 'warning')
                          : badge(`${ic(STATUS_ICON[t.status])}${STATUS_LABEL[t.status]}`, color)}
                      </Box>
                    </Box>
                    <Box paddingLeft={2}>
                      {steps(done, t.steps.length, color)}
                      <Text dimColor>{t.steps.length > 0 ? `  ${String(done).padStart(2)}/${String(t.steps.length).padEnd(2)}` : '  plan 없음'}</Text>
                      {extra.map(x => (
                        <Text color={x.color}>{`   ${x.text}`}</Text>
                      ))}
                    </Box>
                    {isExpanded && (
                      <Box flexDirection="column" paddingLeft={2} marginTop={1} gap={1}>
                        {t.planSubject !== null &&
                          field(
                            '최근 계획',
                            <Box flexDirection="column">
                              <Text weight="bold">{t.planSummary ?? t.goal ?? t.planSubject.replace(/^spec\.[^:]+\.plan:\s*/, '')}</Text>
                              <Text dimColor wrap="truncate-end">
                                {`${t.planSha?.slice(0, 7)} ${t.planSubject.replace(/^spec\.[^:]+\.plan:\s*/, '')}${t.superseded > 0 ? ` · 이전 plan ${t.superseded}개 대체됨` : ''}`}
                              </Text>
                            </Box>,
                            'suggestion',
                          )}
                        {t.detail !== null && field('설명', <Text>{t.detail}</Text>)}
                        {t.steps.length > 0 &&
                          field(
                            '단계',
                            <Box flexDirection="column">
                              {t.steps.map(x => (
                                <Text wrap="truncate-end">
                                  <Text color={x.isDone ? 'success' : 'inactive'}>{ic(x.isDone ? 'check' : 'pending')}</Text>
                                  <Text dimColor={x.isDone}>{x.title.replace(/\s*\([^)]*\)\s*$/, '')}</Text>
                                </Text>
                              ))}
                            </Box>,
                          )}
                        {(t.blocking.length > 0 || t.unimplemented.length > 0 || t.open.length > 0) &&
                          field(
                            '남은 일',
                            <Box flexDirection="column">
                              {t.blocking.map(b => (
                                <Text wrap="truncate-end">
                                  <Text color="error">{'막힘  '}</Text>
                                  {b}
                                </Text>
                              ))}
                              {t.open.map(l => (
                                <Text wrap="truncate-end">
                                  <Text color="warning">{'미결  '}</Text>
                                  {l.text}
                                </Text>
                              ))}
                              {t.unimplemented.slice(0, 10).map(l => (
                                <Text wrap="truncate-end">
                                  <Text color="warning">{'미구현 '}</Text>
                                  {l.text}
                                </Text>
                              ))}
                              {t.unimplemented.length > 10 && <Text dimColor>{`… 외 ${t.unimplemented.length - 10}개`}</Text>}
                            </Box>,
                            'warning',
                          )}
                        {topicCommits.length > 0 &&
                          field(
                            '작업 기록',
                            <Box flexDirection="column">
                              {topicCommits.slice(0, 3).map(c => (
                                <Text dimColor wrap="truncate-end">
                                  {`${c.age.replace(/ ago$/, '')} · ${c.subject.replace(/^[a-z-]+\.[^.]+\.([a-z-]+): /, '$1: ')}`}
                                </Text>
                              ))}
                            </Box>,
                          )}
                        {field('파일', <Text dimColor>{t.path}{t.chores > 0 ? ` · 정리 커밋 ${t.chores}` : ''}</Text>)}
                      </Box>
                    )}
                  </Box>
                )
              })}
            </Box>,
            select('filter', '상태', u.topicFilter, FILTERS.map(([f, label]) => [f, `${label} (${m.topics.filter(t => passes(t, f)).length})`]), x => setUi($, { topicFilter: x as TopicFilter })),
          )}
        </Box>
      )
    } else if (tab === 'decide') {
      body = section(
        `사람 결정 필요 ${m.decisions.length}`,
        m.decisions.length === 0 ? (
          empty('결정 필요 항목 없음')
        ) : (
          <Box flexDirection="column">
            {m.decisions.map(d => (
              <Text wrap="truncate-end">
                {badge(`${ic(d.kind === 'blocking' ? 'block' : 'open')}${d.kind === 'blocking' ? 'Blocking' : '미결'}`, d.kind === 'blocking' ? 'error' : 'warning')} <Text dimColor>{d.where}</Text> {d.text}
              </Text>
            ))}
          </Box>
        ),
      )
    } else if (tab === 'request') {
      const STATUSES = ['open', 'started', 'refined']
      const REQ_COLOR: Record<string, string> = { open: 'warning', started: 'suggestion', refined: 'inactive' }
      const rs = STATUSES.includes(u.reqStatus) ? u.reqStatus : 'all'
      const shown = m.requests.filter(r => rs === 'all' || r.status === rs)
      const dist = STATUSES.map(x => ({ n: m.requests.filter(r => r.status === x).length, color: REQ_COLOR[x] ?? 'inactive', label: x }))
      body = (
        <Box flexDirection="column">
          <Box flexDirection="column" marginTop={1}>
            {pr.graphs.dist && metric('요청 상태', stacked(dist), legend(dist))}
          </Box>
          {section(
            `요청 ${shown.length}`,
            shown.length === 0 ? (
              empty('요청 없음')
            ) : (
              <Box flexDirection="column">
                {shown.slice(0, MAX_ROWS).map(r => (
                  <Text wrap="truncate-end">
                    {badge(r.status.padEnd(8), REQ_COLOR[r.status] ?? 'inactive')}<Text dimColor>{`${r.sha}${r.by > 0 ? ` ×${r.by}` : ''}`}</Text> {r.subject.replace(/^request:\s*/, '')}
                  </Text>
                ))}
              </Box>
            ),
            select('req', '상태', rs, ['all', ...STATUSES].map(x => [x, `${x === 'all' ? '전체' : x} (${x === 'all' ? m.requests.length : m.requests.filter(r => r.status === x).length})`]), x => setUi($, { reqStatus: x })),
          )}
        </Box>
      )
    } else if (tab === 'items') {
      const kinds = [...new Set(m.items.map(i => i.kind))]
      const kind = kinds.includes(u.itemKind) ? u.itemKind : 'all'
      const shown = m.items.filter(i => kind === 'all' || i.kind === kind)
      const ITEM_COLOR: Record<string, string> = { risk: 'error', blocking: 'error', remaining: 'warning', open: 'suggestion', deferred: 'inactive' }
      const dist = kinds.map(k => ({ n: m.items.filter(i => i.kind === k).length, color: ITEM_COLOR[k] ?? 'inactive', label: k }))
      body = (
        <Box flexDirection="column">
          <Box flexDirection="column" marginTop={1}>
            {pr.graphs.dist && metric('항목 종류', stacked(dist), legend(dist))}
          </Box>
          {section(
            `항목 ${shown.length}  `,
            shown.length === 0 ? (
              empty('항목 없음')
            ) : (
              <Box flexDirection="column">
                <Text dimColor>plan · impl 본문 기록, 최근 순, 해결 여부 미판정</Text>
                {[...shown]
                  .reverse()
                  .slice(0, MAX_ROWS)
                  .map(i => (
                    <Text wrap="truncate-end">
                      {badge(`${ic(ITEM_ICON[i.kind] ?? 'item')}${i.kind.padEnd(9)}`, ITEM_COLOR[i.kind] ?? 'inactive')}<Text dimColor>{i.sha}</Text> {i.text.split('\n')[0]}
                    </Text>
                  ))}
              </Box>
            ),
            select('item', '종류', kind, ['all', ...kinds].map(k => [k, `${k === 'all' ? '전체' : k} (${k === 'all' ? m.items.length : m.items.filter(i => i.kind === k).length})`]), x => setUi($, { itemKind: x })),
          )}
        </Box>
      )
    } else if (tab === 'commits') {
      const owners = ['all', ...m.owners, ...(m.commits.some(c => c.owner === 'other') ? ['other'] : [])]
      const owner = owners.includes(u.owner) ? u.owner : 'all'
      const topicNames = [...new Set(m.commits.map(c => c.topic).filter((x): x is string => x !== null))]
      const ct = topicNames.includes(u.commitTopic) ? u.commitTopic : 'all'
      const shown = m.commits.filter(c => (owner === 'all' || c.owner === owner) && (ct === 'all' || c.topic === ct))
      const OWNER_COLORS = ['inactive', 'suggestion', 'warning', 'success', 'claude', 'error']
      const dist = owners.slice(1).map((o, k) => ({ n: m.commits.filter(c => c.owner === o).length, color: OWNER_COLORS[k % OWNER_COLORS.length] ?? 'inactive', label: o }))
      const days = perDay(shown.map(c => c.time))
      body = (
        <Box flexDirection="column">
          <Box flexDirection="column" marginTop={1}>
            {pr.graphs.dist && metric('종류', stacked(dist), legend(dist))}
            {pr.graphs.spark && metric(`${DAYS}일`, spark(days, 'suggestion'), <Text dimColor>{`선택 ${days.reduce((a, x) => a + x, 0)}`}</Text>)}
          </Box>
          <Box gap={2} flexWrap="wrap" marginTop={1}>
            {select('owner', '종류', owner, owners.map(o => [o, `${o === 'all' ? '전체' : o} (${o === 'all' ? m.commits.length : m.commits.filter(c => c.owner === o).length})`]), x => setUi($, { owner: x }))}
            {topicNames.length > 0 && select('ctopic', 'topic', ct, [['all', '전체'], ...topicNames.map(t => [t, t] as [string, string])], x => setUi($, { commitTopic: x }))}
          </Box>
          {section(
            `커밋 ${shown.length}`,
            shown.length === 0 ? (
              empty('커밋 없음')
            ) : (
              <Box flexDirection="column">
                {shown.slice(0, MAX_ROWS).map(c => (
                  <Text wrap="truncate-end">
                    <Text color={c.owner === 'core' ? 'inactive' : 'suggestion'}>{ic(c.owner === 'core' || c.owner === 'other' ? 'commit' : 'plugin')}</Text>
                    <Text color="suggestion">{c.sha}</Text> <Text dimColor>{c.age.replace(/ ago$/, '').padEnd(9)}</Text>
                    {c.subject}
                  </Text>
                ))}
              </Box>
            ),
          )}
        </Box>
      )
    } else if (tab.startsWith('view:')) {
      const entry = allTabs.find(t => t.id === tab)
      const d = entry?.def
      body = d && (
        <Box flexDirection="column" marginTop={1}>
          <Box justifyContent="space-between">
            <Text weight="bold">{`${ic(entry.icon)}${d.title}`}</Text>
            <Text dimColor>{`${entry.owner} · ${d.view}`}</Text>
          </Box>
          {renderView({ Box, Text }, d, m.viewData[d.id], cols - 2) as any}
        </Box>
      )
    } else if (tab.startsWith('plugin:')) {
      const p = m.plugins.find(x => `plugin:${x.id}` === tab)
      body = p && (
        <Box flexDirection="column">
          {section(
            `${ic('plugin')}${p.id}`,
            <Box flexDirection="column">
              <Text dimColor>{`v${p.version} · ${p.kind}${p.commands.length > 0 ? ` · 명령 ${p.commands.join(', ')}` : ''}`}</Text>
              {p.error !== null && <Text color="error">{p.error}</Text>}
            </Box>,
          )}
          {p.sections.map(sec =>
            section(
              sec.name,
              <Box flexDirection="column">
                {sec.lines.map((l, k) => (
                  <Text dimColor wrap="truncate-end">{`${k === sec.lines.length - 1 ? '└─ ' : '├─ '}${l}`}</Text>
                ))}
              </Box>,
            ),
          )}
        </Box>
      )
    } else {

      const toggle = (key: string, isOn: boolean, label: string, press: () => unknown) => (
        <Button key={key} plain onPress={press}>
          <Text color={isOn ? 'success' : 'inactive'}>{isOn ? '[✓]' : '[ ]'}</Text>
          {label !== '' && <Text dimColor={!isOn}>{` ${label}`}</Text>}
        </Button>
      )
      /** 하나 고르기 칩: 고른 것은 반전 */
      const chip = (key: string, label: string, isOn: boolean, press: () => unknown) => (
        <Button key={key} plain onPress={press}>
          {isOn ? <Text inverse weight="bold">{` ${label} `}</Text> : <Text dimColor>{` ${label} `}</Text>}
        </Button>
      )
      const chips = (children: unknown[]) => (
        <Box gap={1} flexWrap="wrap">
          {children as any}
        </Box>
      )
      const input = (key: string, value: string, placeholder: string, onInput: (x: string) => unknown, onSubmit?: (x: string) => unknown) =>
        Input !== undefined ? (
          <Input key={key} value={value} placeholder={placeholder} onInput={(x: string) => void onInput(x)} onSubmit={(x: string) => void (onSubmit ?? onInput)(x)} />
        ) : (
          <Text dimColor>{value || placeholder}</Text>
        )
      const ids = allTabs.map(t => t.id)
      const COL = { name: 22, show: 8, order: 8, first: 6 }
      const tabTable = (
        <Box flexDirection="column">
          <Box>
            <Box width={COL.name} flexShrink={0}>
              <Text dimColor>탭</Text>
            </Box>
            <Box width={COL.show} flexShrink={0}>
              <Text dimColor>보이기</Text>
            </Box>
            <Box width={COL.order} flexShrink={0}>
              <Text dimColor>순서</Text>
            </Box>
            <Box width={COL.first} flexShrink={0}>
              <Text dimColor>처음</Text>
            </Box>
          </Box>
          {allTabs.map(t => {
            const hidden = pr.hidden.includes(t.id)
            const isDefault = (pr.defaultTab ?? allTabs[0]?.id) === t.id
            return (
              <Box key={`row:tab:${t.id}`}>
                <Box width={COL.name} flexShrink={0}>
                  <Text wrap="truncate-end" dimColor={hidden}>
                    {`${ic(t.icon)}${t.title}`}
                    {t.owner !== '기본' && <Text dimColor>{`  ${t.owner.replace(/^plugin /, '')}`}</Text>}
                  </Text>
                </Box>
                <Box width={COL.show} flexShrink={0}>
                  {toggle(`hide:${t.id}`, !hidden, '', () =>
                    setPrefs($, p => ({ ...p, hidden: hidden ? p.hidden.filter(x => x !== t.id) : [...p.hidden, t.id] })),
                  )}
                </Box>
                <Box width={COL.order} flexShrink={0} gap={1}>
                  <Button key={`up:${t.id}`} plain dimColor onPress={() => moveTab($, ids, t.id, -1)}>
                    ▲
                  </Button>
                  <Button key={`down:${t.id}`} plain dimColor onPress={() => moveTab($, ids, t.id, 1)}>
                    ▼
                  </Button>
                </Box>
                <Box width={COL.first} flexShrink={0}>
                  <Button key={`default:${t.id}`} plain onPress={() => setPrefs($, p => ({ ...p, defaultTab: t.id }))}>
                    <Text color={isDefault ? 'suggestion' : 'inactive'}>{isDefault ? '●' : '○'}</Text>
                  </Button>
                </Box>
                {t.def?.owner === 'project' && (
                  <Box gap={2}>
                    <Button key={`edit:${t.id}`} plain dimColor onPress={() => editTab($, t.def as ViewDef)}>
                      편집
                    </Button>
                    <Button key={`delete:${t.id}`} plain dimColor onPress={() => deleteTab($, (t.def as ViewDef).id)}>
                      삭제
                    </Button>
                  </Box>
                )}
              </Box>
            )
          })}
          {pr.order.length > 0 && (
            <Button key="order:reset" plain dimColor onPress={() => setPrefs($, p => ({ ...p, order: [] }))}>
              순서 초기화
            </Button>
          )}
        </Box>
      )
      const iconsNow = pr.icons ?? (DEFAULT_I === PLAIN ? 'plain' : 'nerd')
      const display = (
        <Box flexDirection="column" marginTop={1}>
          {field(
            '아이콘',
            chips([
              chip('pref:icons:nerd', `Nerd Font  ${NERD.spec} ${NERD.commit} ${NERD.done}`, iconsNow === 'nerd', () => setPrefs($, p => ({ ...p, icons: 'nerd' }))),
              chip('pref:icons:plain', `일반  ${PLAIN.done} ${PLAIN.check} ${PLAIN.partial}`, iconsNow === 'plain', () => setPrefs($, p => ({ ...p, icons: 'plain' }))),
            ]),
          )}
          {field(
            '보이기',
            <Box gap={2} flexWrap="wrap">
              {toggle('pref:header', pr.header, '상태 줄', () => setPrefs($, p => ({ ...p, header: !p.header })))}
              {toggle('pref:dist', pr.graphs.dist, '분포 막대', () => setPrefs($, p => ({ ...p, graphs: { ...p.graphs, dist: !p.graphs.dist } })))}
              {toggle('pref:steps', pr.graphs.steps, '단계 막대', () => setPrefs($, p => ({ ...p, graphs: { ...p.graphs, steps: !p.graphs.steps } })))}
              {toggle('pref:spark', pr.graphs.spark, '커밋 14일', () => setPrefs($, p => ({ ...p, graphs: { ...p.graphs, spark: !p.graphs.spark } })))}
            </Box>,
          )}
        </Box>
      )

      // 새 탭: 데이터 → 거르기 → 표시 → 이름. 미리보기로 바로 확인
      const SOURCES = sourceList(m)
      const rows = rowsOf(dr.data)
      const keys = scalarKeysOf(rows)
      const cats = categories(rows)
      const def = dr.source !== '' ? draftDef(m, dr, dr.editing ?? 'draft') : null
      const hasData = !dr.isLoading && dr.data !== null && dr.source !== ''
      const builder = (
        <Box flexDirection="column" gap={1}>
          {field(
            '데이터',
            <Box flexDirection="column">
              {chips(SOURCES.map(([k, label]) => chip(`draft:src:${k}`, label, dr.source === k, () => pickSource($, k))))}
              <Box>
                <Text dimColor>{'직접 '}</Text>
                {input('draft:custom', dr.custom || (SOURCES.some(([k]) => k === dr.source) ? '' : dr.source), 'status 경로 입력 후 Enter', x => setDraft($, { custom: x }), x => pickSource($, x))}
              </Box>
            </Box>,
          )}
          {dr.isLoading && field('', <Text dimColor>읽는 중…</Text>)}
          {!dr.isLoading && dr.source !== '' && dr.data === null && field('', <Text color="warning">{`${dr.source} 를 읽지 못함 (경로 확인)`}</Text>)}
          {hasData &&
            field(
              '거르기',
              cats.length === 0 ? (
                <Text dimColor>거를 값 없음</Text>
              ) : (
                <Box flexDirection="column">
                  {cats.map(([k, values]) =>
                    chips([
                      <Text dimColor>{k}</Text>,
                      chip(`draft:where:${k}:*`, `전체 ${rows.length}`, !(k in dr.where), () => toggleWhere($, k, undefined)),
                      ...values.map(([x, n]) => chip(`draft:where:${k}:${String(x)}`, `${String(x)} ${n}`, dr.where[k] === x, () => toggleWhere($, k, x))),
                    ]),
                  )}
                </Box>
              ),
            )}
          {hasData &&
            field(
              '표시',
              chips(
                ([['list', '목록'], ['table', '표'], ['progress', '진행 막대']] as const).map(([k, label]) =>
                  chip(`draft:view:${k}`, label, dr.view === k, () => setDraft($, { view: k, fields: {} })),
                ),
              ),
            )}
          {hasData &&
            keys.length > 0 &&
            (dr.view === 'table'
              ? field(
                  '열',
                  chips(keys.map(k => toggle(`draft:col:${k}`, (def?.fields.columns as string[] | undefined)?.includes(k) ?? false, k, () => toggleColumn($, k, (def?.fields.columns as string[] | undefined) ?? [])))),
                )
              : field(
                  '제목 키',
                  chips(keys.map(k => chip(`draft:titlekey:${k}`, k, def?.fields.title === k, () => setDraft($, { fields: { ...dr.fields, title: k } })))),
                ))}
          {hasData && field('이름', input('draft:title', dr.title, def?.title ?? '', x => setDraft($, { title: x })))}
          {hasData && def !== null && field('미리보기', renderView({ Box, Text }, def, dr.data, cols - 16, 5) as any)}
          {dr.error !== null && <Text color="error">{dr.error}</Text>}
          <Box gap={2}>
            {hasData && (
              <Button key="draft:save" variant="primary" onPress={() => saveDraft($)}>
                {dr.editing !== null ? '저장' : '탭 추가'}
              </Button>
            )}
            <Button key="draft:cancel" onPress={() => setDraft($, { ...DRAFT0 })}>
              취소
            </Button>
          </Box>
        </Box>
      )
      const uiSettings = (
        <Box flexDirection="column">
          {section(
            '화면',
            <Box flexDirection="column">
              {tabTable}
              {display}
            </Box>,
          )}
          {section(
            dr.editing !== null ? `탭 편집 · ${dr.editing}` : '새 탭',
            dr.isOpen ? (
              builder
            ) : (
              <Button key="draft:open" variant="primary" onPress={() => setDraft($, { ...DRAFT0, isOpen: true })}>
                + 새 탭
              </Button>
            ),
          )}
        </Box>
      )
      const s = m.setup
      const mark = (ok: boolean) => <Text color={ok ? 'success' : 'error'}>{ok ? I.ok : I.bad}</Text>
      body = (
        <Box flexDirection="column">
          {uiSettings}
          {section(
            `Plugins ${m.plugins.length}`,
            <Box flexDirection="column">
              {m.plugins.length === 0 && empty('없음 (코어만)')}
              {m.plugins.map(p => (
                <Box justifyContent="space-between">
                  <Text wrap="truncate-end">
                    <Text color="suggestion">{ic('plugin')}</Text>
                    {p.id} <Text dimColor>{`v${p.version}`}</Text>
                    {p.commands.length > 0 && <Text color="suggestion">{`  ${p.commands.join(' · ')}`}</Text>}
                  </Text>
                  <Text dimColor>{p.kind}</Text>
                </Box>
              ))}
              {s.inactive.length > 0 && <Text dimColor>{`미사용 내장: ${s.inactive.join(', ')}`}</Text>}
              {s.extraConfig.length > 0 && <Text dimColor>{`gnam.json 추가 키: ${s.extraConfig.join(', ')}`}</Text>}
            </Box>,
          )}
          {section(
            `설치 · ${s.source} · format ${s.format}`,
            <Box flexDirection="column">
              <Text>
                {mark(s.hooksOk)} {ic('hook')}commit-msg hook <Text dimColor>{s.hooksPath ?? '(hooksPath 없음)'}</Text>
              </Text>
              <Text>
                {mark(s.skills.every(k => k.ok))} {ic('link')}skill 링크 <Text dimColor>{`${s.skills.filter(k => k.ok).length}/${s.skills.length}`}</Text>
              </Text>
              {s.skills
                .filter(k => !k.ok)
                .map(k => (
                  <Text color="error">{`   ${k.dir}/${k.name}`}</Text>
                ))}
              <Text>
                {mark(s.agentsMd.exists && s.agentsMd.inSync)} {ic('md')}AGENTS.md <Text dimColor>{s.agentsMd.exists ? (s.agentsMd.inSync ? '블록 일치' : '블록 불일치') : '없음'}</Text>
              </Text>
              <Text>
                {mark(s.claudeMd.exists && s.claudeMd.importsAgents)} {ic('md')}CLAUDE.md <Text dimColor>{s.claudeMd.exists ? (s.claudeMd.importsAgents ? '@AGENTS.md' : '@AGENTS.md 없음') : '없음'}</Text>
              </Text>
              <Text>
                {mark(true)} {ic('note')}인계 메모 <Text dimColor>{s.handoff ? '있음' : '없음'}</Text>
              </Text>
            </Box>,
          )}
          {section(
            `커밋 종류 ${s.kinds.length}`,
            <Box flexDirection="column">
              {s.kinds.map(k => (
                <Box justifyContent="space-between">
                  <Text>{k.label}</Text>
                  <Text color={k.owner === 'core' ? 'inactive' : 'suggestion'}>{k.owner}</Text>
                </Box>
              ))}
            </Box>,
          )}
          {section(
            `문제 ${s.problems.length}`,
            s.problems.length === 0 ? (
              <Text color="success">문제 없음</Text>
            ) : (
              <Box flexDirection="column">
                {s.problems.map(p => (
                  <Text color="warning">{p}</Text>
                ))}
              </Box>
            ),
          )}
        </Box>
      )
    }

    return (
      <Box flexDirection="column">
        <Box key="header" borderStyle="round" borderColor="inactive" flexDirection="column" paddingX={1}>
          <Box justifyContent="space-between">
            <Text wrap="truncate-end">
              <Text weight="bold">{m.project.split('/').pop()}</Text>
              <Text dimColor>{`   ${ic('branch')}${m.branch ?? '-'}`}</Text>
            </Text>
            {headerButtons}
          </Box>
          {m.purpose !== null ? (
            <Text>
              {m.purpose}
              <Text dimColor>{`  (${m.purposeFrom})`}</Text>
            </Text>
          ) : (
            <Text dimColor>프로젝트 설명 없음 · README.md 첫 문단에 쓰면 여기 표시</Text>
          )}
          <Text dimColor wrap="truncate-end">
            {`${I.logo} gnam v${m.version} · `}
            {m.plugins.length === 0 ? 'plugin 없음 (코어 규약만)' : `plugin ${m.plugins.map(p => p.id).join(', ')}`}
          </Text>
        </Box>
        <Box flexDirection="column" paddingX={1} marginBottom={1}>
          {pr.header && (() => {
            const notStarted = m.topics.filter(t => t.status === 'not-started').length
            const partial = m.topics.filter(t => t.status === 'partial').length
            const doneN = m.topics.filter(t => t.status === 'done' && !t.isActive).length
            const rows: { key: string; ok: boolean; text: string; tab: string }[] = [
              {
                key: 'spec',
                ok: activeTopics.length === 0,
                text:
                  m.topics.length === 0
                    ? 'spec 없음'
                    : `spec ${m.topics.length}개 · 진행 중 ${partial} · 시작 전 ${notStarted} · 다음 계획 필요 ${activeTopics.length - partial - notStarted} · 끝남 ${doneN}`,
                tab: 'spec',
              },
              {
                key: 'decide',
                ok: m.decisions.length === 0,
                text: m.decisions.length === 0 ? '사람이 결정할 것 없음' : `사람이 결정할 것 ${m.decisions.length}개`,
                tab: 'decide',
              },
              ...(hasRequest
                ? [{ key: 'request', ok: openReq === 0, text: openReq === 0 ? '처리 중인 요청 없음' : `처리 중인 요청 ${openReq}개`, tab: 'request' }]
                : []),
              {
                key: 'setup',
                ok: m.setup.problems.length === 0,
                text: m.setup.problems.length === 0 ? 'gnam 설정 정상' : `gnam 설정 문제 ${m.setup.problems.length}개: ${m.setup.problems.map(p => p.replace(/^\[[^\]]+\]\s*/, '')).join(' · ')}`,
                tab: 'setup',
              },
            ]
            return rows.map(r => (
              <Button key={`stat:${r.key}:go`} plain onPress={() => setUi($, { tab: r.tab })}>
                <Text color={r.ok ? 'success' : 'warning'}>{r.ok ? `${I.ok} ` : `${I.warn} `}</Text>
                <Text dimColor={r.ok}>{r.text}</Text>
              </Button>
            ))
          })()}
          {m.setup.handoff && (
            <Text>
              <Text color="suggestion">{ic('note')}</Text>
              인계 메모 있음 <Text dimColor>(.git/gnam/handoff.md)</Text>
            </Text>
          )}
          {m.pluginLines.map(l => (
            <Text dimColor wrap="truncate-end">{`${ic('plugin')}${l}`}</Text>
          ))}
        </Box>
        <Box gap={1} flexWrap="wrap">
          {visibleTabs.map((t, i) => (
            <Button key={`tab:${t.id}`} plain hotkey={i < 9 ? String(i + 1) : undefined} onPress={() => setUi($, { tab: t.id })}>
              {tab === t.id ? (
                <Text inverse weight="bold">{` ${ic(t.icon)}${t.title} `}</Text>
              ) : (
                <Text dimColor>{` ${ic(t.icon)}${t.title} `}</Text>
              )}
            </Button>
          ))}
        </Box>
        <Text color="inactive">{'─'.repeat(cols)}</Text>
        <Box flexDirection="column" paddingX={1}>
          {body as any}
        </Box>
      </Box>
    )
  })
}
