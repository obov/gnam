/**
 * AWS Signature Version 4 (S3). 런타임 의존성 없이 node:crypto 만 쓴다 (node · bun).
 * 헤더 서명 (Authorization) 과 query 서명 (presigned URL) 둘 다.
 */
import { createHash, createHmac } from "node:crypto"
import type { Credentials } from "./config.ts"

export const EMPTY_SHA256 = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
export const UNSIGNED = "UNSIGNED-PAYLOAD"

export const sha256Hex = (data: string | Uint8Array) => createHash("sha256").update(data).digest("hex")
const hmac = (key: string | Buffer, data: string) => createHmac("sha256", key).update(data).digest()

/** RFC 3986 unreserved 외 전부 인코딩. path 는 '/' 유지 */
export function uriEncode(text: string, keepSlash = false): string {
  let out = ""
  for (const byte of Buffer.from(text, "utf8")) {
    const ch = String.fromCharCode(byte)
    if (/[A-Za-z0-9\-_.~]/.test(ch) || (keepSlash && ch === "/")) out += ch
    else out += `%${byte.toString(16).toUpperCase().padStart(2, "0")}`
  }
  return out
}

/** 20130524T000000Z */
export const amzDate = (date: Date) => date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")

function canonicalQuery(url: URL): string {
  return [...url.searchParams.entries()]
    .map(([k, v]) => [uriEncode(k), uriEncode(v)] as const)
    .sort(([a, x], [b, y]) => (a < b ? -1 : a > b ? 1 : x < y ? -1 : x > y ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("&")
}

/** URL.pathname 은 이미 인코딩되어 있으므로 풀었다가 S3 규칙으로 한 번 인코딩 */
const canonicalPath = (url: URL) => uriEncode(decodeURIComponent(url.pathname), true) || "/"

function signingKey(secret: string, day: string, region: string, service: string) {
  return hmac(hmac(hmac(hmac(`AWS4${secret}`, day), region), service), "aws4_request")
}

export interface SignInput {
  method: string
  url: URL
  /** host 는 url 에서. 이름은 대소문자 무관 */
  headers?: Record<string, string>
  payloadHash: string
  region: string
  service?: string
  credentials: Credentials
  date: Date
}

export interface Signed {
  headers: Record<string, string>
  canonicalRequest: string
  stringToSign: string
  signature: string
}

function canonicalHeaders(headers: Record<string, string>) {
  const entries = Object.entries(headers)
    .map(([k, v]) => [k.toLowerCase(), v.trim().replace(/\s+/g, " ")] as const)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  return { text: entries.map(([k, v]) => `${k}:${v}\n`).join(""), signed: entries.map(([k]) => k).join(";") }
}

/** Authorization 헤더 서명. 반환 headers 를 그대로 요청에 쓴다 (host 제외 · fetch 가 붙임) */
export function signRequest(input: SignInput): Signed {
  const { method, url, payloadHash, region, credentials, date } = input
  const service = input.service ?? "s3"
  const stamp = amzDate(date)
  const day = stamp.slice(0, 8)
  const headers: Record<string, string> = {
    ...Object.fromEntries(Object.entries(input.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v])),
    host: url.host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": stamp,
  }
  if (credentials.sessionToken !== undefined) headers["x-amz-security-token"] = credentials.sessionToken
  const { text, signed } = canonicalHeaders(headers)
  const canonicalRequest = [method, canonicalPath(url), canonicalQuery(url), text, signed, payloadHash].join("\n")
  const scope = `${day}/${region}/${service}/aws4_request`
  const stringToSign = ["AWS4-HMAC-SHA256", stamp, scope, sha256Hex(canonicalRequest)].join("\n")
  const signature = createHmac("sha256", signingKey(credentials.secretAccessKey, day, region, service)).update(stringToSign).digest("hex")
  const { host: _host, ...rest } = headers
  return {
    headers: { ...rest, authorization: `AWS4-HMAC-SHA256 Credential=${credentials.accessKeyId}/${scope}, SignedHeaders=${signed}, Signature=${signature}` },
    canonicalRequest,
    stringToSign,
    signature,
  }
}

export interface PresignInput {
  method: string
  url: URL
  region: string
  service?: string
  credentials: Credentials
  date: Date
  /** 초. 1 ~ 604800 */
  expires: number
}

/** query 서명 URL (서명 헤더 host 만, payload UNSIGNED-PAYLOAD) */
export function presignUrl(input: PresignInput): string {
  const { method, region, credentials, date, expires } = input
  const service = input.service ?? "s3"
  const stamp = amzDate(date)
  const day = stamp.slice(0, 8)
  const scope = `${day}/${region}/${service}/aws4_request`
  const url = new URL(input.url.href)
  url.searchParams.set("X-Amz-Algorithm", "AWS4-HMAC-SHA256")
  url.searchParams.set("X-Amz-Credential", `${credentials.accessKeyId}/${scope}`)
  url.searchParams.set("X-Amz-Date", stamp)
  url.searchParams.set("X-Amz-Expires", String(expires))
  if (credentials.sessionToken !== undefined) url.searchParams.set("X-Amz-Security-Token", credentials.sessionToken)
  url.searchParams.set("X-Amz-SignedHeaders", "host")
  const canonicalRequest = [method, canonicalPath(url), canonicalQuery(url), `host:${url.host}\n`, "host", UNSIGNED].join("\n")
  const stringToSign = ["AWS4-HMAC-SHA256", stamp, scope, sha256Hex(canonicalRequest)].join("\n")
  const signature = createHmac("sha256", signingKey(credentials.secretAccessKey, day, region, service)).update(stringToSign).digest("hex")
  return `${url.origin}${canonicalPath(url)}?${canonicalQuery(url)}&X-Amz-Signature=${signature}`
}
