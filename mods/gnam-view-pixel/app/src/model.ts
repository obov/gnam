// gnam status --json · README · git log → 화면 모델.
// 화면 순서 (사람의 질문 순서): 목적 → 진행 요약 → 지금 → 다음 → 구현된 기능.
// topic 펼침: 문제 → 해결 → 이력 → 세부.

export type Group = 'now' | 'next' | 'done'
export type PlanStatus = 'done' | 'partial' | 'not-started' | 'superseded' | string

export type Step = { n: number; title: string; isDone: boolean; doneWhen: string | null }

export type Plan = {
  sha: string
  topic: string
  /** 사람용 제목: Summary, 없으면 커밋 제목 (Goal 아님) */
  title: string
  /** trailer Summary: (없으면 null) */
  summary: string | null
  /** 커밋 제목 (접두 뺀 것) */
  subject: string
  status: PlanStatus
  /** 커밋 시각 (unix 초), git log 범위 밖이면 null */
  time: number | null
  steps: Step[]
  supersededBy: string | null
  supersedes: string | null
  /** impl 커밋 본문의 Decisions 줄 */
  decisions: string[]
  /** plan 의 Decisions expected (아직 impl 이 답하지 않았을 수 있음) */
  expected: string[]
  open: string[]
  blocking: string[]
}

export type Commit = {
  sha: string
  subject: string
  time: number
  /** Gnam trailer (format 2) 또는 제목 접두 (format 1) 의 topic */
  topic: string | null
  /** plan · impl · chore · merge · run.start … (spec 무관이면 null) */
  kind: string | null
  files: string[]
}

export type Line = { line: number; text: string }

export type Topic = {
  name: string
  specPath: string
  exists: boolean
  group: Group
  /** 사람이 겪는 문제 (status trace.topics.<t>.problem, gnam 구버전 · 줄 없음이면 null) */
  problem: string | null
  /** spec 첫 줄 설명 (해결하는 기능) */
  summary: string | null
  /** 최근 (대체 안 된) plan 의 Summary */
  planSummary: string | null
  /** 목록 한 줄: planSummary → summary → 최근 plan 제목 */
  headline: string
  status: PlanStatus | 'none'
  /** 오래된 것 → 최근 */
  plans: Plan[]
  /** 최근 plan 의 단계 */
  steps: Step[]
  progress: { done: number; total: number }
  commits: Commit[]
  /** topic 커밋들이 바꾼 파일 (많이 바뀐 순) */
  files: { path: string; count: number }[]
  /** topic 이름이 builtin plugin 이면 그 활성 여부, plugin 기능이 아니면 true */
  pluginActive: boolean
  plugin: string | null
  open: Line[]
  unimplemented: Line[]
  blocking: string[]
  /** 마지막 커밋 시각 */
  lastTime: number | null
}

export type Decision = { kind: 'blocking' | 'open' | 'made' | 'expected'; topic: string | null; where: string; text: string }
export type Item = { kind: string; text: string; sha: string }

export type Purpose = { title: string | null; tagline: string | null; text: string | null; from: string | null }

export type Model = {
  project: string
  branch: string | null
  head: string | null
  gnamVersion: string | null
  purpose: Purpose
  /** next = 시작 전 plan, none = plan 없음 (둘 다 '다음' 묶음) */
  counts: { topics: number; now: number; next: number; none: number; done: number; stepsDone: number; stepsTotal: number; plans: number; commits: number }
  now: string[]
  next: string[]
  done: string[]
  /** spec 파일이 없어진 topic (이름 변경 등). 이력 탭에 plan 이 남는다 */
  orphans: string[]
  topics: Record<string, Topic>
  decisions: Decision[]
  /** 모든 plan, 시간순 (오래된 것 → 최근) */
  history: Plan[]
  /** 최근 커밋 → 오래된 것 */
  commits: Commit[]
  items: Item[]
  problems: string[]
  /** 인계 메모 파일 경로 (변경 감지용, status handoff.path) */
  handoffPath: string | null
}

type Json = Record<string, any>

const arr = (v: unknown): Json[] => (Array.isArray(v) ? (v as Json[]) : [])
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])
const lines = (v: unknown): Line[] => arr(v).map(x => ({ line: Number(x.line ?? 0), text: String(x.text ?? '') }))

/** `spec.view.plan: 제목` · `docs(view): 제목` → `제목` */
export function stripPrefix(subject: string): string {
  return subject.replace(/^[A-Za-z0-9_.-]+(\([^)]*\))?!?:\s*/, '')
}

