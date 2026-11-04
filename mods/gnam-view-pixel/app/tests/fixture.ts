// 테스트용 gnam status --json · git log · README
import { Loader, LOG_FORMAT, type ExecResult, type Files } from '../src/model.ts'

const step = (n: number, done: boolean) => ({ n, title: `단계 ${n}`, done: `완료 ${n}`, impls: done ? [`i${n}`] : [] })
const plan = (sha: string, subject: string, status: string, done: number, total: number, extra: Record<string, unknown> = {}) => ({
  sha,
  subject,
  summary: null,
  requests: [],
  supersedes: null,
  supersededBy: null,
  dropped: [],
  blocking: [],
  decisionsExpected: [],
  risks: [],
  open: [],
  steps: Array.from({ length: total }, (_, i) => step(i + 1, i < done)),
  status,
  impls: [],
  ...extra,
})

export const STATUS = {
  schema: 1,
  gnam: { version: '0.8.0', root: '/repo', source: 'package', format: 2 },
  project: '/repo',
  builtins: [
    { id: 'lore', active: false, requires: [] },
    { id: 'run', active: true, requires: [] },
  ],
  problems: [],
  handoff: { path: '/repo/.git/gnam/handoff.md', exists: false, content: null, modifiedAt: null },
  env: { branch: 'main' },
  trace: {
    head: 'h1',
    requests: [{ sha: 'r1req0000', subject: 'request: 목록을 빨리', refines: null, refinedBy: [], by: ['i2api000'], status: 'started' }],
    items: [
      { kind: 'risk', text: '토큰 만료', sha: 'aaaaaaa1' },
      { kind: 'remaining', text: '실측 남음\n두 번째 줄', sha: 'bbbbbbb2' },
      { kind: 'open', text: '보존 기간', sha: 'ccccccc3' },
    ],
    decisions: {
      blocking: [{ topic: 'api', id: 'B1', text: '인증 방식 미정', plan: 'p2api000' }],
      open: [{ path: 'specs/api.md', line: 3, text: '보존 기간' }],
    },
    topics: {
      api: {
        path: 'specs/api.md',
        exists: true,
        summary: '앱이 쓰는 외부 API',
        problem: '앱마다 API 를 따로 불러 느리다',
        unimplemented: [],
        open: [{ line: 3, text: '보존 기간' }],
        plans: [
          plan('p1api000', 'spec.api.plan: 첫 계획', 'superseded', 0, 2, { supersededBy: 'p2api000' }),
          plan('p2api000', 'spec.api.plan: 목록 한 번에', 'partial', 1, 3, {
            summary: '앱이 목록을 한 번에 받는다',
            supersedes: 'p1api000',
            decisionsExpected: ['D1. 캐시 위치', 'D2. 페이지 크기'],
          }),
        ],
        chores: [],
      },
      web: {
        path: 'specs/web.md',
        exists: true,
        summary: '웹 화면',
        problem: null,
        unimplemented: [],
        open: [],
        plans: [plan('p3web000', 'spec.web.plan: 웹 첫 화면', 'not-started', 0, 2, { decisionsExpected: ['D1. 라우터'] })],
        chores: [],
      },
      sync: {
        path: 'specs/sync.md',
        exists: true,
        summary: '기기 사이 동기화',
        problem: '기기를 바꾸면 기록이 사라진다',
        unimplemented: [],
        open: [],
        plans: [
          plan('p4sync00', 'spec.sync.plan: 동기화', 'done', 2, 2, {
            summary: '어느 기기에서든 같은 기록',
            impls: [{ sha: 'i4sync00', subject: 'spec.sync.impl: 동기화', step: '1-2', decisions: 'D1: 서버 push\nD2: 충돌은 최근 우선' }],
          }),
        ],
        chores: [],
      },
      export: {
        path: 'specs/export.md',
        exists: true,
        summary: null,
        problem: null,
        unimplemented: [{ line: 9, text: '압축 형식' }],
        open: [],
        plans: [plan('p5exp000', 'spec.export.plan: 내보내기 기본', 'done', 1, 1)],
        chores: [],
      },
      lore: {
        path: 'specs/lore.md',
        exists: true,
        summary: '노하우 기록',
        problem: null,
        unimplemented: [],
        open: [],
        plans: [plan('p6lore00', 'spec.lore.plan: lore', 'done', 3, 3, { summary: '팀 노하우를 커밋으로 남긴다' })],
        chores: [],
      },
      docs: {
        path: 'specs/docs.md',
        exists: true,
        summary: '사용 설명서',
        problem: null,
        unimplemented: [],
        open: [],
        plans: [],
        chores: [],
      },
      README: { path: 'specs/README.md', exists: true, summary: null, unimplemented: [], open: [], plans: [], chores: [] },
      gone: {
        path: 'specs/gone.md',
        exists: false,
        summary: null,
        unimplemented: [],
        open: [],
        plans: [plan('p7gone00', 'spec.gone.plan: 이름 바뀜', 'not-started', 0, 1)],
        chores: [],
      },
      '': { path: 'specs/.md', exists: false, summary: null, unimplemented: [], open: [], plans: [], chores: [{ sha: 'c0', subject: 'chore: x' }] },
    },
  },
}

