/** bun:test expect 의 쓰는 부분만. node:test · bun test 공통으로 돌리기 위한 얇은 호환층 */
import assert from "node:assert/strict"

function matchObject(actual: unknown, expected: unknown): boolean {
  if (typeof expected !== "object" || expected === null) return Object.is(actual, expected)
  if (typeof actual !== "object" || actual === null) return false
  if (Array.isArray(expected))
    return Array.isArray(actual) && actual.length === expected.length && expected.every((e, i) => matchObject(actual[i], e))
  return Object.entries(expected).every(([k, v]) => matchObject((actual as Record<string, unknown>)[k], v))
}

const includes = (actual: unknown, item: unknown) =>
  typeof actual === "string" ? actual.includes(String(item)) : Array.isArray(actual) && actual.some((a) => Object.is(a, item))

export function expect(actual: unknown) {
  return {
    toBe: (expected: unknown) => assert.equal(actual, expected),
    toEqual: (expected: unknown) => assert.deepEqual(actual, expected),
    toBeNull: () => assert.equal(actual, null),
    toBeUndefined: () => assert.equal(actual, undefined),
    toBeLessThan: (n: number) => assert.ok((actual as number) < n, `${String(actual)} >= ${n}`),
    toContain: (item: unknown) => assert.ok(includes(actual, item), `${JSON.stringify(actual)} 에 ${JSON.stringify(item)} 없음`),
    toHaveLength: (n: number) => assert.equal((actual as { length: number }).length, n),
    toMatch: (re: RegExp | string) => assert.match(String(actual), typeof re === "string" ? new RegExp(re) : re),
    toMatchObject: (expected: unknown) =>
      assert.ok(matchObject(actual, expected), `${JSON.stringify(actual)} ⊉ ${JSON.stringify(expected)}`),
    toStartWith: (prefix: string) => assert.ok(String(actual).startsWith(prefix), `${String(actual)} !^ ${prefix}`),
    toBeGreaterThan: (n: number) => assert.ok((actual as number) > n, `${String(actual)} <= ${n}`),
    toBeInstanceOf: (cls: new (...a: never[]) => unknown) => assert.ok(actual instanceof cls),
    not: {
      toBe: (expected: unknown) => assert.notEqual(actual, expected),
      toContain: (item: unknown) => assert.ok(!includes(actual, item), `${JSON.stringify(actual)} 에 ${JSON.stringify(item)} 있음`),
    },
  }
}
