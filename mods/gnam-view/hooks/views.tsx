/**
 * gnam status views 의 탭 정의 (list · table · progress) 를 그린다. 데이터 모양과 무관한 기본 화면.
 * Box · Text 는 그리는 쪽이 $.ui.resolve(e) 로 받은 것을 넘긴다.
 */
import type { ViewDef } from '../types'

type Json = Record<string, unknown>
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Els = { Box: any; Text: any }

/** 점 경로 (숫자 = 배열 인덱스). 없으면 undefined */
export function getPath(value: unknown, path: string): unknown {
  let current: unknown = value
  for (const key of path.split('.').filter(Boolean)) {
    if (current === null || typeof current !== 'object') return undefined
    current = (current as Json)[key]
  }
  return current
}

/** 원소 목록: 배열은 그대로, 객체는 { key, ...값 } (값이 스칼라면 { key, value }) */
export function rowsOf(data: unknown): unknown[] {
  if (Array.isArray(data)) return data
  if (data !== null && typeof data === 'object')
    return Object.entries(data as Json).map(([key, v]) =>
      v !== null && typeof v === 'object' && !Array.isArray(v) ? { key, ...(v as Json) } : { key, value: v },
    )
  return []
}

/** gnam status --where 와 같은 비교: JSON 스칼라의 문자열 표현 */
export function applyWhere(rows: unknown[], where: ViewDef['where']): unknown[] {
  const entries = Object.entries(where)
  if (entries.length === 0) return rows
  return rows.filter(row => entries.every(([k, v]) => String(getPath(row, k) ?? null) === String(v)))
}

/** 값 한 줄 */
export function show(x: unknown): string {
  if (x === null || x === undefined) return ''
  if (typeof x !== 'object') return String(x).split('\n')[0] ?? ''
  if (Array.isArray(x)) return `${x.length}개`
  const o = x as Json
  const head = ['title', 'subject', 'summary', 'text', 'name', 'id', 'file', 'key'].find(k => typeof o[k] === 'string')
  return head ? String(o[head]) : `{${Object.keys(o).length}}`
}

const firstStringKey = (row: unknown) =>
  row !== null && typeof row === 'object' ? Object.keys(row as Json).find(k => typeof (row as Json)[k] === 'string') : undefined

const scalarKeys = (row: unknown) =>
  row !== null && typeof row === 'object'
    ? Object.keys(row as Json).filter(k => { const v = (row as Json)[k]; return v === null || typeof v !== 'object' })
    : []

const field = (def: ViewDef, name: string): string | undefined => {
  const f = def.fields[name]
  return typeof f === 'string' ? f : undefined
}

const num = (x: unknown): number => (Array.isArray(x) ? x.length : typeof x === 'number' ? x : typeof x === 'boolean' ? Number(x) : Number(x) || 0)

const width = (s: string) => [...s].reduce((a, c) => a + (/[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]/.test(c) ? 2 : 1), 0)
const pad = (s: string, w: number) => {
  let out = ''
  for (const c of s) {
    if (width(out + c) > w - (width(s) > w ? 1 : 0)) return `${out}…`.padEnd(w)
    out += c
  }
  return out + ' '.repeat(Math.max(0, w - width(out)))
}

const MAX = 80

/** 탭 본문. data === undefined 면 source 를 못 읽은 것 */
export function renderView(els: Els, def: ViewDef, data: unknown, cols: number, max = MAX): unknown {
  const MAXR = max
  const { Box, Text } = els
  if (data === undefined)
    return <Text color="warning">{`데이터 없음: ${def.source} (plugin 이 꺼졌거나 경로가 바뀜)`}</Text>
  const all = rowsOf(data)
  const rows = applyWhere(all, def.where)
  const header = (
    <Text dimColor wrap="truncate-end">
      {`${rows.length}개${rows.length !== all.length ? ` / 전체 ${all.length}` : ''} · ${def.source}${Object.keys(def.where).length > 0 ? ` · ${Object.entries(def.where).map(([k, v]) => `${k}=${v}`).join(', ')}` : ''}`}
    </Text>
  )
  if (rows.length === 0)
    return (
      <Box flexDirection="column">
        {header}
        <Text dimColor>  항목 없음</Text>
      </Box>
    )

  if (def.view === 'table') {
    const columns = Array.isArray(def.fields['columns']) ? (def.fields['columns'] as string[]) : scalarKeys(rows[0]).slice(0, 4)
    const w = Math.max(6, Math.floor((cols - 2 - (columns.length - 1) * 2) / Math.max(1, columns.length)))
    const widths = columns.map(c => Math.min(w, Math.max(width(c), ...rows.slice(0, MAXR).map(r => width(show(getPath(r, c)))))))
    return (
      <Box flexDirection="column">
        {header}
        <Text weight="bold">{columns.map((c, k) => pad(c, widths[k] ?? w)).join('  ')}</Text>
        <Text color="inactive">{widths.map(x => '─'.repeat(x)).join('  ')}</Text>
        {rows.slice(0, MAXR).map(r => (
          <Text wrap="truncate-end">{columns.map((c, k) => pad(show(getPath(r, c)), widths[k] ?? w)).join('  ')}</Text>
        ))}
      </Box>
    )
  }

  if (def.view === 'progress') {
    const titleKey = field(def, 'title') ?? firstStringKey(rows[0]) ?? 'key'
    const barW = Math.max(8, Math.min(30, cols - 40))
    return (
      <Box flexDirection="column">
        {header}
        {rows.slice(0, MAXR).map(r => {
          const done = num(getPath(r, field(def, 'done') ?? 'done'))
          const total = Math.max(done, num(getPath(r, field(def, 'total') ?? 'total')))
          const fill = total === 0 ? 0 : Math.round((done / total) * barW)
          return (
            <Box justifyContent="space-between">
              <Text wrap="truncate-end">{show(getPath(r, titleKey))}</Text>
              <Text>
                <Text color={total > 0 && done >= total ? 'success' : 'claude'}>{'━'.repeat(fill)}</Text>
                <Text color="inactive">{'━'.repeat(barW - fill)}</Text>
                <Text dimColor>{`  ${done}/${total}`}</Text>
              </Text>
            </Box>
          )
        })}
      </Box>
    )
  }

  const titleKey = field(def, 'title') ?? firstStringKey(rows[0])
  const badgeKey = field(def, 'badge')
  const metaKey = field(def, 'meta')
  const detailKey = field(def, 'detail')
  return (
    <Box flexDirection="column">
      {header}
      {rows.slice(0, MAXR).map(r => {
        const badge = badgeKey ? show(getPath(r, badgeKey)) : ''
        return (
          <Box flexDirection="column">
            <Text wrap="truncate-end">
              {badge !== '' && <Text color="suggestion" weight="bold">{`${badge}  `}</Text>}
              {titleKey ? show(getPath(r, titleKey)) : show(r)}
              {metaKey && <Text dimColor>{`  ${show(getPath(r, metaKey))}`}</Text>}
            </Text>
            {detailKey && show(getPath(r, detailKey)) !== '' && (
              <Text dimColor wrap="truncate-end">{`  ${show(getPath(r, detailKey))}`}</Text>
            )}
          </Box>
        )
      })}
      {rows.length > MAXR && <Text dimColor>{`… 외 ${rows.length - MAXR}개`}</Text>}
    </Box>
  )
}
