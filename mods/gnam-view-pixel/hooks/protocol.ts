// bridge 응답 검사 (app/src/protocol.ts 와 같은 형태; hooks 모듈은 plugin 밖 파일을 import 하지 못해 따로 둔다).
// terminal-browser claude-code-plugin/hooks/bridge-protocol.ts (MIT) 를 따른다.
import type { BridgeState, Frame, LaunchReport } from '../types'

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

export const isFrame = (v: unknown): v is Frame =>
  isRecord(v) &&
  typeof v.shm === 'string' &&
  (v.format === 'rgba' || v.format === 'rgb') &&
  Number.isInteger(v.width) &&
  Number.isInteger(v.height) &&
  Number.isInteger(v.generation) &&
  Number.isInteger(v.cols) &&
  Number.isInteger(v.rows)

export const isBridgeState = (v: unknown): v is BridgeState =>
  isRecord(v) && Number.isInteger(v.version) && typeof v.alive === 'boolean' && 'frame' in v && (v.frame === null || isFrame(v.frame))

export const isLaunchReport = (v: unknown): v is LaunchReport =>
  isRecord(v) && ((typeof v.port === 'number' && typeof v.token === 'string') || typeof v.error === 'string')

export type SizeMessage = { type: 'size'; cols: number; rows: number }
export type InputMessage = { type: 'input'; events: unknown[] }

export const isSizeMessage = (v: unknown): v is SizeMessage =>
  isRecord(v) && v.type === 'size' && Number.isInteger(v.cols) && Number.isInteger(v.rows) && (v.cols as number) > 0 && (v.rows as number) > 0

export const isInputMessage = (v: unknown): v is InputMessage => isRecord(v) && v.type === 'input' && Array.isArray(v.events)
