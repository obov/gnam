import { test } from "node:test"
import { expect } from "./expect.ts"
import request from "../src/plugins/request/index.ts"
import { parseAttachment } from "../src/plugins/request/model.ts"
import { fakeLookup, ruleRunner } from "./helpers.ts"

const SHA = `sha256:${"a".repeat(64)}`
const R1 = "1111111"
const lookup = fakeLookup({ [R1]: { subject: "request: 첫 요청" }, "2222222": { subject: "chore: x" } }, [])
const rules = ruleRunner(lookup, [request])

const valid = [
  "request: gnam 설정을 JSON 으로 조회",
  "",
  "Text:",
  "> 설정 정보를 json 으로 꺼낼 수 있으면 좋겠어",
  ">",
  "> std output 으로",
  "",
  "Described:",
  "터미널 스크린샷. 오류 메시지 한 줄",
  "",
  "Attachments:",
  `mockup.png  ${SHA}  s3://gnam/gnam/${"a".repeat(64)}  ← /Users/me/Downloads/mockup.png`,
  `"design spec.pdf"  ${SHA}  없음  ← /tmp/design spec.pdf`,
  `cli.ts  ${SHA}  src/cli.ts@abcdef1`,
  "문서  https://example.com/doc",
  "",
  `Refines: ${R1}`,
].join("\n")

test("request 커밋: 올바른 예시 통과", () => {
  expect(rules(valid, [])).toEqual([])
})

test("request 커밋: Text 없음 · 인용 아닌 줄 · 파일 변경", () => {
  expect(rules("request: x\n\nDescribed:\n설명", [])).toEqual(["commit/request-text"])
  expect(rules("request: x\n\nText:\n> 원문\n에이전트 설명", [])).toEqual(["commit/request-text"])
  expect(rules("request: x\n\nText:\n> 원문", ["a.png"])).toEqual(["commit/request-files"])
  expect(rules("request: x\n\nText:\n> 원문", [], true)).toEqual(["commit/merge-kind"])
})

test("request 커밋: 첨부 줄 형식", () => {
  const withLine = (line: string) => rules(`request: x\n\nText:\n> 원문\n\nAttachments:\n${line}`, [])
  expect(withLine(`a.png  s3://b/k`)).toEqual(["commit/request-attachment"])
  expect(withLine(`a.png  ${SHA}  없음`)).toEqual(["commit/request-attachment"])
  expect(withLine(`a b.png  ${SHA}  s3://b/k`)).toEqual(["commit/request-attachment"])
  expect(withLine(`a.png  sha256:XYZ  s3://b/k`)).toEqual(["commit/request-attachment"])
  expect(withLine(`a.png  ${SHA}  ftp://x`)).toEqual(["commit/request-attachment"])
  expect(withLine(`a.png  https://x.dev/a.png`)).toEqual([])
})

test("request 커밋: Refines 대상", () => {
  const base = "request: x\n\nText:\n> 원문\n\nRefines: "
  expect(rules(`${base}2222222`, [])).toEqual(["commit/request-refines"])
  expect(rules(`${base}3333333`, [])).toEqual(["commit/request-refines"])
  expect(rules(`${base}${R1}`, [])).toEqual([])
})

test("첨부 줄 해석: 큰따옴표 이름 · 원래 경로 · 저장소 위치", () => {
  expect(parseAttachment(`"a \\"b\\".png"  ${SHA}  없음  ← /tmp/a.png`)).toEqual({
    name: 'a "b".png',
    sha256: SHA,
    location: { kind: "none" },
    origin: "/tmp/a.png",
  })
  expect(parseAttachment(`cli.ts  ${SHA}  src/cli.ts@abcdef1`)).toMatchObject({
    location: { kind: "repo", path: "src/cli.ts", commit: "abcdef1" },
    origin: null,
  })
})
