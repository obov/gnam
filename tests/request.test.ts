import { test } from "node:test"
import { expect } from "./expect.ts"
import request from "../src/plugins/request/index.ts"
import { parseAttachment } from "../src/plugins/request/model.ts"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { fakeLookup, ruleRunner, tempRepo } from "./helpers.ts"

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

test("Request 필드: plan · spec chore · chore · refactor 에 필수, impl 은 제외", () => {
  const plan = "spec.x.plan: p\n\nGoal:\ng\n\nPlan:\n1. a\n   완료: b\n\nBlocking: 없음"
  expect(rules(plan, [])).toEqual(["commit/request-link"])
  expect(rules(`${plan}\n\nRequest: ${R1}`, [])).toEqual([])
  expect(rules("chore: c\n\nRequest: 없음 (반복 chore 3회 → 규칙 개선)", [])).toEqual([])
  expect(rules("chore: c\n\nRequest: 없음", [])).toEqual(["commit/request-link"])
  expect(rules("chore: c\n\nRequest: 2222222", [])).toEqual(["commit/request-link"])
  expect(rules("chore: c\n\nRequest: 3333333", [])).toEqual(["commit/request-link"])
  expect(rules(`chore: c\n\nRequest: ${R1}, 2222222`, [])).toEqual(["commit/request-link"])
  expect(rules("spec.x.impl: i\n\nPlan: 2222222 1", [])).not.toContain("commit/request-link")
  expect(rules("request: r\n\nText:\n> 원문", [])).toEqual([])
})

test("Request 필드: verify 는 request plugin 을 켠 커밋부터 검사", () => {
  const repo = tempRepo({ format: 1, plugins: [] })
  try {
    repo.git("add", "gnam.json")
    repo.git("commit", "-q", "--no-verify", "-m", "chore: gnam 도입\n\nGoal:\nx")
    repo.commit("a.txt", "chore: 켜기 전")
    writeFileSync(join(repo.root, "gnam.json"), JSON.stringify({ format: 1, plugins: ["@gnam/request"] }))
    repo.git("add", "gnam.json")
    repo.git("commit", "-q", "--no-verify", "-m", "chore: request 켜기\n\nRequest: 없음 (도입)")
    expect(repo.gnam("verify").status).toBe(0)
    repo.git("commit", "-q", "--no-verify", "--allow-empty", "-m", "request: 요청\n\nText:\n> 원문")
    const req = repo.git("rev-parse", "--short=7", "HEAD").out.trim()
    repo.commit("b.txt", `chore: 연결됨\n\nRequest: ${req}`)
    expect(repo.gnam("verify").status).toBe(0)
    repo.commit("c.txt", "chore: 연결 없음")
    const failed = repo.gnam("verify")
    expect(failed.status).toBe(1)
    expect(failed.err).toContain("commit/request-link")
    expect(failed.err).toContain("chore: 연결 없음")
  } finally {
    repo.cleanup()
  }
})

test("명령 open · show: 미착수 요청 · Refines 체인 · 가리키는 커밋", () => {
  const repo = tempRepo({ format: 1, plugins: ["@gnam/request"] })
  try {
    const empty = (message: string) => {
      repo.git("commit", "-q", "--no-verify", "--allow-empty", "-m", message)
      return repo.git("rev-parse", "HEAD").out.trim()
    }
    expect(repo.gnam("run", "request", "open").out.trim()).toBe("미착수 요청 없음")
    const a = empty("request: 첫 요청\n\nText:\n> a")
    const b = empty("request: 다른 요청\n\nText:\n> b")
    const c = empty(`request: 첫 요청 보충\n\nText:\n> c\n\nRefines: ${a.slice(0, 7)}`)
    const work = repo.commit("x.txt", `chore: 작업\n\nRequest: ${a.slice(0, 7)}`)
    expect(repo.gnam("run", "request", "open").out.trim().split("\n")).toEqual([
      `${c.slice(0, 7)}  첫 요청 보충`,
      `${b.slice(0, 7)}  다른 요청`,
    ])
    const later = repo.commit("y.txt", `chore: 보충 반영\n\nRequest: ${c.slice(0, 9)}`)
    expect(repo.gnam("run", "request", "open").out.trim()).toBe(`${b.slice(0, 7)}  다른 요청`)
    expect(repo.gnam("run", "request", "show", c.slice(0, 7)).out.trim().split("\n")).toEqual([
      `${c.slice(0, 7)}  request: 첫 요청 보충`,
      "",
      "Refines 체인",
      `${a.slice(0, 7)}  첫 요청`,
      `${c.slice(0, 7)}  첫 요청 보충  ← 이 요청`,
      "",
      "가리키는 커밋",
      `${work.slice(0, 7)}  chore: 작업  → ${a.slice(0, 7)}`,
      `${later.slice(0, 7)}  chore: 보충 반영  → ${c.slice(0, 7)}`,
    ])
    expect(repo.gnam("run", "request", "show", work.slice(0, 7)).status).toBe(1)
  } finally {
    repo.cleanup()
  }
})

test("plugin add request: AGENTS.md 블록에 조각 · 스킬 링크", () => {
  const repo = tempRepo({ format: 1, plugins: [] })
  try {
    expect(repo.gnam("plugin", "add", "request").status).toBe(0)
    const agents = readFileSync(join(repo.root, "AGENTS.md"), "utf8")
    expect(agents).toContain("### request (사용자 요청 기록)")
    expect(existsSync(join(repo.root, ".agents/skills/gnam-request/SKILL.md"))).toBe(true)
    expect(repo.gnam("doctor").status).toBe(0)
  } finally {
    repo.cleanup()
  }
})
