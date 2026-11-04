// herdr 분할 pane 모드: Claude Code pane 의 Image 를 그리지 못하는 herdr 안에서
// pixel 앱을 옆 pane 에 직접 실행한다 (PIXEL_EMBED 없음 · bridge 없음). 앱은 스스로 주기 갱신한다.
// herdr CLI 문법은 `herdr --skill` · `herdr pane` 이 권위.
import type { EngineInterface } from 'claude-code'

export type Herdr = {
  /** herdr 실행 파일 (HERDR_BIN_PATH, 없으면 PATH 의 herdr) */
  bin: string
  /** Claude Code 가 있는 pane (HERDR_PANE_ID). --current 대신 이 id 를 명시한다 */
  caller: string
}

export type SplitOptions = { cwd: string; theme: string; direction: 'right' | 'down' }

/** herdr 안이면 { bin, caller }, 아니면 null. HERDR_ENV=1 과 HERDR_PANE_ID 둘 다 있어야 한다 */
export async function herdrContext($: EngineInterface): Promise<Herdr | null> {
  try {
    if ((await $.env.get('HERDR_ENV')) !== '1') return null
    const caller = await $.env.get('HERDR_PANE_ID')
    if (!caller) return null
    return { bin: (await $.env.get('HERDR_BIN_PATH')) || 'herdr', caller }
  } catch {
    // 환경 변수를 읽을 수 없는 host: pane 안에 그리는 기존 경로
    return null
  }
}

type Ran = { ok: true; result: Record<string, unknown> } | { ok: false; error: string }

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

/** herdr 명령 하나. JSON 출력의 result (또는 error.message) */
export async function herdrRun($: EngineInterface, h: Herdr, args: string[]): Promise<Ran> {
  try {
    const r = await $.process.run([h.bin, ...args], { timeoutMs: 10_000 })
    let parsed: unknown = null
    try {
      parsed = JSON.parse(r.stdout.trim() || r.stderr.trim() || 'null')
    } catch {}
    if (r.exitCode === 0) return { ok: true, result: isRecord(parsed) && isRecord(parsed.result) ? parsed.result : {} }
    const msg = isRecord(parsed) && isRecord(parsed.error) && typeof parsed.error.message === 'string' ? parsed.error.message : (r.stderr || r.stdout).trim()
    return { ok: false, error: msg || `herdr ${args[0]} ${args[1]} 실패 (exit ${r.exitCode})` }
  } catch (error) {
    return { ok: false, error: `herdr 실행 실패: ${String(error)}` }
  }
}

/** 셸 한 단어로 (작은따옴표) */
export const shellQuote = (s: string) => `'${s.replaceAll("'", `'\\''`)}'`

/** 설치 확인: node bridge.cjs check → { pixel, entry } 또는 오류 문장 */
async function checkInstall($: EngineInterface): Promise<{ pixel: string; entry: string } | { error: string }> {
  try {
    const r = await $.process.run(['node', `${$.plugin.root}/app/dist/bridge.cjs`, 'check'], { timeoutMs: 10_000 })
    const line = r.stdout.split('\n').find(t => t.startsWith('{'))
    const parsed: unknown = line ? JSON.parse(line) : null
    if (isRecord(parsed) && typeof parsed.pixel === 'string' && typeof parsed.entry === 'string') return { pixel: parsed.pixel, entry: parsed.entry }
    if (isRecord(parsed) && typeof parsed.error === 'string') return { error: parsed.error }
    return { error: r.stderr.trim() || `설치 확인 실패 (exit ${r.exitCode}) — /gnam-pixel setup` }
  } catch (error) {
    return { error: `설치 확인 실패: ${String(error)} — /gnam-pixel setup` }
  }
}

/** pane 에서 실행할 명령: 앱이 정상 종료하면 pane 의 셸도 닫는다 (실패면 오류가 남도록 셸 유지) */
export function appCommand(pixel: string, entry: string): string {
  return `${shellQuote(pixel)} ${shellQuote(entry)} && exit`
}

export type Opened = { ok: true; pane: string; text: string } | { ok: false; text: string }

/** 새 분할 pane 을 만들고 앱을 실행한다 */
export async function openSplit($: EngineInterface, h: Herdr, o: SplitOptions): Promise<Opened> {
  const install = await checkInstall($)
  if ('error' in install) return { ok: false, text: `gnam-pixel 을 열 수 없음: ${install.error}` }
  const split = await herdrRun($, h, [
    'pane', 'split', '--pane', h.caller, '--direction', o.direction, '--cwd', o.cwd,
    '--env', `GNAM_VIEW_CWD=${o.cwd}`, '--env', `GNAM_VIEW_THEME=${o.theme}`, '--no-focus',
  ])
  if (!split.ok) return { ok: false, text: `herdr pane 을 만들 수 없음: ${split.error}` }
  const pane = isRecord(split.result.pane) && typeof split.result.pane.pane_id === 'string' ? split.result.pane.pane_id : null
  if (!pane) return { ok: false, text: 'herdr pane split 응답에 pane id 없음' }
  const run = await herdrRun($, h, ['pane', 'run', pane, appCommand(install.pixel, install.entry)])
  if (!run.ok) {
    await herdrRun($, h, ['pane', 'close', pane])
    return { ok: false, text: `herdr pane 에서 앱을 실행할 수 없음: ${run.error}` }
  }
  const where = o.direction === 'down' ? '아래' : '오른쪽'
  return { ok: true, pane, text: `gnam 화면을 ${where} herdr pane 에 열었습니다 (닫기: /gnam-pixel close 또는 그 pane 에서 Ctrl+C)` }
}
