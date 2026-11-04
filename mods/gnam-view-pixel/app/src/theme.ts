// 색 · 크기. 터미널 색 (onColors · host init colors) 이 오면 그것을 바탕으로, 없으면 어두운 기본값.
// GNAM_VIEW_THEME=light|dark 로 기본값을 고를 수 있다 (mod 설정 theme).

export type Rgba = [number, number, number, number]
export type TerminalColors = { foreground: Rgba | null; background: Rgba | null; palette: (Rgba | null)[] }

export type Theme = {
  isDark: boolean
  bg: Rgba
  fg: Rgba
  /** 카드 바탕 */
  card: Rgba
  /** 펼친 카드 · 선택 행 바탕 */
  raised: Rgba
  hairline: Rgba
  muted: Rgba
  faint: Rgba
  accent: Rgba
  accentSoft: Rgba
  green: Rgba
  greenSoft: Rgba
  yellow: Rgba
  yellowSoft: Rgba
  red: Rgba
  redSoft: Rgba
  /** 끝났지만 남은 일 (다음 계획 필요) */
  orange: Rgba
  orangeSoft: Rgba
  /** 글자 크기 (px) */
  size: { title: number; lead: number; body: number; small: number; tiny: number }
  /** 간격 단위 (px) */
  space: number
  radius: number
}

export function mix(a: Rgba, b: Rgba, t: number): Rgba {
  const c = (x: number, y: number) => Math.round(x + (y - x) * t)
  return [c(a[0], b[0]), c(a[1], b[1]), c(a[2], b[2]), 255]
}

const luminance = (c: Rgba) => (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255

const DARK = { bg: [24, 25, 30, 255] as Rgba, fg: [228, 230, 236, 255] as Rgba }
const LIGHT = { bg: [250, 250, 248, 255] as Rgba, fg: [32, 34, 40, 255] as Rgba }

export function makeTheme(colors: TerminalColors | null, basePx: number, preferred: 'dark' | 'light' | null = null): Theme {
  const base = preferred === 'light' ? LIGHT : DARK
  const bg = colors?.background ?? base.bg
  const fg = colors?.foreground ?? base.fg
  const isDark = luminance(bg) < 0.5
  const p = colors?.palette ?? []
  const accent = p[12] ?? p[4] ?? (isDark ? ([122, 162, 247, 255] as Rgba) : ([37, 99, 235, 255] as Rgba))
  const green = p[10] ?? p[2] ?? (isDark ? ([115, 201, 145, 255] as Rgba) : ([22, 128, 61, 255] as Rgba))
  const yellow = p[11] ?? p[3] ?? (isDark ? ([229, 192, 123, 255] as Rgba) : ([180, 110, 0, 255] as Rgba))
  const red = p[9] ?? p[1] ?? (isDark ? ([240, 113, 120, 255] as Rgba) : ([200, 40, 50, 255] as Rgba))
  const px = Math.max(10, Math.round(basePx || 14))
  return {
    isDark,
    bg,
    fg,
    card: mix(bg, fg, isDark ? 0.045 : 0.035),
    raised: mix(bg, fg, isDark ? 0.08 : 0.06),
    hairline: mix(bg, fg, 0.12),
    muted: mix(fg, bg, 0.38),
    faint: mix(fg, bg, 0.62),
    accent,
    accentSoft: mix(bg, accent, 0.22),
    green,
    greenSoft: mix(bg, green, 0.18),
    yellow,
    yellowSoft: mix(bg, yellow, 0.18),
    red,
    redSoft: mix(bg, red, 0.18),
    orange: mix(red, yellow, 0.45),
    orangeSoft: mix(bg, mix(red, yellow, 0.45), 0.18),
    size: { title: Math.round(px * 1.5), lead: Math.round(px * 1.15), body: px, small: Math.round(px * 0.86), tiny: Math.round(px * 0.76) },
    space: Math.round(px * 0.5),
    radius: Math.round(px * 0.6),
  }
}
