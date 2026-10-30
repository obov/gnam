/**
 * recall 토큰화 (specs/recall.md 토큰화). 사전 없이 한글 조사 · 복합명사 · 2음절 명사를 맞춘다.
 *   한글 연속 구간 → 겹치는 2글자 (1글자 구간은 그 글자)
 *   영문 · 숫자 연속 → 소문자 단어 하나. 나머지 문자는 경계
 */
const SPAN = /[가-힣ㄱ-ㅎㅏ-ㅣ]+|[a-z0-9]+/g
const HANGUL = /^[가-힣ㄱ-ㅎㅏ-ㅣ]/

export function tokenize(text: string): string[] {
  const tokens: string[] = []
  for (const [span] of text.normalize("NFC").toLowerCase().matchAll(SPAN)) {
    if (!HANGUL.test(span) || span.length === 1) {
      tokens.push(span)
      continue
    }
    for (let i = 0; i + 2 <= span.length; i++) tokens.push(span.slice(i, i + 2))
  }
  return tokens
}
