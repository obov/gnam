// 화면. 첫 화면 = 목적 → 진행 → 지금 → 다음 → 구현된 기능, topic 펼침 = 문제 → 해결 → 이력 → 세부.
import { useEffect, useRef, useSyncExternalStore, type ReactNode } from 'react'

import { getPath, show, signals, type Commit, type Decision, type Item, type Model, type Plan, type Topic, type ViewDef } from './model.ts'
import { Box, Text, type Color, type NodeHandle, type Style } from './pixel.ts'
import { COMMIT_ROWS, REQUEST_STATUSES, VIEW_ROWS, cursorOf, filterOf, filterValues, overviewRows, requestRows, tabsOf, viewOf, viewRows, type Controller, type State } from './store.ts'
import type { Rgba, Theme } from './theme.ts'

const SANS = ['sans-serif']
const MONO = ['monospace']

// ---------- 작은 조각 ----------

type TProps = {
  children: string | number | (string | number)[]
  th: Theme
  size?: keyof Theme['size']
  color?: Color
  bold?: boolean
  mono?: boolean
  /** 한 줄 + 말줄임 (폭에 맞춰 줄바꿈 대신) */
  line?: boolean
  grow?: boolean
  /** 문단: 부모 폭에서 줄바꿈 */
  block?: boolean
  style?: Style
  id?: string
}

function T({ children, th, size = 'body', color, bold, mono, line, grow, block, style, id }: TProps) {
  const text = Array.isArray(children) ? children.join('') : String(children)
  return (
    <Text
      id={id}
      style={{
        fontSize: th.size[size],
        color: color ?? th.fg,
        fontFamily: mono ? MONO : SANS,
        ...(bold ? { fontWeight: 'bold' as const } : {}),
        ...(line ? { wrap: false, ellipsis: true } : { wrap: true }),
        ...(grow ? { flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0 } : block ? { width: '100%' as const } : { flexShrink: 0 }),
        ...style,
      }}
    >
      {text}
    </Text>
  )
}

function Chip({ th, text, fg, bg }: { th: Theme; text: string; fg: Rgba; bg: Rgba }) {
  return (
    <Box style={{ background: bg, cornerRadius: th.size.tiny, padding: { top: 1, bottom: 1, left: th.space, right: th.space }, flexShrink: 0 }}>
      <T th={th} size="tiny" color={fg} bold line>
        {text}
      </T>
    </Box>
  )
}

function Bar({ th, done, total, width, color }: { th: Theme; done: number; total: number; width: number; color: Rgba }) {
  const h = Math.max(3, Math.round(th.space * 0.6))
  const fill = total > 0 ? Math.round((width * done) / total) : 0
  return (
    <Box style={{ width, height: h, background: th.hairline, cornerRadius: h / 2, flexShrink: 0 }}>
      {fill > 0 ? <Box style={{ width: fill, height: h, background: color, cornerRadius: h / 2 }} /> : null}
    </Box>
  )
}

/** 선택이 (처음 그릴 때가 아니라) 이 행으로 옮겨 오거나 펼쳐지면 보이게 스크롤. 첫 행은 App 이 맨 위로 */
function useScrollIntoView(selected: boolean, index: number, expanded = false) {
  const ref = useRef<NodeHandle>(null)
  const mounted = useRef(false)
  useEffect(() => {
    if (mounted.current && selected && index > 0) ref.current?.scrollIntoView?.(false)
    mounted.current = true
  }, [selected, expanded])
  return ref
}

