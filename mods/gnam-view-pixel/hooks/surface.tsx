/* @jsx h */
// Client surface: pane 위에 투명하게 깔려 키 · 마우스를 모으고, 크기를 hooks 모듈에 알린다.
// terminal-browser claude-code-plugin/hooks/surface.tsx (MIT) 를 따른다.
import type { ClientKeyEvent, ClientPointerEvent, ClientSurface } from 'claude-code'

export const MAX_IMAGE_CELLS = 255

type State = { cols: number; rows: number }
type Mods = { shift: boolean; alt: boolean; ctrl: boolean; super: boolean }
type InputEvent =
  | { type: 'mouse'; kind: 'down' | 'up' | 'move'; button?: string; x: number; y: number; mods: Mods }
  | { type: 'key'; key: string; text?: string; mods: Mods }

const KEY_NAMES: Record<string, string> = {
  return: 'enter',
  enter: 'enter',
  escape: 'escape',
  backspace: 'backspace',
  delete: 'delete',
  tab: 'tab',
  up: 'up',
  down: 'down',
  left: 'left',
  right: 'right',
  home: 'home',
  end: 'end',
  pageup: 'pageup',
  pagedown: 'pagedown',
  space: ' ',
}

export function keyEvent(event: ClientKeyEvent): InputEvent | null {
  const mods: Mods = { shift: Boolean(event.shift), alt: false, ctrl: Boolean(event.ctrl), super: Boolean(event.meta) }
  const named = KEY_NAMES[event.key.toLowerCase()]
  if (named !== undefined) return { type: 'key', key: named, text: named.length === 1 && !mods.ctrl ? named : undefined, mods }
  if ([...event.key].length === 1) return { type: 'key', key: event.key, text: mods.ctrl || mods.super ? undefined : event.key, mods }
  return null
}

function pointerEvent(event: ClientPointerEvent): InputEvent | null {
  const mods: Mods = { shift: Boolean(event.shift), alt: Boolean(event.alt), ctrl: Boolean(event.ctrl), super: false }
  // 셀 안 위치가 있으면 (fine) 그대로: bridge 가 셀 크기를 곱한다
  const x = event.fine?.x ?? event.x
  const y = event.fine?.y ?? event.y
  if (event.type === 'enter' || event.type === 'leave') return { type: 'mouse', kind: 'move', x, y, mods }
  return { type: 'mouse', kind: event.type, button: event.button, x, y, mods }
}

export default function Surface(_props: unknown, surface: ClientSurface<State>) {
  const { Box } = surface.elements
  const queue: InputEvent[] = []

  if (surface.state === undefined) {
    surface.setState({ cols: 0, rows: 0 })
    surface.onPointer(event => {
      const mapped = pointerEvent(event)
      if (mapped) queue.push(mapped)
    })
    surface.onKey(event => {
      const mapped = keyEvent(event)
      if (mapped) queue.push(mapped)
    })
    surface.every(20, () => {
      if (queue.length === 0) return
      surface.post({ type: 'input', events: queue.splice(0, queue.length) as unknown as never })
    })
  }

  const cols = Math.min(surface.columns, MAX_IMAGE_CELLS)
  const rows = Math.min(surface.rows, MAX_IMAGE_CELLS)
  if (cols > 0 && rows > 0 && surface.state && (surface.state.cols !== cols || surface.state.rows !== rows)) {
    surface.setState({ cols, rows })
    surface.post({ type: 'size', cols, rows })
  }

  return <Box flexDirection="column" height="100%" />
}
