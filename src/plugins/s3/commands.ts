/**
 * s3 명령 put · get · url · check (specs/s3.md 명령). 출력 · 환경은 주입 가능 (테스트는 같은 프로세스에서 가짜 서버 사용).
 */
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { basename, extname, join, resolve } from "node:path"
import { fieldsOf } from "../../core/fields.ts"
import { git } from "../../core/git.ts"
import type { GnamConfig } from "../../core/plugin.ts"
import { parseAttachment, REQUEST_SUBJECT } from "../request/model.ts"
import { type S3Client, S3Error, s3Client } from "./client.ts"
import { CREDENTIAL_HELP, credentialsFrom, s3ConfigOf, s3ConfigProblems, type S3Config } from "./config.ts"
import { sha256Hex } from "./sigv4.ts"

export interface Io {
  env: Record<string, string | undefined>
  out: (line: string) => void
  err: (line: string) => void
  fetch?: typeof fetch
}

export const processIo = (): Io => ({ env: process.env, out: (l) => console.log(l), err: (l) => console.error(l) })

const TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".pdf": "application/pdf",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".json": "application/json",
  ".csv": "text/csv; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".zip": "application/zip",
}
export const contentTypeOf = (name: string) => TYPES[extname(name).toLowerCase()] ?? "application/octet-stream"

