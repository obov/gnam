/**
 * ignorePatterns 의 glob (외부 의존 없음, specs/layout.md 'ignorePatterns').
 *   *  한 단계 · **  여러 단계 · ?  한 글자 · 앞 !  부정 · \  이스케이프. 저장소 루트 기준
 */
export function globToRegExp(pattern: string): RegExp {
  let out = ""
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i] ?? ""
    if (c === "\\") {
      out += escape(pattern[++i] ?? "")
    } else if (c === "*" && pattern[i + 1] === "*") {
      i++
      if (pattern[i + 1] === "/") {
        i++
        out += "(?:.*/)?"
      } else out += ".*"
    } else if (c === "*") out += "[^/]*"
    else if (c === "?") out += "[^/]"
    else out += escape(c)
  }
  return new RegExp(`^${out}$`)
}

const escape = (c: string) => c.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")

function one(pattern: string, path: string): boolean {
  return pattern.startsWith("!") ? !globToRegExp(pattern.slice(1)).test(path) : globToRegExp(pattern).test(path)
}

/** 바깥 배열 = OR, 안쪽 배열 = AND */
export function ignored(patterns: (string | string[])[], path: string): boolean {
  return patterns.some((p) => (typeof p === "string" ? one(p, path) : p.every((q) => one(q, path))))
}
