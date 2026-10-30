import { test } from "node:test"
import { expect } from "./expect.ts"
import { tokenize } from "../src/plugins/recall/tokenize.ts"

test("토큰화: 한글 bigram · 영문 숫자 소문자 단어 (specs/recall.md 예시)", () => {
  expect(tokenize("재시도를 추가")).toEqual(["재시", "시도", "도를", "추가"])
  expect(tokenize("handoff.md 경로는")).toEqual(["handoff", "md", "경로", "로는"])
  expect(tokenize("plan커밋")).toEqual(["plan", "커밋"])
})

test("토큰화: 1글자 한글 · 대문자 · NFD 입력 · 기호", () => {
  expect(tokenize("시 G5 Deferred:")).toEqual(["시", "g5", "deferred"])
  expect(tokenize("인증".normalize("NFD"))).toEqual(["인증"])
  expect(tokenize("— · :")).toEqual([])
})