/** 첨부 줄 이름: 공백 · 큰따옴표가 있으면 큰따옴표로 감싸고 \" · \\ 이스케이프 (specs/request.md) */
export const attachmentName = (name: string) => (/[\s"\\]/.test(name) ? `"${name.replace(/["\\]/g, "\\$&")}"` : name)

const HEX64 = /^[0-9a-f]{64}$/

interface Ready {
  config: S3Config
  client: S3Client
}

function ready(gnamConfig: GnamConfig, io: Io): Ready | number {
  const raw = gnamConfig["s3"]
  const config = s3ConfigOf(raw)
  if (config === null) {
    const problems = raw === undefined ? ["gnam.json 에 s3 설정 없음 (endpoint · bucket)"] : s3ConfigProblems(raw)
    for (const p of problems) io.err(p)
    return 1
  }
  const credentials = credentialsFrom(io.env)
  if (credentials === null) {
    io.err(CREDENTIAL_HELP)
    return 1
  }
  return { config, client: s3Client(config, credentials, io.fetch ? { fetch: io.fetch } : {}) }
}

/** S3 · 네트워크 오류를 stderr 한 줄로 */
async function guarded(io: Io, run: () => Promise<number>): Promise<number> {
  try {
    return await run()
  } catch (error) {
    if (error instanceof S3Error) io.err(`s3: ${error.message}`)
    else io.err(`s3: 네트워크 오류: ${(error as Error).message}${(error as { cause?: Error }).cause ? ` (${(error as { cause: Error }).cause.message})` : ""}`)
    return 1
  }
}

export async function putCommand(args: string[], cwd: string, gnamConfig: GnamConfig, io: Io = processIo()): Promise<number> {
  if (args.length === 0) {
    io.err("사용: gnam run s3 put <file…>")
    return 1
  }
  const r = ready(gnamConfig, io)
  if (typeof r === "number") return r
  const { config, client } = r
  return guarded(io, async () => {
    let failed = false
    for (const file of args) {
      const path = resolve(cwd, file)
      if (!existsSync(path) || !statSync(path).isFile()) {
        io.err(`${file}: 파일 없음`)
        failed = true
        continue
      }
      const size = statSync(path).size
      if (size > config.maxBytes) {
        io.err(`${file}: ${size} 바이트 > maxBytes ${config.maxBytes}`)
        failed = true
        continue
      }
      const body = readFileSync(path)
      const hex = sha256Hex(body)
      const key = `${config.prefix}${hex}`
      const name = basename(path)
      if ((await client.head(key)) === null)
        await client.put(key, body, { contentType: contentTypeOf(name), metadata: { name: encodeURIComponent(name), sha256: hex } })
      io.out(`${attachmentName(name)}  sha256:${hex}  s3://${config.bucket}/${key}  ← ${path}`)
    }
    return failed ? 1 : 0
  })
}

/** ref → bucket · key · 기대 sha256 */
export function parseRef(ref: string, config: S3Config): { bucket: string; key: string; expected: string | null } | null {
  const sha = /^sha256:([0-9a-f]{64})$/.exec(ref)
  if (sha !== null) return { bucket: config.bucket, key: `${config.prefix}${sha[1]}`, expected: sha[1] ?? null }
  const s3 = /^s3:\/\/([^/]+)\/(.+)$/.exec(ref)
  if (s3 === null) return null
  const key = s3[2] ?? ""
  const last = key.split("/").at(-1) ?? ""
  return { bucket: s3[1] ?? "", key, expected: HEX64.test(last) ? last : null }
}

export async function getCommand(args: string[], cwd: string, gnamConfig: GnamConfig, io: Io = processIo()): Promise<number> {
  const at = args.indexOf("-o")
  const outPath = at >= 0 ? args[at + 1] : undefined
  const ref = (at >= 0 ? [...args.slice(0, at), ...args.slice(at + 2)] : args)[0]
  if (ref === undefined || (at >= 0 && outPath === undefined)) {
    io.err("사용: gnam run s3 get <sha256:<hex> | s3://<bucket>/<key>> [-o <path>]")
    return 1
  }
  const r = ready(gnamConfig, io)
  if (typeof r === "number") return r
  const target = parseRef(ref, r.config)
  if (target === null) {
    io.err(`ref 형식 아님: ${ref} (sha256:<hex> · s3://<bucket>/<key>)`)
    return 1
  }
  return guarded(io, async () => {
    const { body, info } = await r.client.get(target.key, target.bucket)
    const actual = sha256Hex(body)
    const expected = target.expected ?? (HEX64.test(info.metadata["sha256"] ?? "") ? (info.metadata["sha256"] ?? null) : null)
    if (expected !== null && actual !== expected) {
      io.err(`sha256 불일치: 기대 ${expected}, 받은 내용 ${actual}. 파일을 남기지 않음`)
      return 1
    }
    const name = info.metadata["name"] ? decodeURIComponent(info.metadata["name"]) : (expected ?? actual)
    const path = outPath === undefined ? join(cwd, basename(name)) : resolve(cwd, outPath)
    writeFileSync(path, body)
    io.out(path)
    return 0
  })
}

export async function urlCommand(args: string[], _cwd: string, gnamConfig: GnamConfig, io: Io = processIo()): Promise<number> {
  const at = args.indexOf("--expires")
  const raw = at >= 0 ? args[at + 1] : "3600"
  const ref = (at >= 0 ? [...args.slice(0, at), ...args.slice(at + 2)] : args)[0]
  const expires = Number(raw)
  if (ref === undefined || !/^[1-9][0-9]*$/.test(raw ?? "") || expires > 604800) {
    io.err("사용: gnam run s3 url <ref> [--expires <초, 1 ~ 604800>]")
    return 1
  }
  const r = ready(gnamConfig, io)
  if (typeof r === "number") return r
  const target = parseRef(ref, r.config)
  if (target === null) {
    io.err(`ref 형식 아님: ${ref} (sha256:<hex> · s3://<bucket>/<key>)`)
    return 1
  }
  io.out(r.client.presign(target.key, expires, target.bucket))
  return 0
}

/** range 의 request 커밋에서 s3 첨부 줄 (commit sha · 이름 · bucket · key) */
export function s3Attachments(cwd: string, range: string): { sha: string; name: string; bucket: string; key: string }[] {
  const result = git(["log", "-z", "--format=%H%x00%s%x00%b", range], cwd)
  if (!result.ok) throw new Error(`git log ${range} 실패: ${result.err.trim()}`)
  const fields = result.out.split("\0")
  const out: { sha: string; name: string; bucket: string; key: string }[] = []
  for (let i = 0; i + 2 < fields.length; i += 3) {
    const [sha = "", subject = "", body = ""] = fields.slice(i, i + 3)
    if (!REQUEST_SUBJECT.test(subject)) continue
    for (const line of fieldsOf(body).get("Attachments") ?? []) {
      const parsed = line.trim() === "" ? null : parseAttachment(line.trim())
      if (parsed === null || typeof parsed === "string" || parsed.location.kind !== "s3") continue
      const m = /^s3:\/\/([^/]+)\/(.+)$/.exec(parsed.location.value)
      if (m !== null) out.push({ sha: sha.trim(), name: parsed.name, bucket: m[1] ?? "", key: m[2] ?? "" })
    }
  }
  return out.reverse()
}

export async function checkCommand(args: string[], cwd: string, gnamConfig: GnamConfig, io: Io = processIo()): Promise<number> {
  const r = ready(gnamConfig, io)
  if (typeof r === "number") return r
  let attachments: ReturnType<typeof s3Attachments>
  try {
    attachments = s3Attachments(cwd, args[0] ?? "HEAD")
  } catch (error) {
    io.err((error as Error).message)
    return 1
  }
  return guarded(io, async () => {
    let failed = 0
    for (const a of attachments) {
      const info = await r.client.head(a.key, a.bucket)
      const expected = a.key.split("/").at(-1) ?? ""
      const meta = info?.metadata["sha256"]
      const problem = info === null ? "객체 없음" : meta !== undefined && HEX64.test(expected) && meta !== expected ? `sha256 메타데이터 불일치 (${meta})` : null
      if (problem !== null) {
        io.out(`${a.sha.slice(0, 7)}  ${attachmentName(a.name)}  ${problem}`)
        failed++
      }
    }
    if (failed > 0) return 1
    io.out(`s3 check: 첨부 ${attachments.length}개 확인`)
    return 0
  })
}