export function ago(time: number | null, now: number): string {
  if (!time) return ''
  const sec = Math.max(0, Math.round(now / 1000 - time))
  if (sec < 60) return '방금'
  if (sec < 3600) return `${Math.floor(sec / 60)}분 전`
  if (sec < 86400) return `${Math.floor(sec / 3600)}시간 전`
  if (sec < 86400 * 7) return `${Math.floor(sec / 86400)}일 전`
  const d = new Date(time * 1000)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const short = (sha: string) => sha.slice(0, 7)

/** 글자 폭 추정 (em): 한글 · CJK 0.92, 공백 0.28, 그 밖 0.52 */
const charEm = (ch: string) => (/[\u1100-\u11ff\u2e80-\ua4cf\uac00-\ud7a3\uf900-\ufaff\uff00-\uffef]/.test(ch) ? 0.92 : ch === ' ' ? 0.28 : 0.52)

/**
 * 폭 width (px) 에 fontSize 로 lines 줄을 넘을 것 같으면 잘라 '…'. width 를 모르면 (0) 그대로.
 * 줄바꿈 손실을 감안해 줄마다 95% 만 쓴다고 본다
 */
export function clampText(text: string, fontSize: number, width: number, lines: number): string {
  if (width <= 0) return text
  const budget = (width / fontSize) * 0.95 * lines
  let used = 0
  let i = 0
  for (const ch of text) {
    used += charEm(ch)
    if (used > budget) return `${[...text].slice(0, Math.max(0, i - 1)).join('').trimEnd()}…`
    i++
  }
  return text
}

function statusLook(th: Theme, status: string): { text: string; fg: Rgba; bg: Rgba } {
  switch (status) {
    case 'done':
      return { text: '끝남', fg: th.green, bg: th.greenSoft }
    case 'partial':
      return { text: '진행 중', fg: th.accent, bg: th.accentSoft }
    case 'not-started':
      return { text: '시작 전', fg: th.yellow, bg: th.yellowSoft }
    case 'superseded':
      return { text: '대체됨', fg: th.faint, bg: th.card }
    case 'none':
      return { text: 'plan 없음', fg: th.muted, bg: th.card }
    default:
      return { text: status, fg: th.muted, bg: th.card }
  }
}

function SectionHead({ th, title, count, id, note }: { th: Theme; title: string; count?: number; id: string; note?: string }) {
  return (
    <Box id={id} style={{ flexDirection: 'row', alignItems: 'center', gap: th.space, margin: { top: th.space * 3, bottom: th.space, left: 0, right: 0 } }}>
      <T th={th} size="small" color={th.muted} bold line>
        {title}
      </T>
      {count !== undefined ? <Chip th={th} text={String(count)} fg={th.muted} bg={th.card} /> : null}
      {note ? (
        <T th={th} size="tiny" color={th.faint} line grow>
          {note}
        </T>
      ) : null}
    </Box>
  )
}

// ---------- 개요 ----------

function Purpose({ th, m, width }: { th: Theme; m: Model; width: number }) {
  const p = m.purpose
  // 본문 폭 = 화면 - 좌우 여백 - 스크롤 여백
  const textWidth = width > 0 ? width - th.space * 7 - 4 : 0
  return (
    <Box style={{ flexDirection: 'column', gap: th.space * 0.75 }}>
      <SectionHead th={th} title="목적" id="section:purpose" note={p.from ?? undefined} />
      {p.tagline || p.title ? (
        <T th={th} size="lead" bold line>
          {p.tagline ?? p.title ?? ''}
        </T>
      ) : null}
      {p.text ? (
        // 두 줄까지, 넘치면 끝에 '…'
        <T th={th} color={th.muted} block id="purpose-text" style={{ maxHeight: Math.round(th.size.body * 2.4), overflow: 'hidden' }}>
          {clampText(p.text, th.size.body, textWidth, 2)}
        </T>
      ) : (
        <T th={th} color={th.faint}>
          README 첫 문단 없음
        </T>
      )}
    </Box>
  )
}

function Progress({ th, m }: { th: Theme; m: Model }) {
  const c = m.counts
  const parts = [`spec ${c.topics}개`, `진행 중 ${c.now}`, ...(c.needsPlan > 0 ? [`다음 계획 필요 ${c.needsPlan}`] : []), `시작 전 ${c.next}`, ...(c.none > 0 ? [`plan 없음 ${c.none}`] : []), `끝남 ${c.done}`]
  if (c.stepsTotal > 0) parts.push(`지금 · 다음 단계 ${c.stepsDone}/${c.stepsTotal}`)
  const seg = (n: number, color: Rgba, key: string) => (n > 0 ? <Box key={key} id={`progress-seg:${key}`} style={{ flexGrow: n, flexBasis: 0, height: th.space * 0.8, background: color, cornerRadius: th.space * 0.4 }} /> : null)
  return (
    <Box style={{ flexDirection: 'column', gap: th.space }}>
      <SectionHead th={th} title="진행" id="section:progress" />
      <T th={th} line id="progress-line">
        {parts.join(' · ')}
      </T>
      <Box id="section:progress-bar" style={{ flexDirection: 'row', gap: 3, width: '100%' }}>
        {seg(c.now, th.accent, 'now')}
        {seg(c.needsPlan, th.orange, 'needs-plan')}
        {seg(c.next, th.yellow, 'next')}
        {seg(c.none, th.hairline, 'none')}
        {seg(c.done, th.green, 'done')}
      </Box>
    </Box>
  )
}

/**
 * 사람이 할 일 · 설정 신호 (진행 줄 아래). 있는 것만 한 줄씩 (누르면 해당 탭),
 * 0 인 것은 흐린 한 줄로 접는다: '사람이 할 일 없음 · 설정 정상'
 */
function Signals({ th, m, c }: { th: Theme; m: Model; c: Controller }) {
  const g = signals(m)
  type Row = { id: string; dot: Rgba; label: string; detail: string; tab: string }
  const rows: Row[] = []
  if (g.decide > 0)
    rows.push({ id: 'decide', dot: g.blocking > 0 ? th.red : th.yellow, label: `결정할 것 ${g.decide}`, detail: [g.blocking ? `막힘 ${g.blocking}` : '', g.open ? `미결 ${g.open}` : ''].filter(Boolean).join(' · '), tab: 'decisions' })
  if (g.requests > 0) rows.push({ id: 'requests', dot: th.yellow, label: `처리 중인 요청 ${g.requests}`, detail: m.requests.filter(r => r.status !== 'refined').map(r => r.subject).join(' · '), tab: 'requests' })
  if (g.problems > 0) rows.push({ id: 'problems', dot: th.red, label: `설정 문제 ${g.problems}`, detail: m.problems.map(p => p.text).join(' · '), tab: 'settings' })
  if (g.handoff) rows.push({ id: 'handoff', dot: th.accent, label: '인계 메모 있음', detail: m.handoffPath?.replace(/^.*\/(\.git\/)/, '$1') ?? '', tab: 'settings' })
  const ok = [g.decide === 0 && g.requests === 0 ? '사람이 할 일 없음' : '', g.problems === 0 ? '설정 정상' : ''].filter(Boolean).join(' · ')
  return (
    <Box id="section:signals" style={{ flexDirection: 'column', gap: 2, margin: { top: th.space * 1.5, bottom: 0, left: 0, right: 0 } }}>
      {rows.map(r => (
        <Box
          key={r.id}
          id={`signal:${r.id}`}
          onClick={() => c.setTab(r.tab)}
          style={{ flexDirection: 'row', alignItems: 'center', gap: th.space, width: '100%', cornerRadius: th.radius * 0.6, padding: { top: 2, bottom: 2, left: 0, right: th.space }, hoverBackground: th.card, pointerShape: 'pointer' }}
        >
          <Box style={{ width: th.space, height: th.space, cornerRadius: th.space / 2, background: r.dot, flexShrink: 0 }} />
          <T th={th} size="small" bold line>
            {r.label}
          </T>
          <T th={th} size="small" color={th.muted} line grow>
            {r.detail}
          </T>
        </Box>
      ))}
      {ok ? (
        <T th={th} size="small" color={th.faint} line id="signal:ok">
          {ok}
        </T>
      ) : null}
    </Box>
  )
}

function Field({ th, label, children }: { th: Theme; label: string; children: ReactNode }) {
  return (
    <Box style={{ flexDirection: 'row', gap: th.space * 2 }}>
      <Box style={{ width: th.size.body * 4, flexShrink: 0, padding: { top: 1, bottom: 0, left: 0, right: 0 } }}>
        <T th={th} size="small" color={th.muted} bold id="field-label">
          {label}
        </T>
      </Box>
      <Box style={{ flexDirection: 'column', gap: th.space * 0.6, flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0 }}>{children}</Box>
    </Box>
  )
}

function SubHead({ th, text }: { th: Theme; text: string }) {
  return (
    <T th={th} size="tiny" color={th.faint} bold style={{ margin: { top: th.space * 0.5, bottom: 0, left: 0, right: 0 } }}>
      {text}
    </T>
  )
}

function PlanLine({ th, p, now, showTopic }: { th: Theme; p: Plan; now: number; showTopic?: boolean }) {
  const look = statusLook(th, p.status)
  const dim = p.status === 'superseded'
  const steps = p.steps.length ? `${p.steps.filter(s => s.isDone).length}/${p.steps.length}` : ''
  return (
    <Box style={{ flexDirection: 'row', alignItems: 'center', gap: th.space, width: '100%' }}>
      <T th={th} size="tiny" color={th.faint} style={{ width: th.size.tiny * 5.2 }} line>
        {ago(p.time, now)}
      </T>
      <Chip th={th} text={look.text} fg={look.fg} bg={look.bg} />
      {showTopic ? (
        <T th={th} size="small" color={th.muted} mono bold line>
          {p.topic}
        </T>
      ) : null}
      <T th={th} size="small" color={dim ? th.faint : th.fg} line grow>
        {p.title}
      </T>
      {steps ? (
        <T th={th} size="tiny" color={th.faint} mono>
          {steps}
        </T>
      ) : null}
      <T th={th} size="tiny" color={th.faint} mono>
        {short(p.sha)}
      </T>
    </Box>
  )
}

function CommitLine({ th, c, now, showTopic }: { th: Theme; c: Commit; now: number; showTopic?: boolean }) {
  return (
    <Box style={{ flexDirection: 'row', alignItems: 'center', gap: th.space, width: '100%' }}>
      <T th={th} size="tiny" color={th.faint} style={{ width: th.size.tiny * 5.2 }} line>
        {ago(c.time, now)}
      </T>
      {c.kind ? <Chip th={th} text={showTopic && c.topic ? `${c.topic} · ${c.kind}` : c.kind} fg={th.muted} bg={th.card} /> : null}
      <T th={th} size="small" line grow>
        {c.subject}
      </T>
      <T th={th} size="tiny" color={th.faint} mono>
        {short(c.sha)}
      </T>
    </Box>
  )
}

function TopicDetail({ th, t, now }: { th: Theme; t: Topic; now: number }) {
  const extra: [string, string[]][] = [
    ['막힘', t.blocking],
    ['미결', t.open.map(o => `${t.specPath}:${o.line} ${o.text}`)],
    ['미구현', t.unimplemented.map(o => `${t.specPath}:${o.line} ${o.text}`)],
  ]
  return (
    <Box style={{ flexDirection: 'column', gap: th.space * 1.6, padding: { top: th.space * 1.5, bottom: th.space * 0.5, left: 0, right: 0 } }}>
      <Field th={th} label="문제">
        {t.problem ? (
          <T th={th} block>
            {t.problem}
          </T>
        ) : (
          <T th={th} color={th.faint}>
            —
          </T>
        )}
      </Field>
      <Field th={th} label="해결">
        <T th={th} bold block>
          {t.summary ?? '(spec 첫 줄 설명 없음)'}
        </T>
        {t.detail ? (
          <T th={th} color={th.muted} block id="topic-detail">
            {t.detail}
          </T>
        ) : null}
        {t.planSummary ? (
          <T th={th} color={th.muted} block>
            {`최근 plan · ${t.planSummary}`}
          </T>
        ) : null}
        <T th={th} size="tiny" color={th.faint} mono>
          {t.specPath}
        </T>
      </Field>
      <Field th={th} label="이력">
        {t.plans.length ? (
          t.plans.map(p => <PlanLine key={p.sha} th={th} p={p} now={now} />)
        ) : (
          <T th={th} color={th.faint}>
            plan 없음
          </T>
        )}
      </Field>
      <Field th={th} label="세부">
        {t.steps.length ? <SubHead th={th} text={`단계 ${t.progress.done}/${t.progress.total}`} /> : null}
        {t.steps.map(s => (
          <Box key={`s${s.n}`} style={{ flexDirection: 'row', gap: th.space, width: '100%' }}>
            <T th={th} size="small" color={s.isDone ? th.green : th.faint} mono>
              {s.isDone ? '✓' : '○'}
            </T>
            <T th={th} size="small" color={s.isDone ? th.muted : th.fg} grow>
              {`${s.n}. ${s.title}`}
            </T>
          </Box>
        ))}
        {extra
          .filter(([, rows]) => rows.length > 0)
          .map(([label, rows]) => (
            <Box key={label} style={{ flexDirection: 'column', gap: th.space * 0.4, width: '100%' }}>
              <SubHead th={th} text={`${label} ${rows.length}`} />
              {rows.map((r, i) => (
                <T key={i} th={th} size="small" color={label === '막힘' ? th.red : th.fg} line>
                  {r}
                </T>
              ))}
            </Box>
          ))}
        <SubHead th={th} text={`커밋 ${t.commits.length}${t.chores ? ` · 정리 커밋 ${t.chores}` : ''}`} />
        {t.commits.map(c => (
          <CommitLine key={c.sha} th={th} c={c} now={now} />
        ))}
        <SubHead th={th} text={`파일 ${t.files.length}`} />
        {t.files.map(f => (
          <Box key={f.path} style={{ flexDirection: 'row', gap: th.space, width: '100%' }}>
            <T th={th} size="tiny" mono line grow>
              {f.path}
            </T>
            <T th={th} size="tiny" color={th.faint} mono>
              {`×${f.count}`}
            </T>
          </Box>
        ))}
      </Field>
    </Box>
  )
}

function TopicRow({ th, t, index, selected, expanded, nameWidth, now, onClick }: { th: Theme; t: Topic; index: number; selected: boolean; expanded: boolean; nameWidth: number; now: number; onClick: () => void }) {
  const ref = useScrollIntoView(selected, index, expanded)
  const off = !t.pluginActive
  const dot = t.status === 'none' ? th.faint : t.needsPlan ? th.orange : t.group === 'now' ? th.accent : t.group === 'next' ? th.yellow : th.green
  // 남은 일 칩: 막힘만 색 (상태), 미구현 · 미결은 개수만
  const signals: [string, Rgba, Rgba][] = [
    ...(t.blocking.length ? [[`막힘 ${t.blocking.length}`, th.red, th.redSoft] as [string, Rgba, Rgba]] : []),
    ...(t.unimplemented.length ? [[`미구현 ${t.unimplemented.length}`, th.muted, th.bg] as [string, Rgba, Rgba]] : []),
    ...(t.open.length ? [[`미결 ${t.open.length}`, th.muted, th.bg] as [string, Rgba, Rgba]] : []),
  ]
  const nameColor = off ? th.faint : th.fg
  return (
    <Box
      ref={ref}
      id={`topic:${t.name}`}
      onClick={onClick}
      style={{
        flexDirection: 'column',
        background: expanded || selected ? th.raised : th.card,
        cornerRadius: th.radius,
        border: { width: 1, color: selected ? th.accent : expanded ? th.hairline : th.card },
        padding: { top: th.space * 1.1, bottom: th.space * 1.1, left: th.space * 2, right: th.space * 2 },
        hoverBackground: th.raised,
        pointerShape: 'pointer',
      }}
    >
      <Box style={{ flexDirection: 'row', alignItems: 'center', gap: th.space * 1.5 }}>
        <Box style={{ width: th.space * 1.2, height: th.space * 1.2, cornerRadius: th.space * 0.6, background: off ? th.faint : dot, flexShrink: 0 }} />
        <T th={th} bold mono color={nameColor} style={{ width: nameWidth }} line>
          {t.name}
        </T>
        <T th={th} color={off ? th.faint : th.muted} line grow>
          {t.headline || t.summary || ''}
        </T>
        {signals.map(([text, fg, bg]) => (
          <Chip key={text} th={th} text={text} fg={fg} bg={bg} />
        ))}
        {t.needsPlan ? <Chip th={th} text="다음 계획 필요" fg={th.orange} bg={th.orangeSoft} /> : null}
        {t.status === 'none' ? <Chip th={th} text="plan 없음" fg={th.muted} bg={th.bg} /> : null}
        {off ? <Chip th={th} text="plugin 꺼짐" fg={th.faint} bg={th.bg} /> : null}
        {t.progress.total > 0 ? <Bar th={th} done={t.progress.done} total={t.progress.total} width={th.size.body * 3.5} color={off ? th.faint : dot} /> : null}
        <Box style={{ width: th.size.small * 3.4, flexShrink: 0, flexDirection: 'row', justifyContent: 'end' }}>
          <T th={th} size="small" color={th.faint} mono>
            {t.progress.total > 0 ? `${t.progress.done}/${t.progress.total}` : '—'}
          </T>
        </Box>
      </Box>
      {expanded ? <TopicDetail th={th} t={t} now={now} /> : null}
    </Box>
  )
}

function TopicSection({ th, s, c, names, title, id, start, nameWidth, now }: { th: Theme; s: State; c: Controller; names: string[]; title: string; id: string; start: number; nameWidth: number; now: number }) {
  const m = s.model!
  return (
    <Box id={id} style={{ flexDirection: 'column', gap: th.space * 0.75 }}>
      <SectionHead th={th} title={title} count={names.length} id={`${id}:head`} />
      {names.length === 0 ? (
        <T th={th} size="small" color={th.faint}>
          없음
        </T>
      ) : (
        names.map((n, i) => (
          <TopicRow
            key={n}
            th={th}
            t={m.topics[n]!}
            index={start + i}
            nameWidth={nameWidth}
            selected={s.tab === 'overview' && cursorOf(s) === start + i}
            expanded={s.expanded === n}
            now={now}
            onClick={() => c.toggle(n)}
          />
        ))
      )}
    </Box>
  )
}

function Overview({ th, s, c, now }: { th: Theme; s: State; c: Controller; now: number }) {
  const m = s.model!
  // topic 이름 열 폭: 가장 긴 이름 (monospace 약 0.6em), 18자에서 자름
  const longest = Math.min(18, Math.max(4, ...overviewRows(m).map(n => n.length)))
  const nameWidth = Math.ceil(longest * th.size.body * 0.62)
  return (
    <Box style={{ flexDirection: 'column' }}>
      <Purpose th={th} m={m} width={s.width} />
      <Progress th={th} m={m} />
      <Signals th={th} m={m} c={c} />
      <TopicSection th={th} s={s} c={c} names={m.now} title="지금" id="section:now" start={0} nameWidth={nameWidth} now={now} />
      <TopicSection th={th} s={s} c={c} names={m.next} title="다음" id="section:next" start={m.now.length} nameWidth={nameWidth} now={now} />
      <TopicSection th={th} s={s} c={c} names={m.done} title="구현된 기능" id="section:done" start={m.now.length + m.next.length} nameWidth={nameWidth} now={now} />
      {m.orphans.length ? (
        <T th={th} size="tiny" color={th.faint} block style={{ margin: { top: th.space * 2, bottom: 0, left: 0, right: 0 } }}>
          {`spec 파일 없는 topic ${m.orphans.length}개 (${m.orphans.join(', ')}) — plan 은 3 이력 탭에`}
        </T>
      ) : null}
    </Box>
  )
}

// ---------- 뒤쪽 탭 ----------

function ListRow({ th, index, selected, id, children, onClick }: { th: Theme; index: number; selected: boolean; id: string; children: ReactNode; onClick: () => void }) {
  const ref = useScrollIntoView(selected, index)
  return (
    <Box
      ref={ref}
      id={id}
      onClick={onClick}
      style={{
        flexDirection: 'column',
        gap: th.space * 0.4,
        background: selected ? th.raised : th.bg,
        border: { width: 1, color: selected ? th.accent : th.bg },
        cornerRadius: th.radius * 0.7,
        padding: { top: th.space * 0.7, bottom: th.space * 0.7, left: th.space * 1.5, right: th.space * 1.5 },
        hoverBackground: th.card,
      }}
    >
      {children}
    </Box>
  )
}

const DECISION_GROUPS: { kind: Decision['kind']; title: string }[] = [
  { kind: 'blocking', title: '막힘' },
  { kind: 'open', title: '미결' },
  { kind: 'expected', title: '정할 것 (진행 중 · 시작 전 plan)' },
  { kind: 'made', title: '내린 결정 (impl)' },
]

function Decisions({ th, s, c }: { th: Theme; s: State; c: Controller }) {
  const m = s.model!
  let index = 0
  return (
    <Box style={{ flexDirection: 'column' }}>
      {DECISION_GROUPS.map(g => {
        const rows = m.decisions.filter(d => d.kind === g.kind)
        return (
          <Box key={g.kind} id={`decisions:${g.kind}`} style={{ flexDirection: 'column', gap: 2 }}>
            <SectionHead th={th} title={g.title} count={rows.length} id={`decisions:${g.kind}:head`} />
            {rows.length === 0 ? (
              <T th={th} size="small" color={th.faint}>
                없음
              </T>
            ) : (
              rows.map(d => {
                const i = index++
                return (
                  <ListRow key={i} th={th} index={i} id={`row:decision:${i}`} selected={s.tab === 'decisions' && cursorOf(s) === i} onClick={() => c.moveTo(i)}>
                    <Box style={{ flexDirection: 'row', gap: th.space, alignItems: 'center', width: '100%' }}>
                      {d.topic ? <Chip th={th} text={d.topic} fg={g.kind === 'blocking' ? th.red : th.muted} bg={g.kind === 'blocking' ? th.redSoft : th.card} /> : null}
                      <T th={th} size="small" color={g.kind === 'blocking' ? th.red : th.fg} grow>
                        {d.text}
                      </T>
                      <T th={th} size="tiny" color={th.faint} mono>
                        {d.where}
                      </T>
                    </Box>
                  </ListRow>
                )
              })
            )}
          </Box>
        )
      })}
    </Box>
  )
}

function History({ th, s, c, now }: { th: Theme; s: State; c: Controller; now: number }) {
  const m = s.model!
  const rows = [...m.history].reverse()
  return (
    <Box style={{ flexDirection: 'column', gap: 2 }}>
      <SectionHead th={th} title="plan 이력 (최근 → 과거)" count={rows.length} id="history:head" note="Summary 우선, 없으면 커밋 제목" />
      {rows.map((p, i) => (
        <ListRow key={p.sha} th={th} index={i} id={`row:plan:${p.sha}`} selected={s.tab === 'history' && cursorOf(s) === i} onClick={() => c.moveTo(i)}>
          <PlanLine th={th} p={p} now={now} showTopic />
          {p.status === 'superseded' && p.supersededBy ? (
            <T th={th} size="tiny" color={th.faint} style={{ margin: { top: 0, bottom: 0, left: th.size.tiny * 5.2 + th.space, right: 0 } }}>
              {`→ ${short(p.supersededBy)} 가 대체`}
            </T>
          ) : null}
        </ListRow>
      ))}
    </Box>
  )
}

function Commits({ th, s, c, now }: { th: Theme; s: State; c: Controller; now: number }) {
  const m = s.model!
  const rows = m.commits.slice(0, COMMIT_ROWS)
  const rest = m.commits.length - rows.length
  return (
    <Box style={{ flexDirection: 'column', gap: 2 }}>
      <SectionHead th={th} title="최근 커밋" count={m.commits.length} id="commits:head" />
      {rows.map((cm, i) => (
        <ListRow key={cm.sha} th={th} index={i} id={`row:commit:${cm.sha}`} selected={s.tab === 'commits' && cursorOf(s) === i} onClick={() => c.moveTo(i)}>
          <CommitLine th={th} c={cm} now={now} showTopic />
        </ListRow>
      ))}
      {rest > 0 ? (
        <T th={th} size="tiny" color={th.faint}>
          {`… 이전 커밋 ${rest}개는 git log`}
        </T>
      ) : null}
    </Box>
  )
}

type Seg = { key: string; label: string; n: number; color: Rgba }

/** 분포: 누적 막대 한 줄 + 범례 (0 인 칸은 그리지 않음) */
function Dist({ th, segs, id, title }: { th: Theme; segs: Seg[]; id: string; title: string }) {
  const shown = segs.filter(x => x.n > 0)
  return (
    <Box id={id} style={{ flexDirection: 'column', gap: th.space * 0.8, margin: { top: th.space * 2, bottom: 0, left: 0, right: 0 } }}>
      <Box style={{ flexDirection: 'row', alignItems: 'center', gap: th.space * 1.5 }}>
        <T th={th} size="small" color={th.muted} bold line>
          {title}
        </T>
        {shown.map(x => (
          <Box key={x.key} style={{ flexDirection: 'row', alignItems: 'center', gap: th.space * 0.6, flexShrink: 0 }}>
            <Box style={{ width: th.space, height: th.space, cornerRadius: th.space / 2, background: x.color }} />
            <T th={th} size="small" color={th.muted} line>
              {`${x.label} ${x.n}`}
            </T>
          </Box>
        ))}
      </Box>
      <Box style={{ flexDirection: 'row', gap: 3, width: '100%', height: th.space * 0.8 }}>
        {shown.length === 0 ? <Box style={{ flexGrow: 1, height: th.space * 0.8, background: th.hairline, cornerRadius: th.space * 0.4 }} /> : null}
        {shown.map(x => (
          <Box key={x.key} id={`${id}:seg:${x.key}`} style={{ flexGrow: x.n, flexBasis: 0, height: th.space * 0.8, background: x.color, cornerRadius: th.space * 0.4 }} />
        ))}
      </Box>
    </Box>
  )
}

/** 필터 칩 한 줄: 값마다 '이름 N', 고른 것은 accent. 누르면 그 값 */
function Filter({ th, s, c, fkey, label, count, name }: { th: Theme; s: State; c: Controller; fkey: string; label: string; count: (v: string) => number; name?: (v: string) => string }) {
  const cur = filterOf(s, fkey)
  return (
    <Box id={`filter:${fkey}`} style={{ flexDirection: 'row', alignItems: 'center', gap: th.space * 0.6, overflow: 'hidden' }}>
      <T th={th} size="tiny" color={th.faint} line style={{ width: th.size.tiny * 3.2 }}>
        {label}
      </T>
      {filterValues(s, fkey).map(v => {
        const on = v === cur
        return (
          <Box
            key={v}
            id={`filter:${fkey}:${v}`}
            onClick={() => c.setFilter(fkey, v)}
            style={{ background: on ? th.accentSoft : th.bg, cornerRadius: th.size.tiny, padding: { top: 1, bottom: 1, left: th.space, right: th.space }, hoverBackground: on ? th.accentSoft : th.card, pointerShape: 'pointer', flexShrink: 0 }}
          >
            <T th={th} size="tiny" color={on ? th.accent : th.muted} bold={on} line>
              {`${v === 'all' ? '전체' : (name?.(v) ?? v)} ${count(v)}`}
            </T>
          </Box>
        )
      })}
    </Box>
  )
}

const REQUEST_LOOK = (th: Theme, status: string): [Rgba, Rgba] =>
  status === 'open' ? [th.yellow, th.yellowSoft] : status === 'started' ? [th.accent, th.accentSoft] : [th.faint, th.card]

function Requests({ th, s, c }: { th: Theme; s: State; c: Controller }) {
  const m = s.model!
  const rows = requestRows(s)
  const n = (v: string) => (v === 'all' ? m.requests.length : m.requests.filter(r => r.status === v).length)
  return (
    <Box style={{ flexDirection: 'column', gap: 2 }}>
      <Dist th={th} id="requests:dist" title="요청 상태" segs={REQUEST_STATUSES.map(v => ({ key: v, label: v, n: n(v), color: REQUEST_LOOK(th, v)[0] }))} />
      <Box style={{ margin: { top: th.space * 1.5, bottom: 0, left: 0, right: 0 } }}>
        <Filter th={th} s={s} c={c} fkey="requests" label="상태 f" count={n} />
      </Box>
      <SectionHead th={th} title="요청" count={rows.length} id="requests:head" note="request: 커밋 · 처리 상태 · 가리킨 커밋 수 (×N)" />
      {rows.length === 0 ? (
        <T th={th} size="small" color={th.faint}>
          요청 없음
        </T>
      ) : null}
      {rows.map((r, i) => {
        const [fg, bg] = REQUEST_LOOK(th, r.status)
        return (
          <ListRow key={r.sha} th={th} index={i} id={`row:request:${r.sha}`} selected={s.tab === 'requests' && cursorOf(s) === i} onClick={() => c.moveTo(i)}>
            <Box style={{ flexDirection: 'row', gap: th.space, alignItems: 'center', width: '100%' }}>
              <Chip th={th} text={r.status} fg={fg} bg={bg} />
              <T th={th} size="small" color={r.status === 'refined' ? th.muted : th.fg} line grow>
                {r.subject}
              </T>
              {r.by > 0 ? (
                <T th={th} size="tiny" color={th.faint} mono>
                  {`×${r.by}`}
                </T>
              ) : null}
              <T th={th} size="tiny" color={th.faint} mono>
                {short(r.sha)}
              </T>
            </Box>
          </ListRow>
        )
      })}
    </Box>
  )
}

// ---------- 사용자 정의 view (specs/view.md: list · table · progress) ----------

const scalarKeys = (row: unknown): string[] =>
  row !== null && typeof row === 'object' ? Object.keys(row as Record<string, unknown>).filter(k => { const v = (row as Record<string, unknown>)[k]; return v === null || typeof v !== 'object' }) : []
const firstStringKey = (row: unknown): string | undefined =>
  row !== null && typeof row === 'object' ? Object.keys(row as Record<string, unknown>).find(k => typeof (row as Record<string, unknown>)[k] === 'string') : undefined
const fieldOf = (d: ViewDef, name: string): string | undefined => (typeof d.fields[name] === 'string' ? (d.fields[name] as string) : undefined)
const num = (x: unknown): number => (Array.isArray(x) ? x.length : typeof x === 'number' ? x : typeof x === 'boolean' ? Number(x) : Number(x) || 0)
/** 글자 폭 (em 합) */
const textEm = (s: string) => [...s].reduce((a, ch) => a + charEm(ch), 0)

function ViewTab({ th, s, c, d }: { th: Theme; s: State; c: Controller; d: ViewDef }) {
  const m = s.model!
  const data = viewRows(m, d)
  const where = Object.entries(d.where).map(([k, v]) => `${k}=${String(v)}`).join(', ')
  const owner = d.owner === 'project' ? '프로젝트 (gnam.json)' : `plugin ${d.owner}`
  const head = (
    <Box style={{ flexDirection: 'column', gap: 2 }}>
      <SectionHead th={th} title={d.title} count={data?.rows.length} id="view:head" note={`${owner} · ${d.view}`} />
      <T th={th} size="tiny" color={th.faint} mono line id="view:source">
        {`${d.source}${where ? ` · ${where}` : ''}${data && data.rows.length !== data.all ? ` · 전체 ${data.all} 중` : ''}`}
      </T>
    </Box>
  )
  if (!data)
    return (
      <Box style={{ flexDirection: 'column', gap: th.space }}>
        {head}
        <T th={th} size="small" color={th.yellow} id="view:missing">
          {`데이터 없음: ${d.source} (plugin 이 꺼졌거나 경로가 바뀜)`}
        </T>
      </Box>
    )
  const rows = data.rows.slice(0, VIEW_ROWS)
  const more = data.rows.length - rows.length
  const sel = (i: number) => s.tab === `view:${d.id}` && cursorOf(s) === i
  let body: ReactNode
  if (rows.length === 0)
    body = (
      <T th={th} size="small" color={th.faint}>
        항목 없음
      </T>
    )
  else if (d.view === 'table') {
    const columns = Array.isArray(d.fields.columns) ? (d.fields.columns as string[]) : scalarKeys(rows[0]).slice(0, 4)
    // 열 폭 = 머리 · 앞 50행 값 중 가장 긴 것 (4-36 em) 비율. 넘치는 칸은 말줄임
    const weight = columns.map(col => Math.min(36, Math.max(4, textEm(col), ...rows.slice(0, 50).map(r => textEm(show(getPath(r, col)))))))
    const cells = (vals: string[], opts: { bold?: boolean; color?: Rgba }) =>
      vals.map((v, k) => (
        <Box key={k} style={{ flexGrow: weight[k]!, flexShrink: 1, flexBasis: 0, minWidth: 0 }}>
          <T th={th} size="small" color={opts.color} bold={opts.bold} line>
            {v}
          </T>
        </Box>
      ))
    body = (
      <Box id="view:table" style={{ flexDirection: 'column', gap: 2 }}>
        <Box id="view:columns" style={{ flexDirection: 'row', gap: th.space * 2, padding: { top: 0, bottom: th.space * 0.6, left: th.space * 1.5, right: th.space * 1.5 }, border: { bottom: [1, th.hairline] } }}>
          {cells(columns, { bold: true, color: th.muted })}
        </Box>
        {rows.map((r, i) => (
          <ListRow key={i} th={th} index={i} id={`row:view:${i}`} selected={sel(i)} onClick={() => c.moveTo(i)}>
            <Box style={{ flexDirection: 'row', gap: th.space * 2, width: '100%' }}>{cells(columns.map(col => show(getPath(r, col))), {})}</Box>
          </ListRow>
        ))}
      </Box>
    )
  } else if (d.view === 'progress') {
    const titleKey = fieldOf(d, 'title') ?? firstStringKey(rows[0]) ?? 'key'
    body = rows.map((r, i) => {
      const done = num(getPath(r, fieldOf(d, 'done') ?? 'done'))
      const total = Math.max(done, num(getPath(r, fieldOf(d, 'total') ?? 'total')))
      return (
        <ListRow key={i} th={th} index={i} id={`row:view:${i}`} selected={sel(i)} onClick={() => c.moveTo(i)}>
          <Box style={{ flexDirection: 'row', gap: th.space * 1.5, alignItems: 'center', width: '100%' }}>
            <T th={th} size="small" line grow>
              {show(getPath(r, titleKey))}
            </T>
            <Bar th={th} done={done} total={total} width={th.size.body * 8} color={total > 0 && done >= total ? th.green : th.accent} />
            <Box style={{ width: th.size.small * 3.4, flexShrink: 0, flexDirection: 'row', justifyContent: 'end' }}>
              <T th={th} size="small" color={th.faint} mono>
                {`${done}/${total}`}
              </T>
            </Box>
          </Box>
        </ListRow>
      )
    })
  } else {
    const titleKey = fieldOf(d, 'title') ?? firstStringKey(rows[0])
    const badgeKey = fieldOf(d, 'badge')
    const metaKey = fieldOf(d, 'meta')
    const detailKey = fieldOf(d, 'detail')
    body = rows.map((r, i) => {
      const badge = badgeKey ? show(getPath(r, badgeKey)) : ''
      const detail = detailKey ? show(getPath(r, detailKey)) : ''
      return (
        <ListRow key={i} th={th} index={i} id={`row:view:${i}`} selected={sel(i)} onClick={() => c.moveTo(i)}>
          <Box style={{ flexDirection: 'row', gap: th.space, alignItems: 'center', width: '100%' }}>
            {badge ? <Chip th={th} text={badge} fg={th.muted} bg={th.card} /> : null}
            <T th={th} size="small" line grow>
              {titleKey ? show(getPath(r, titleKey)) : show(r)}
            </T>
            {metaKey ? (
              <T th={th} size="tiny" color={th.faint} mono line>
                {show(getPath(r, metaKey))}
              </T>
            ) : null}
          </Box>
          {detail ? (
            <T th={th} size="tiny" color={th.muted} line>
              {detail}
            </T>
          ) : null}
        </ListRow>
      )
    })
  }
  return (
    <Box style={{ flexDirection: 'column', gap: 2 }}>
      {head}
      <Box style={{ flexDirection: 'column', gap: 2, margin: { top: th.space, bottom: 0, left: 0, right: 0 } }}>{body}</Box>
      {more > 0 ? (
        <T th={th} size="tiny" color={th.faint}>
          {`… 외 ${more}개`}
        </T>
      ) : null}
    </Box>
  )
}

// ---------- plugin ----------

function Plugins({ th, s, c }: { th: Theme; s: State; c: Controller }) {
  const m = s.model!
  return (
    <Box style={{ flexDirection: 'column', gap: th.space * 0.6 }}>
      <SectionHead th={th} title="켜진 plugin" count={m.plugins.length} id="plugins:head" note="gnam.json plugins · 명령은 gnam run <plugin> <명령>" />
      {m.plugins.map((p, i) => (
        <ListRow key={p.id} th={th} index={i} id={`row:plugin:${p.id}`} selected={s.tab === 'plugins' && cursorOf(s) === i} onClick={() => c.moveTo(i)}>
          <Box style={{ flexDirection: 'row', gap: th.space, alignItems: 'center', width: '100%' }}>
            <T th={th} bold mono line>
              {p.id}
            </T>
            <T th={th} size="tiny" color={th.faint} mono line>
              {`v${p.version}`}
            </T>
            <Chip th={th} text={p.kind} fg={th.muted} bg={th.card} />
            <T th={th} size="tiny" color={th.faint} line grow>
              {p.skills.length ? `skill ${p.skills.join(' · ')}` : ''}
            </T>
          </Box>
          {p.error ? (
            <T th={th} size="small" color={th.red} block>
              {p.error}
            </T>
          ) : null}
          {p.commands.map(cmd => (
            <Box key={cmd.name} style={{ flexDirection: 'row', gap: th.space * 1.5, width: '100%', padding: { top: 0, bottom: 0, left: th.space * 2, right: 0 } }}>
              <T th={th} size="small" mono line style={{ width: th.size.small * 6 }}>
                {cmd.name}
              </T>
              <T th={th} size="small" color={th.muted} line grow>
                {cmd.describe}
              </T>
            </Box>
          ))}
          {p.sections.map(sec => (
            <Box key={sec.name} style={{ flexDirection: 'column', gap: 1, width: '100%', padding: { top: th.space * 0.4, bottom: 0, left: th.space * 2, right: 0 } }}>
              <T th={th} size="tiny" color={th.faint} bold>
                {`섹션 ${sec.name}`}
              </T>
              {sec.lines.map((l, k) => (
                <T key={k} th={th} size="tiny" color={th.muted} mono line>
                  {`${k === sec.lines.length - 1 ? '└─' : '├─'} ${l}`}
                </T>
              ))}
            </Box>
          ))}
        </ListRow>
      ))}
    </Box>
  )
}

const ITEM_LABEL: Record<string, string> = { risk: '위험', remaining: '남은 일', deferred: '미룸', open: '미결', blocking: '막힘' }

function Items({ th, s, c }: { th: Theme; s: State; c: Controller }) {
  const m = s.model!
  return (
    <Box style={{ flexDirection: 'column', gap: 2 }}>
      <SectionHead th={th} title="항목 (trace.items)" count={m.items.length} id="items:head" />
      {m.items.length === 0 ? (
        <T th={th} size="small" color={th.faint}>
          없음
        </T>
      ) : null}
      {m.items.map((it: Item, i) => (
        <ListRow key={i} th={th} index={i} id={`row:item:${i}`} selected={s.tab === 'items' && cursorOf(s) === i} onClick={() => c.moveTo(i)}>
          <Box style={{ flexDirection: 'row', gap: th.space, alignItems: 'center', width: '100%' }}>
            <Chip th={th} text={ITEM_LABEL[it.kind] ?? it.kind} fg={it.kind === 'risk' ? th.yellow : th.muted} bg={it.kind === 'risk' ? th.yellowSoft : th.card} />
            <T th={th} size="small" grow>
              {it.text.replace(/\s*\n\s*/g, ' · ')}
            </T>
            <T th={th} size="tiny" color={th.faint} mono>
              {short(it.sha)}
            </T>
          </Box>
        </ListRow>
      ))}
    </Box>
  )
}

// ---------- 틀 ----------

/** 하단 키 안내 (탭 수에 따라 숫자 범위) */
export function keysHint(s: State): string {
  const n = Math.min(9, tabsOf(s.model).length)
  const tabs = `1-${n} · ←/→ 탭`
  if (s.tab === 'overview') return `j/k ↑/↓ 이동 · Enter 펼치기 · Esc 접기 · ${tabs} · r 새로고침`
  const filter = s.tab === 'requests' ? ' · f 필터' : ''
  return `j/k ↑/↓ 이동${filter} · ${tabs} · r 새로고침`
}

function Header({ th, s, c }: { th: Theme; s: State; c: Controller }) {
  const m = s.model
  const meta = [m?.branch, m?.gnamVersion ? `gnam ${m.gnamVersion}` : null].filter(Boolean).join(' · ')
  const plugins = m ? (m.plugins.length ? `plugin ${m.plugins.map(p => p.id).join(' · ')}` : 'plugin 없음 (코어 규약만)') : ''
  return (
    <Box style={{ flexDirection: 'column', gap: th.space * 1.2, padding: { top: 0, bottom: th.space * 0.5, left: 0, right: 0 } }}>
      <Box style={{ flexDirection: 'row', alignItems: 'center', gap: th.space * 1.5 }}>
        <T th={th} size="title" bold line>
          {m?.purpose.title ?? m?.project ?? 'gnam'}
        </T>
        <Box style={{ flexDirection: 'column', gap: 1, flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0 }}>
          <T th={th} size="small" color={th.faint} line>
            {meta}
          </T>
          {plugins ? (
            <T th={th} size="tiny" color={th.faint} line id="plugins-line">
              {plugins}
            </T>
          ) : null}
        </Box>
      </Box>
      <Box style={{ flexDirection: 'row', gap: th.space * 0.5, overflow: 'hidden' }}>
        {tabsOf(m).map((t, i) => {
          const on = s.tab === t.id
          return (
            <Box
              key={t.id}
              id={`tab:${t.id}`}
              onClick={() => c.setTab(t.id)}
              style={{
                background: on ? th.accentSoft : th.bg,
                cornerRadius: th.size.small,
                padding: { top: th.space * 0.5, bottom: th.space * 0.5, left: th.space * 1.4, right: th.space * 1.4 },
                hoverBackground: on ? th.accentSoft : th.card,
                pointerShape: 'pointer',
              }}
            >
              <T th={th} size="small" color={on ? th.accent : th.muted} bold={on} line>
                {i < 9 ? `${i + 1} ${t.label}` : t.label}
              </T>
            </Box>
          )
        })}
      </Box>
    </Box>
  )
}

export function App({ controller, now = Date.now }: { controller: Controller; now?: () => number }) {
  const s = useSyncExternalStore(controller.subscribe, controller.getState)
  const th = s.theme
  const t = now()
  // 탭을 바꾸거나 첫 행으로 오면 맨 위로 (목적 · 섹션 제목이 보이게)
  const scroller = useRef<NodeHandle>(null)
  const cursor = cursorOf(s)
  useEffect(() => {
    if (cursor === 0) scroller.current?.scrollTo?.(0)
  }, [s.tab, cursor])
  let body: ReactNode
  if (!s.model) {
    body = (
      <Box style={{ flexDirection: 'column', gap: th.space, padding: { top: th.space * 4, bottom: 0, left: 0, right: 0 } }}>
        <T th={th} color={s.error ? th.red : th.muted}>
          {s.error ? `읽기 실패: ${s.error}` : '읽는 중…'}
        </T>
      </Box>
    )
  } else if (s.tab === 'overview') body = <Overview th={th} s={s} c={controller} now={t} />
  else if (s.tab === 'decisions') body = <Decisions th={th} s={s} c={controller} />
  else if (s.tab === 'history') body = <History th={th} s={s} c={controller} now={t} />
  else if (s.tab === 'commits') body = <Commits th={th} s={s} c={controller} now={t} />
  else if (s.tab === 'requests') body = <Requests th={th} s={s} c={controller} />
  else if (s.tab === 'plugins') body = <Plugins th={th} s={s} c={controller} />
  else if (viewOf(s.model, s.tab)) body = <ViewTab th={th} s={s} c={controller} d={viewOf(s.model, s.tab)!} />
  else body = <Items th={th} s={s} c={controller} />

  return (
    <Box
      style={{
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        background: th.bg,
        padding: { top: th.space * 2, bottom: th.space, left: th.space * 3, right: th.space * 3 },
      }}
    >
      <Header th={th} s={s} c={controller} />
      {s.error && s.model ? (
        <T th={th} size="small" color={th.red} line id="error-line">
          {`새로고침 실패 (이전 화면 유지): ${s.error}`}
        </T>
      ) : null}
      <Box ref={scroller} style={{ flexGrow: 1, flexBasis: 0, overflow: 'scroll', flexDirection: 'column', scrollbar: { width: 4, thumbColor: th.hairline } }}>
        <Box style={{ flexDirection: 'column', padding: { top: 0, bottom: th.space * 3, left: 0, right: th.space } }}>{body}</Box>
      </Box>
      <Box style={{ flexDirection: 'row', gap: th.space, border: { top: [1, th.hairline] }, padding: { top: th.space, bottom: 0, left: 0, right: 0 } }}>
        <T th={th} size="tiny" color={th.faint} line grow id="keys">
          {keysHint(s)}
        </T>
        <T th={th} size="tiny" color={th.faint} line>
          {s.isLoading ? '읽는 중…' : s.loadedAt ? `읽음 ${ago(Math.floor(s.loadedAt / 1000), t)}` : ''}
        </T>
      </Box>
    </Box>
  )
}
