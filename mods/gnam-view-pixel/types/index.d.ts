/** bridge (app/src/bridge.ts) 가 /state 로 내는 frame: 앱이 그린 POSIX shm 한 장 */
export type Frame = {
  shm: string
  format: 'rgba' | 'rgb'
  width: number
  height: number
  generation: number
  cols: number
  rows: number
}

/** GET /state?version=N (long-poll) */
export type BridgeState = {
  version: number
  frame: Frame | null
  joined: boolean
  alive: boolean
  title: string
  error: string | null
}

/** node app/dist/bridge.cjs launch 의 한 줄 출력 */
export type LaunchReport =
  | { port: number; token: string; pid: number; tty: string }
  | { error: string; code: 'tty' | 'install' | 'start' }

/** pane 이 그릴 수 없을 때의 이유 (null = 정상) */
export type PixelNotice = {
  /** tty · install · start · app (앱 종료) · graphics (터미널이 그림을 거절) */
  code: string
  text: string
} | null

/** herdr 분할 pane 모드에서 연 pane (null = 열지 않음). 세션 동안 ($.state) 유지: reload 뒤에도 같은 pane */
export type SplitPane = {
  /** 연 pane id (herdr pane split 의 result.pane.pane_id) */
  pane: string
  /** 그 pane 의 tab */
  tab: string | null
  /** 분할한 Claude Code pane (HERDR_PANE_ID) */
  caller: string
  direction: 'right' | 'down'
} | null

declare module 'claude-code' {
  interface PluginState {
    'gnam-view-pixel': { notice: Shaped<PixelNotice>; split: Shaped<SplitPane> }
  }
}
