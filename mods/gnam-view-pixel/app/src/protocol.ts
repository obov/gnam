// bridge ↔ mod (http) 와 bridge ↔ 앱 (PIXEL_EMBED 소켓, 제어 소켓) 메시지 형태.
// 구조는 terminal-browser claude-code-plugin/hooks/bridge-protocol.ts (MIT) 를 따른다.
// mod 쪽 (hooks/protocol.ts) 은 같은 형태를 따로 갖는다: hooks 모듈은 plugin 밖 파일을 import 하지 못한다.

export type Frame = {
  shm: string
  format: 'rgba' | 'rgb'
  width: number
  height: number
  generation: number
  cols: number
  rows: number
}

export type BridgeState = {
  version: number
  frame: Frame | null
  /** 앱이 PIXEL_EMBED 소켓에 join 했는지 */
  joined: boolean
  alive: boolean
  title: string
  error: string | null
}

export type LaunchReport =
  | { port: number; token: string; pid: number; tty: string }
  | { error: string; code: 'tty' | 'install' | 'start' }

export type Mods = { shift?: boolean; alt?: boolean; ctrl?: boolean; super?: boolean }

/** mod (Client surface) → bridge, 셀 단위 좌표 */
export type InputEvent =
  | { type: 'mouse'; kind: 'down' | 'up' | 'move' | 'scrollup' | 'scrolldown'; button?: 'left' | 'middle' | 'right' | 'none'; x: number; y: number; mods?: Mods }
  | { type: 'key'; key: string; text?: string; mods?: Mods }

/** bridge → 앱 제어 소켓 (GNAM_VIEW_CONTROL) */
export type ControlMessage = { type: 'refresh' }

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

export function isFrame(v: unknown): v is Frame {
  return (
    isRecord(v) &&
    typeof v.shm === 'string' &&
    (v.format === 'rgba' || v.format === 'rgb') &&
    Number.isInteger(v.width) && (v.width as number) > 0 &&
    Number.isInteger(v.height) && (v.height as number) > 0 &&
    Number.isInteger(v.generation) &&
    Number.isInteger(v.cols) && (v.cols as number) > 0 &&
    Number.isInteger(v.rows) && (v.rows as number) > 0
  )
}

const MOUSE_KINDS = new Set(['down', 'up', 'move', 'scrollup', 'scrolldown'])
const BUTTONS = new Set(['left', 'middle', 'right', 'none'])

export function isInputEvent(v: unknown): v is InputEvent {
  if (!isRecord(v)) return false
  if (v.type === 'key') return typeof v.key === 'string' && (v.text === undefined || typeof v.text === 'string')
  if (v.type === 'mouse') {
    return (
      typeof v.kind === 'string' && MOUSE_KINDS.has(v.kind) &&
      (v.button === undefined || (typeof v.button === 'string' && BUTTONS.has(v.button))) &&
      typeof v.x === 'number' && typeof v.y === 'number'
    )
  }
  return false
}

export function isSize(v: unknown): v is { cols: number; rows: number } {
  return isRecord(v) && Number.isInteger(v.cols) && Number.isInteger(v.rows) && (v.cols as number) > 0 && (v.rows as number) > 0
}
