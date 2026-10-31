/**
 * S3 호환 객체 클라이언트: PUT · GET · HEAD · presign (fetch + SigV4). path style · virtual-host style.
 */
import type { Credentials, S3Config } from "./config.ts"
import { EMPTY_SHA256, presignUrl, sha256Hex, signRequest, uriEncode } from "./sigv4.ts"

export class S3Error extends Error {
  readonly status: number
  readonly code: string | null
  constructor(message: string, status: number, code: string | null) {
    super(message)
    this.status = status
    this.code = code
  }
}

export interface ObjectInfo {
  size: number
  contentType: string | null
  /** x-amz-meta-* (접두 제외, 소문자 이름) */
  metadata: Record<string, string>
}

export interface ClientOptions {
  fetch?: typeof fetch
  now?: () => Date
}

export interface S3Client {
  objectUrl(key: string, bucket?: string): URL
  head(key: string, bucket?: string): Promise<ObjectInfo | null>
  put(key: string, body: Uint8Array, options: { contentType: string; metadata: Record<string, string> }): Promise<void>
  get(key: string, bucket?: string): Promise<{ body: Uint8Array; info: ObjectInfo }>
  presign(key: string, expires: number, bucket?: string): string
}

function infoOf(response: Response): ObjectInfo {
  const metadata: Record<string, string> = {}
  response.headers.forEach((value, name) => {
    if (name.toLowerCase().startsWith("x-amz-meta-")) metadata[name.toLowerCase().slice("x-amz-meta-".length)] = value
  })
  return { size: Number(response.headers.get("content-length") ?? "0"), contentType: response.headers.get("content-type"), metadata }
}

async function failure(response: Response, what: string): Promise<S3Error> {
  const text = await response.text().catch(() => "")
  const code = /<Code>([^<]+)<\/Code>/.exec(text)?.[1] ?? null
  return new S3Error(`${what}: HTTP ${response.status}${code ? ` ${code}` : ""}`, response.status, code)
}

export function s3Client(config: S3Config, credentials: Credentials, options: ClientOptions = {}): S3Client {
  const doFetch = options.fetch ?? fetch
  const now = options.now ?? (() => new Date())
  const endpoint = new URL(config.endpoint)

  const objectUrl = (key: string, bucket = config.bucket) =>
    config.pathStyle
      ? new URL(`${endpoint.origin}${endpoint.pathname.replace(/\/$/, "")}/${uriEncode(bucket)}/${uriEncode(key, true)}`)
      : new URL(`${endpoint.protocol}//${bucket}.${endpoint.host}${endpoint.pathname.replace(/\/$/, "")}/${uriEncode(key, true)}`)

  async function send(method: string, url: URL, body?: Uint8Array, headers: Record<string, string> = {}) {
    const signed = signRequest({
      method,
      url,
      headers,
      payloadHash: body === undefined ? EMPTY_SHA256 : sha256Hex(body),
      region: config.region,
      credentials,
      date: now(),
    })
    return doFetch(url, { method, headers: signed.headers, ...(body === undefined ? {} : { body: body as unknown as BodyInit }) })
  }

  return {
    objectUrl,
    async head(key, bucket) {
      const response = await send("HEAD", objectUrl(key, bucket))
      if (response.status === 404) return null
      if (!response.ok) throw await failure(response, `HEAD ${key}`)
      return infoOf(response)
    },
    async put(key, body, { contentType, metadata }) {
      const headers: Record<string, string> = { "content-type": contentType }
      for (const [name, value] of Object.entries(metadata)) headers[`x-amz-meta-${name}`] = value
      const response = await send("PUT", objectUrl(key), body, headers)
      if (!response.ok) throw await failure(response, `PUT ${key}`)
      await response.arrayBuffer().catch(() => undefined)
    },
    async get(key, bucket) {
      const response = await send("GET", objectUrl(key, bucket))
      if (!response.ok) throw await failure(response, `GET ${key}`)
      return { body: new Uint8Array(await response.arrayBuffer()), info: infoOf(response) }
    },
    presign(key, expires, bucket) {
      return presignUrl({ method: "GET", url: objectUrl(key, bucket), region: config.region, credentials, date: now(), expires })
    },
  }
}
