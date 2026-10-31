/** 테스트용 S3 호환 서버: path style PUT · GET · HEAD, 받은 요청의 SigV4 서명을 다시 계산해 검증 */
import { createHash } from "node:crypto"
import { createServer, type IncomingMessage, type Server } from "node:http"
import type { AddressInfo } from "node:net"
import { signRequest } from "../src/plugins/s3/sigv4.ts"

export interface Stored {
  body: Buffer
  contentType: string
  metadata: Record<string, string>
}

export interface FakeS3 {
  endpoint: string
  objects: Map<string, Stored>
  requests: { method: string; path: string; signatureOk: boolean; headers: Record<string, string> }[]
  close: () => Promise<void>
}

export const CREDS = { accessKeyId: "test-key", secretAccessKey: "test-secret" }

function verify(req: IncomingMessage, body: Buffer, endpoint: string): boolean {
  const auth = String(req.headers["authorization"] ?? "")
  const m = /Credential=[^/]+\/\d{8}\/([^/]+)\/s3\/aws4_request, SignedHeaders=([^,]+), Signature=([0-9a-f]+)/.exec(auth)
  if (m === null) return false
  const names = (m[2] ?? "").split(";").filter((n) => n !== "host")
  const headers = Object.fromEntries(names.map((n) => [n, String(req.headers[n] ?? "")]))
  const stamp = String(req.headers["x-amz-date"] ?? "")
  const date = new Date(`${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 8)}T${stamp.slice(9, 11)}:${stamp.slice(11, 13)}:${stamp.slice(13, 15)}Z`)
  const signed = signRequest({
    method: req.method ?? "GET",
    url: new URL(req.url ?? "/", endpoint),
    headers,
    payloadHash: String(req.headers["x-amz-content-sha256"] ?? ""),
    region: m[1] ?? "",
    credentials: CREDS,
    date,
  })
  const bodyOk = req.method !== "PUT" || createHash("sha256").update(body).digest("hex") === req.headers["x-amz-content-sha256"]
  return signed.signature === m[3] && bodyOk
}

export async function fakeS3(): Promise<FakeS3> {
  const objects = new Map<string, Stored>()
  const requests: FakeS3["requests"] = []
  let endpoint = ""
  const server: Server = createServer((req, res) => {
    const chunks: Buffer[] = []
    req.on("data", (c: Buffer) => chunks.push(c))
    req.on("end", () => {
      const body = Buffer.concat(chunks)
      const path = decodeURIComponent(new URL(req.url ?? "/", endpoint).pathname)
      const signatureOk = verify(req, body, endpoint)
      requests.push({ method: req.method ?? "", path, signatureOk, headers: Object.fromEntries(Object.entries(req.headers).map(([k, v]) => [k, String(v)])) })
      if (!signatureOk) {
        res.writeHead(403, { "content-type": "application/xml" })
        res.end("<Error><Code>SignatureDoesNotMatch</Code></Error>")
        return
      }
      if (req.method === "PUT") {
        const metadata: Record<string, string> = {}
        for (const [k, v] of Object.entries(req.headers)) if (k.startsWith("x-amz-meta-")) metadata[k.slice(11)] = String(v)
        objects.set(path, { body, contentType: String(req.headers["content-type"] ?? ""), metadata })
        res.writeHead(200)
        res.end()
        return
      }
      const found = objects.get(path)
      if (found === undefined) {
        res.writeHead(404, { "content-type": "application/xml" })
        res.end(req.method === "HEAD" ? undefined : "<Error><Code>NoSuchKey</Code></Error>")
        return
      }
      const headers: Record<string, string> = { "content-type": found.contentType, "content-length": String(found.body.length) }
      for (const [k, v] of Object.entries(found.metadata)) headers[`x-amz-meta-${k}`] = v
      res.writeHead(200, headers)
      res.end(req.method === "HEAD" ? undefined : found.body)
    })
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  endpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  return { endpoint, objects, requests, close: () => new Promise((resolve) => server.close(() => resolve())) }
}