/** trailer `Gnam: spec.view.impl` 또는 format 1 제목 접두 → topic · kind */
export function gnamKind(subject: string, trailer: string | null): { topic: string | null; kind: string | null } {
  const raw = trailer?.split(',')[0]?.trim() || (/^((?:spec|run|multirun)\.[A-Za-z0-9_-]+\.[a-z-]+):/.exec(subject)?.[1] ?? null)
  if (!raw) return { topic: null, kind: null }
  const m = /^(spec|run|multirun)\.([A-Za-z0-9_-]+)\.([a-z-]+)$/.exec(raw)
  if (!m) return { topic: null, kind: null }
  return { topic: m[2]!, kind: m[1] === 'spec' ? m[3]! : `${m[1]}.${m[3]}` }
}

/**
 * `git log --format=%x1e%H%x1f%ct%x1f%s%x1f%(trailers:key=Gnam,valueonly,separator=%x2C) --name-only`
 * 의 출력 → 커밋 목록 (최근 → 오래된 것)
 */
export function parseLog(text: string): Commit[] {
  const out: Commit[] = []
  for (const chunk of text.split('\x1e')) {
    if (!chunk.trim()) continue
    const [head, ...rest] = chunk.split('\n')
    const [sha, ct, subject, trailer] = (head ?? '').split('\x1f')
    if (!sha || !subject) continue
    const { topic, kind } = gnamKind(subject, str(trailer))
    out.push({ sha, subject, time: Number(ct) || 0, topic, kind, files: rest.map(l => l.trim()).filter(Boolean) })
  }
  return out
}

