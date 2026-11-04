// pixel 의 host 요소 (Box · Text 는 문자열 host 타입 'box' · 'text').
// '@zenbu-labs/pixel' 본체는 electron 을 불러오므로, 화면 코드는 여기서 받아 테스트 (react-test-renderer) 에서도 돈다.
import type { Box as PixelBox, Text as PixelText } from '@zenbu-labs/pixel'

export const Box = 'box' as unknown as typeof PixelBox
export const Text = 'text' as unknown as typeof PixelText

export type { Color, EngineKeyEvent, NodeHandle, Style } from '@zenbu-labs/pixel'