/** STATUS 복사본을 고친 것 */
export function variant(fn: (s: any) => void): typeof STATUS {
  const s = JSON.parse(JSON.stringify(STATUS))
  fn(s)
  return s
}

/** problem 키가 없는 gnam (구버전) */
export function withoutProblem(): typeof STATUS {
  const s = JSON.parse(JSON.stringify(STATUS))
  for (const t of Object.values(s.trace.topics) as Record<string, unknown>[]) delete t.problem
  return s
}

const T0 = 1_700_000_000
const row = (sha: string, ago: number, subject: string, trailer: string, files: string[]) => `\x1e${sha}\x1f${T0 - ago}\x1f${subject}\x1f${trailer}\n\n${files.join('\n')}\n`

export const LOG = [
  row('i2api000', 100, 'feat(api): 목록 단계 1', 'spec.api.impl', ['src/api.ts', 'tests/api.test.ts']),
  row('p2api000', 200, 'docs(api): 목록 한 번에', 'spec.api.plan', []),
  row('p3web000', 300, 'docs(web): 웹 첫 화면', 'spec.web.plan', []),
  row('cchore01', 350, 'chore: 의존성', '', ['package.json']),
  row('i4sync00', 400, 'feat(sync): 동기화', 'spec.sync.impl', ['src/sync.ts', 'src/api.ts']),
  row('p4sync00', 500, 'docs(sync): 동기화', 'spec.sync.plan', ['specs/sync.md']),
  row('p6lore00', 600, 'spec.lore.plan: lore', '', ['specs/lore.md']),
  row('p5exp000', 700, 'docs(export): 내보내기 기본', 'spec.export.plan', []),
  row('p1api000', 800, 'docs(api): 첫 계획', 'spec.api.plan', ['specs/api.md']),
].join('')

export const NOW_MS = (T0 + 60) * 1000

export const README = `# repo — 할 일을 기록하는 저장소

여러 기기에서 쓰는 할 일 앱. 앱과 서버가 같은 기록을 본다.

\`\`\`sh
npm i
\`\`\`
`

export type FakeRepo = {
  head: string
  status: unknown
  fail: boolean
  calls: string[][]
  /** 경로 → 수정 시각 (gnam.json · specs/ 밖) */
  mtimes: Record<string, number>
}

export function fakeRepo(): { repo: FakeRepo; loader: Loader } {
  const repo: FakeRepo = { head: 'h1', status: STATUS, fail: false, calls: [], mtimes: { '/repo/README.md': 1 } }
  const exec = async (argv: string[]): Promise<ExecResult> => {
    repo.calls.push(argv)
    if (argv[0] === 'git' && argv[1] === 'rev-parse') return { code: 0, stdout: `${repo.head}\n`, stderr: '' }
    if (argv[0] === 'git' && argv[1] === 'log') {
      if (!argv.includes(LOG_FORMAT)) throw new Error('log format')
      return { code: 0, stdout: LOG, stderr: '' }
    }
    if (argv.includes('status')) {
      if (repo.fail) return { code: 1, stdout: '', stderr: 'boom: gnam.json 깨짐' }
      return { code: 0, stdout: JSON.stringify(repo.status), stderr: '' }
    }
    return { code: 127, stdout: '', stderr: 'unknown' }
  }
  const files: Files = {
    read: async p => (p === '/repo/README.md' ? README : p === '/repo/package.json' ? '{"name":"repo"}' : null),
    mtime: async p => (p === '/repo/gnam.json' || p.startsWith('/repo/specs/') ? 1 : (repo.mtimes[p] ?? null)),
    list: async d => (d === '/repo/specs' ? ['api.md', 'web.md', 'sync.md', 'export.md', 'lore.md', 'docs.md', 'README.md'] : null),
  }
  return { repo, loader: new Loader('/repo', exec, files) }
}