/** README: 첫 `# 제목 — 설명` 과 그 뒤 첫 문단 */
export function parsePurpose(readme: string | null, from: string): Purpose {
  if (!readme) return { title: null, tagline: null, text: null, from: null }
  const rows = readme.split('\n')
  let title: string | null = null
  let tagline: string | null = null
  let i = 0
  for (; i < rows.length; i++) {
    const m = /^#\s+(.+)$/.exec(rows[i]!)
    if (m) {
      const [t, ...tag] = m[1]!.split(/\s+[—–-]\s+/)
      title = t!.trim()
      tagline = tag.length ? tag.join(' — ').trim() : null
      i++
      break
    }
  }
  if (title === null) i = 0
  const para: string[] = []
  let inFence = false
  for (; i < rows.length; i++) {
    const row = rows[i]!.trim()
    if (row.startsWith('```')) {
      if (para.length) break
      inFence = !inFence
      continue
    }
    if (inFence) continue
    if (row === '') {
      if (para.length) break
      continue
    }
    if (/^(#|\[!\[|!\[|<|\||>|-{3,})/.test(row)) {
      if (para.length) break
      continue
    }
    para.push(row)
  }
  const text = para.join(' ').replace(/\*\*|__|`/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').trim() || null
  return { title, tagline, text, from }
}

const DECISION_LINE = /^\s*[-*]?\s*(D\d+\s*[:.].*)$/

function decisionLines(text: unknown): string[] {
  if (typeof text !== 'string') return []
  return text.split('\n').map(l => DECISION_LINE.exec(l)?.[1]?.trim()).filter((x): x is string => !!x)
}

function toPlan(topic: string, p: Json, times: Map<string, number>): Plan {
  const subject = stripPrefix(String(p.subject ?? ''))
  const summary = str(p.summary)
  const steps = arr(p.steps).map(s => ({ n: Number(s.n), title: String(s.title ?? ''), isDone: arr(s.impls).length > 0 || strs(s.impls).length > 0, doneWhen: str(s.done) }))
  const decisions = arr(p.impls).flatMap(i => decisionLines(i.decisions))
  return {
    sha: String(p.sha ?? ''),
    topic,
    title: summary ?? subject,
    summary,
    subject,
    status: String(p.status ?? 'not-started'),
    time: times.get(String(p.sha)) ?? null,
    steps,
    supersededBy: str(p.supersededBy),
    supersedes: str(p.supersedes),
    decisions,
    expected: strs(p.decisionsExpected),
    open: strs(p.open),
    blocking: strs(p.blocking),
  }
}

const GROUP_OF: Record<string, Group> = { partial: 'now', 'not-started': 'next', none: 'next', done: 'done' }

export type Raw = {
  cwd: string
  status: Json
  readme: string | null
  readmePath: string
  log: string
}

export function buildModel(raw: Raw): Model {
  const s = raw.status
  const trace: Json = s.trace ?? {}
  const commits = parseLog(raw.log)
  const times = new Map(commits.map(c => [c.sha, c.time]))
  const builtins = new Map(arr(s.builtins).map(b => [String(b.id), b.active !== false]))
  const blockingAll = arr(trace.decisions?.blocking)

  const topics: Record<string, Topic> = {}
  const orphans: string[] = []
  for (const [name, t] of Object.entries((trace.topics ?? {}) as Record<string, Json>)) {
    // '' = spec 없는 chore 묶음, readme = specs/README.md (spec 아님)
    if (name === '' || name.toLowerCase() === 'readme') continue
    const plans = arr(t.plans).map(p => toPlan(name, p, times))
    const live = [...plans].reverse().find(p => p.status !== 'superseded') ?? null
    const status = live?.status ?? 'none'
    const mine = commits.filter(c => c.topic === name)
    const fileCount = new Map<string, number>()
    for (const c of mine) for (const f of c.files) fileCount.set(f, (fileCount.get(f) ?? 0) + 1)
    const files = [...fileCount].map(([path, count]) => ({ path, count })).sort((a, b) => b.count - a.count || a.path.localeCompare(b.path))
    const steps = live?.steps ?? []
    const summary = str(t.summary)
    const planSummary = live?.summary ?? null
    const exists = t.exists !== false
    const plugin = builtins.has(name) ? name : null
    topics[name] = {
      name,
      specPath: String(t.path ?? `specs/${name}.md`),
      exists,
      group: GROUP_OF[status] ?? 'next',
      problem: 'problem' in t ? str(t.problem) : null,
      summary,
      planSummary,
      headline: planSummary ?? summary ?? live?.title ?? '',
      status,
      plans,
      steps,
      progress: { done: steps.filter(x => x.isDone).length, total: steps.length },
      commits: mine,
      files,
      pluginActive: plugin ? builtins.get(plugin) === true : true,
      plugin,
      open: lines(t.open),
      unimplemented: lines(t.unimplemented),
      blocking: blockingAll.filter(b => b.topic === name).map(b => `${b.id ? `${b.id}. ` : ''}${String(b.text ?? '')}`),
      lastTime: Math.max(0, ...mine.map(c => c.time), ...plans.map(p => p.time ?? 0)) || null,
    }
    if (!exists) orphans.push(name)
  }

  const live = Object.values(topics).filter(t => t.exists)
  const recent = (a: Topic, b: Topic) => (b.lastTime ?? 0) - (a.lastTime ?? 0) || a.name.localeCompare(b.name)
  const now = live.filter(t => t.group === 'now').sort(recent).map(t => t.name)
  const next = live.filter(t => t.group === 'next').sort(recent).map(t => t.name)
  const done = live.filter(t => t.group === 'done').sort(recent).map(t => t.name)

  const history = Object.values(topics)
    .flatMap(t => t.plans)
    .sort((a, b) => (a.time ?? 0) - (b.time ?? 0) || a.topic.localeCompare(b.topic))

  const decisions: Decision[] = []
  // trace.decisions.blocking = { topic, plan, id, text } (plan = plan 커밋 sha)
  for (const b of blockingAll) decisions.push({ kind: 'blocking', topic: str(b.topic), where: str(b.plan)?.slice(0, 7) ?? str(b.topic) ?? '', text: `${b.id ? `${b.id}. ` : ''}${String(b.text ?? '')}` })
  for (const o of arr(trace.decisions?.open)) decisions.push({ kind: 'open', topic: null, where: `${o.path ?? ''}${o.line ? `:${o.line}` : ''}`, text: String(o.text ?? '') })
  // 진행 중 · 시작 전 plan 이 아직 정할 것 (Decisions expected)
  for (const name of [...now, ...next]) {
    const p = [...topics[name]!.plans].reverse().find(x => x.status !== 'superseded')
    for (const d of p?.expected ?? []) decisions.push({ kind: 'expected', topic: name, where: p!.sha.slice(0, 7), text: d })
  }
  for (const p of [...history].reverse()) {
    for (const d of p.decisions) decisions.push({ kind: 'made', topic: p.topic, where: p.sha.slice(0, 7), text: d })
  }

  // trace.items 는 오래된 것 → 최근. 화면은 최근 순
  const items = arr(trace.items)
    .map(i => ({ kind: String(i.kind ?? 'item'), text: String(i.text ?? ''), sha: String(i.sha ?? '') }))
    .reverse()
  const stepsLive = [...now, ...next].map(n => topics[n]!.progress)

  return {
    project: (typeof s.project === 'string' ? s.project : raw.cwd).split('/').filter(Boolean).at(-1) ?? raw.cwd,
    branch: str(s.env?.branch),
    head: str(trace.head),
    gnamVersion: str(s.gnam?.version),
    purpose: parsePurpose(raw.readme, raw.readmePath),
    counts: {
      topics: live.length,
      now: now.length,
      next: next.filter(n => topics[n]!.status !== 'none').length,
      none: next.filter(n => topics[n]!.status === 'none').length,
      done: done.length,
      stepsDone: stepsLive.reduce((n, p) => n + p.done, 0),
      stepsTotal: stepsLive.reduce((n, p) => n + p.total, 0),
      plans: history.length,
      commits: commits.length,
    },
    now,
    next,
    done,
    orphans,
    topics,
    decisions,
    history,
    commits,
    items,
    problems: arr(s.problems).map(p => (typeof p === 'string' ? p : String(p.message ?? JSON.stringify(p)))),
    handoffPath: str(s.handoff?.path),
  }
}

// ---------- 읽기 ----------

export type ExecResult = { code: number; stdout: string; stderr: string }
export type Exec = (argv: string[], cwd: string) => Promise<ExecResult>
export type Files = {
  read(path: string): Promise<string | null>
  /** 수정 시각 (없으면 null) */
  mtime(path: string): Promise<number | null>
  /** 디렉터리 항목 이름 (없으면 null) */
  list(dir: string): Promise<string[] | null>
}

export const LOG_FORMAT = '--format=%x1e%H%x1f%ct%x1f%s%x1f%(trailers:key=Gnam,valueonly,separator=%x2C)'
const LOG_LIMIT = 2000

/**
 * 저장소 읽기. HEAD · gnam.json · specs/ 가 그대로면 다시 읽지 않는다.
 * statusCalls 는 테스트가 gnam status 호출 수를 센다.
 */
export class Loader {
  statusCalls = 0
  private last: string | null = null
  private gnamCmd: string[] | null = null

  constructor(
    readonly cwd: string,
    private readonly exec: Exec,
    private readonly files: Files,
  ) {}

  /** 인계 메모 경로 (마지막 status 의 handoff.path). 첫 읽기 전에는 모른다 (첫 읽기는 늘 읽음) */
  private handoffPath: string | null = null

  /** HEAD · gnam.json · README · 인계 메모 · specs/*.md 수정 시각 */
  async signature(): Promise<string> {
    const head = await this.exec(['git', 'rev-parse', 'HEAD'], this.cwd).catch(() => null)
    const parts = [head?.code === 0 ? head.stdout.trim() : 'no-head', String(await this.files.mtime(`${this.cwd}/gnam.json`))]
    for (const f of [`${this.cwd}/README.md`, `${this.cwd}/readme.md`, this.handoffPath]) if (f) parts.push(String(await this.files.mtime(f)))
    const specs = (await this.files.list(`${this.cwd}/specs`)) ?? []
    for (const f of specs.filter(f => f.endsWith('.md')).sort()) parts.push(`${f}@${await this.files.mtime(`${this.cwd}/specs/${f}`)}`)
    return parts.join('|')
  }

  private async gnam(): Promise<string[]> {
    if (this.gnamCmd) return this.gnamCmd
    const local = `${this.cwd}/node_modules/.bin/gnam`
    if ((await this.files.mtime(local)) !== null) return (this.gnamCmd = [local])
    const checkout = `${this.cwd}/bin/gnam.js`
    if ((await this.files.mtime(checkout)) !== null) {
      try {
        const pkg = JSON.parse((await this.files.read(`${this.cwd}/package.json`)) ?? '{}')
        if (pkg.name === '@obov/gnam') return (this.gnamCmd = ['node', checkout])
      } catch {}
    }
    return (this.gnamCmd = ['npx', '--no-install', 'gnam'])
  }

  /** 바뀌었으면 { model }, 그대로면 null. 실패는 throw */
  async load(force = false): Promise<Model | null> {
    const sig = await this.signature()
    if (!force && sig === this.last) return null
    this.statusCalls++
    const st = await this.exec([...(await this.gnam()), 'status', '--json'], this.cwd)
    let status: Json
    try {
      status = JSON.parse(st.stdout)
    } catch {
      throw new Error(`gnam status --json 실패${st.stderr.trim() ? `: ${st.stderr.trim().split('\n').at(-1)}` : ` (exit ${st.code})`}`)
    }
    if (typeof status !== 'object' || status === null || !status.trace) throw new Error('gnam status --json 에 trace 없음 (gnam 0.4 이상 필요)')
    const log = await this.exec(['git', 'log', `-n${LOG_LIMIT}`, LOG_FORMAT, '--name-only'], this.cwd).catch(() => ({ code: 1, stdout: '', stderr: '' }))
    let readmePath = 'README.md'
    let readme = await this.files.read(`${this.cwd}/README.md`)
    if (readme === null) {
      readmePath = 'readme.md'
      readme = await this.files.read(`${this.cwd}/readme.md`)
    }
    const model = buildModel({ cwd: this.cwd, status, readme, readmePath, log: log.code === 0 ? log.stdout : '' })
    this.handoffPath = model.handoffPath
    // 인계 메모 경로를 이제 알았으면 그 수정 시각까지 넣은 서명으로 기억 (다음 비교가 같은 모양)
    this.last = model.handoffPath ? await this.signature() : sig
    return model
  }
}
