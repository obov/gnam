// 화면. 첫 화면 = 목적 → 진행 → 지금 → 다음 → 구현된 기능, topic 펼침 = 문제 → 해결 → 이력 → 세부.
import { useEffect, useRef, useSyncExternalStore, type ReactNode } from 'react'

import type { Commit, Decision, Item, Model, Plan, Topic } from './model.ts'
import { Box, Text, type Color, type NodeHandle, type Style } from './pixel.ts'
import { COMMIT_ROWS, TABS, overviewRows, type Controller, type State, type TabId } from './store.ts'
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

function Purpose({ th, m }: { th: Theme; m: Model }) {
  const p = m.purpose
  return (
    <Box style={{ flexDirection: 'column', gap: th.space * 0.75 }}>
      <SectionHead th={th} title="목적" id="section:purpose" note={p.from ?? undefined} />
      {p.tagline || p.title ? (
        <T th={th} size="lead" bold line>
          {p.tagline ?? p.title ?? ''}
        </T>
      ) : null}
      {p.text ? (
        <Box style={{ maxHeight: Math.round(th.size.body * 2.9), overflow: 'hidden' }}>
          <T th={th} color={th.muted} block>
            {p.text}
          </T>
        </Box>
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
        <SubHead th={th} text={`커밋 ${t.commits.length}`} />
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
            selected={s.tab === 'overview' && s.cursor.overview === start + i}
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
      <Purpose th={th} m={m} />
      <Progress th={th} m={m} />
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
                  <ListRow key={i} th={th} index={i} id={`row:decision:${i}`} selected={s.tab === 'decisions' && s.cursor.decisions === i} onClick={() => c.moveTo(i)}>
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
        <ListRow key={p.sha} th={th} index={i} id={`row:plan:${p.sha}`} selected={s.tab === 'history' && s.cursor.history === i} onClick={() => c.moveTo(i)}>
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
        <ListRow key={cm.sha} th={th} index={i} id={`row:commit:${cm.sha}`} selected={s.tab === 'commits' && s.cursor.commits === i} onClick={() => c.moveTo(i)}>
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
        <ListRow key={i} th={th} index={i} id={`row:item:${i}`} selected={s.tab === 'items' && s.cursor.items === i} onClick={() => c.moveTo(i)}>
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

const KEYS: Record<TabId, string> = {
  overview: 'j/k ↑/↓ 이동 · Enter 펼치기 · Esc 접기 · 1-5 탭 · r 새로고침',
  decisions: 'j/k ↑/↓ 이동 · 1-5 · ←/→ 탭 · r 새로고침',
  history: 'j/k ↑/↓ 이동 · 1-5 · ←/→ 탭 · r 새로고침',
  commits: 'j/k ↑/↓ 이동 · 1-5 · ←/→ 탭 · r 새로고침',
  items: 'j/k ↑/↓ 이동 · 1-5 · ←/→ 탭 · r 새로고침',
}

function Header({ th, s, c }: { th: Theme; s: State; c: Controller }) {
  const m = s.model
  const meta = [m?.branch, m?.gnamVersion ? `gnam ${m.gnamVersion}` : null].filter(Boolean).join(' · ')
  return (
    <Box style={{ flexDirection: 'row', alignItems: 'center', gap: th.space * 1.5, padding: { top: 0, bottom: th.space * 1.5, left: 0, right: 0 } }}>
      <T th={th} size="title" bold line>
        {m?.purpose.title ?? m?.project ?? 'gnam'}
      </T>
      <T th={th} size="small" color={th.faint} line grow>
        {meta}
      </T>
      <Box style={{ flexDirection: 'row', gap: th.space * 0.5, flexShrink: 0 }}>
        {TABS.map((t, i) => {
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
                {`${i + 1} ${t.label}`}
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
  const cursor = s.cursor[s.tab]
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
          {KEYS[s.tab]}
        </T>
        <T th={th} size="tiny" color={th.faint} line>
          {s.isLoading ? '읽는 중…' : s.loadedAt ? `읽음 ${ago(Math.floor(s.loadedAt / 1000), t)}` : ''}
        </T>
      </Box>
    </Box>
  )
}
