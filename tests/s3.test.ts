import { test } from "node:test"
import { expect } from "./expect.ts"
import { credentialsFrom, s3ConfigOf, s3ConfigProblems } from "../src/plugins/s3/config.ts"

const base = { endpoint: "https://acc.r2.cloudflarestorage.com", bucket: "gnam" }

test("설정: 필수 키 · https · prefix · 자격 키 금지 · 기본값", () => {
  expect(s3ConfigProblems(base)).toEqual([])
  expect(s3ConfigProblems(undefined)).toEqual([])
  expect(s3ConfigProblems({ bucket: "b" })).toEqual(["s3.endpoint 필수 (https URL)"])
  expect(s3ConfigProblems({ ...base, endpoint: "http://example.com" })[0]).toContain("https")
  expect(s3ConfigProblems({ ...base, endpoint: "http://127.0.0.1:9000" })).toEqual([])
  expect(s3ConfigProblems({ ...base, prefix: "gnam" })[0]).toContain("s3.prefix")
  expect(s3ConfigProblems({ ...base, secretAccessKey: "x" })[0]).toContain("자격은 gnam.json 에 두지 않는다")
  expect(s3ConfigProblems({ ...base, accessKeyId: "x" })[0]).toContain("자격은")
  expect(s3ConfigProblems({ ...base, maxBytes: 0 })[0]).toContain("s3.maxBytes")
  expect(s3ConfigOf({ ...base, endpoint: "https://x.dev/" })).toEqual({
    endpoint: "https://x.dev",
    bucket: "gnam",
    region: "us-east-1",
    prefix: "gnam/",
    pathStyle: true,
    maxBytes: 104857600,
  })
  expect(s3ConfigOf({ bucket: "b" })).toBeNull()
})

test("자격: GNAM_S3_* 가 AWS_* 보다 우선, 둘 다 없으면 null", () => {
  expect(credentialsFrom({ AWS_ACCESS_KEY_ID: "a", AWS_SECRET_ACCESS_KEY: "b" })).toEqual({ accessKeyId: "a", secretAccessKey: "b" })
  expect(
    credentialsFrom({ AWS_ACCESS_KEY_ID: "a", AWS_SECRET_ACCESS_KEY: "b", GNAM_S3_ACCESS_KEY_ID: "g", GNAM_S3_SECRET_ACCESS_KEY: "h", GNAM_S3_SESSION_TOKEN: "t" }),
  ).toEqual({ accessKeyId: "g", secretAccessKey: "h", sessionToken: "t" })
  expect(credentialsFrom({ GNAM_S3_ACCESS_KEY_ID: "g" })).toBeNull()
  expect(credentialsFrom({})).toBeNull()
})

// AWS 문서 예시 (Signature Version 4: GET object · presigned URL). 키 · 날짜 · 기대 서명은 문서 값 그대로
const AWS_DOC = { accessKeyId: "AKIAIOSFODNN7EXAMPLE", secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY" }
const DOC_DATE = new Date("2013-05-24T00:00:00Z")

test("SigV4: AWS 문서 GET object 예시와 같은 서명", async () => {
  const { signRequest, EMPTY_SHA256 } = await import("../src/plugins/s3/sigv4.ts")
  const signed = signRequest({
    method: "GET",
    url: new URL("https://examplebucket.s3.amazonaws.com/test.txt"),
    headers: { Range: "bytes=0-9" },
    payloadHash: EMPTY_SHA256,
    region: "us-east-1",
    credentials: AWS_DOC,
    date: DOC_DATE,
  })
  expect(signed.signature).toBe("f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41")
  expect(signed.headers["authorization"]).toBe(
    "AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request, SignedHeaders=host;range;x-amz-content-sha256;x-amz-date, Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41",
  )
})

test("SigV4: AWS 문서 presigned URL 예시와 같은 서명", async () => {
  const { presignUrl } = await import("../src/plugins/s3/sigv4.ts")
  const url = presignUrl({
    method: "GET",
    url: new URL("https://examplebucket.s3.amazonaws.com/test.txt"),
    region: "us-east-1",
    credentials: AWS_DOC,
    date: DOC_DATE,
    expires: 86400,
  })
  expect(new URL(url).searchParams.get("X-Amz-Signature")).toBe("aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404")
})

test("SigV4: 경로 인코딩 (공백 · 한글 · '/')", async () => {
  const { uriEncode } = await import("../src/plugins/s3/sigv4.ts")
  expect(uriEncode("a b/한.png", true)).toBe("a%20b/%ED%95%9C.png")
  expect(uriEncode("a/b")).toBe("a%2Fb")
})

test("클라이언트: PUT · HEAD · GET 서명 검증 · key · 메타데이터 · Content-Type · 404 · 서명 오류", async () => {
  const { s3Client, S3Error } = await import("../src/plugins/s3/client.ts")
  const { fakeS3, CREDS } = await import("./s3-server.ts")
  const server = await fakeS3()
  try {
    const config = { endpoint: server.endpoint, bucket: "gnam", region: "auto", prefix: "gnam/", pathStyle: true, maxBytes: 100 }
    const client = s3Client(config, CREDS)
    expect(await client.head("gnam/abc")).toBeNull()
    await client.put("gnam/abc", new TextEncoder().encode("hello"), { contentType: "text/plain", metadata: { name: encodeURIComponent("한 글.txt") } })
    expect(server.objects.get("/gnam/gnam/abc")?.metadata).toEqual({ name: "%ED%95%9C%20%EA%B8%80.txt" })
    expect(await client.head("gnam/abc")).toEqual({ size: 5, contentType: "text/plain", metadata: { name: "%ED%95%9C%20%EA%B8%80.txt" } })
    const got = await client.get("gnam/abc")
    expect(new TextDecoder().decode(got.body)).toBe("hello")
    expect(server.requests.every((r) => r.signatureOk)).toBe(true)
    expect(server.requests.map((r) => `${r.method} ${r.path}`)).toEqual(["HEAD /gnam/gnam/abc", "PUT /gnam/gnam/abc", "HEAD /gnam/gnam/abc", "GET /gnam/gnam/abc"])
    let error: unknown = null
    try {
      await s3Client(config, { ...CREDS, secretAccessKey: "wrong" }).get("gnam/abc")
    } catch (e) {
      error = e
    }
    expect(error).toBeInstanceOf(S3Error)
    expect((error as InstanceType<typeof S3Error>).code).toBe("SignatureDoesNotMatch")
    expect((error as InstanceType<typeof S3Error>).status).toBe(403)
  } finally {
    await server.close()
  }
})

test("클라이언트: virtual-host style URL · presign", async () => {
  const { s3Client } = await import("../src/plugins/s3/client.ts")
  const config = { endpoint: "https://s3.example.com", bucket: "gnam", region: "us-east-1", prefix: "gnam/", pathStyle: false, maxBytes: 100 }
  const client = s3Client(config, { accessKeyId: "a", secretAccessKey: "b" }, { now: () => new Date("2026-10-31T00:00:00Z") })
  expect(client.objectUrl("gnam/x y").href).toBe("https://gnam.s3.example.com/gnam/x%20y")
  const url = new URL(client.presign("gnam/abc", 600))
  expect(url.host).toBe("gnam.s3.example.com")
  expect(url.searchParams.get("X-Amz-Expires")).toBe("600")
  expect(url.searchParams.get("X-Amz-Date")).toBe("20261031T000000Z")
  expect(s3Client({ ...config, pathStyle: true }, { accessKeyId: "a", secretAccessKey: "b" }).objectUrl("k").href).toBe("https://s3.example.com/gnam/k")
})

async function commandSetup(maxBytes = 1000) {
  const { mkdtempSync, writeFileSync } = await import("node:fs")
  const { tmpdir } = await import("node:os")
  const { join } = await import("node:path")
  const { fakeS3, CREDS } = await import("./s3-server.ts")
  const server = await fakeS3()
  const dir = mkdtempSync(join(tmpdir(), "s3-cmd-"))
  const out: string[] = []
  const err: string[] = []
  const io = { env: { GNAM_S3_ACCESS_KEY_ID: CREDS.accessKeyId, GNAM_S3_SECRET_ACCESS_KEY: CREDS.secretAccessKey }, out: (l: string) => out.push(l), err: (l: string) => err.push(l) }
  const config = { format: 1, plugins: ["@gnam/s3"], s3: { endpoint: server.endpoint, bucket: "gnam", maxBytes } }
  return { server, dir, out, err, io, config, write: (name: string, body: string) => writeFileSync(join(dir, name), body), join }
}

test("put: 첨부 줄 출력 · 같은 내용 재업로드 생략 · maxBytes 초과 exit 1 · 자격 없음 exit 1", async () => {
  const { putCommand } = await import("../src/plugins/s3/commands.ts")
  const { createHash } = await import("node:crypto")
  const t = await commandSetup(10)
  try {
    t.write("a b.png", "png-bytes")
    t.write("big.txt", "x".repeat(11))
    const hex = createHash("sha256").update("png-bytes").digest("hex")
    expect(await putCommand(["a b.png"], t.dir, t.config, t.io)).toBe(0)
    expect(t.out).toEqual([`"a b.png"  sha256:${hex}  s3://gnam/gnam/${hex}  ← ${t.join(t.dir, "a b.png")}`])
    expect(t.server.objects.get(`/gnam/gnam/${hex}`)).toMatchObject({ contentType: "image/png", metadata: { name: "a%20b.png", sha256: hex } })
    expect(await putCommand(["a b.png"], t.dir, t.config, t.io)).toBe(0)
    expect(t.server.requests.filter((r) => r.method === "PUT")).toHaveLength(1)
    expect(await putCommand(["big.txt", "a b.png"], t.dir, t.config, t.io)).toBe(1)
    expect(t.err[0]).toContain("big.txt: 11 바이트 > maxBytes 10")
    expect(t.out).toHaveLength(3)
    expect(await putCommand(["a b.png"], t.dir, t.config, { ...t.io, env: {} })).toBe(1)
    expect(t.err.at(-1)).toContain("GNAM_S3_ACCESS_KEY_ID")
    // 서버가 받은 첨부 줄은 request 첨부 형식 그대로
    const { parseAttachment } = await import("../src/plugins/request/model.ts")
    expect(parseAttachment(t.out[0] ?? "")).toMatchObject({ name: "a b.png", location: { kind: "s3" } })
  } finally {
    await t.server.close()
  }
})

test("get: sha256 ref · s3:// ref · -o · 해시 불일치면 파일 없음 exit 1", async () => {
  const { getCommand, putCommand } = await import("../src/plugins/s3/commands.ts")
  const { existsSync, readFileSync } = await import("node:fs")
  const t = await commandSetup()
  try {
    t.write("note.md", "hello")
    await putCommand(["note.md"], t.dir, t.config, t.io)
    const hex = /sha256:([0-9a-f]{64})/.exec(t.out[0] ?? "")?.[1] ?? ""
    const sub = t.join(t.dir, "out")
    const { mkdirSync } = await import("node:fs")
    mkdirSync(sub)
    expect(await getCommand([`sha256:${hex}`], sub, t.config, t.io)).toBe(0)
    expect(readFileSync(t.join(sub, "note.md"), "utf8")).toBe("hello")
    expect(await getCommand([`s3://gnam/gnam/${hex}`, "-o", "copy.md"], sub, t.config, t.io)).toBe(0)
    expect(readFileSync(t.join(sub, "copy.md"), "utf8")).toBe("hello")
    const stored = t.server.objects.get(`/gnam/gnam/${hex}`)
    if (stored !== undefined) stored.body = Buffer.from("tampered")
    expect(await getCommand([`sha256:${hex}`, "-o", "bad.md"], sub, t.config, t.io)).toBe(1)
    expect(existsSync(t.join(sub, "bad.md"))).toBe(false)
    expect(t.err.at(-1)).toContain("sha256 불일치")
    expect(await getCommand(["nope"], sub, t.config, t.io)).toBe(1)
    expect(await getCommand([`sha256:${"0".repeat(64)}`], sub, t.config, t.io)).toBe(1)
    expect(t.err.at(-1)).toContain("HTTP 404 NoSuchKey")
  } finally {
    await t.server.close()
  }
})

test("url: presigned URL · 만료 범위 검사", async () => {
  const { urlCommand } = await import("../src/plugins/s3/commands.ts")
  const t = await commandSetup()
  try {
    const hex = "a".repeat(64)
    expect(await urlCommand([`sha256:${hex}`, "--expires", "600"], t.dir, t.config, t.io)).toBe(0)
    const url = new URL(t.out[0] ?? "")
    expect(url.pathname).toBe(`/gnam/gnam/${hex}`)
    expect(url.searchParams.get("X-Amz-Expires")).toBe("600")
    expect(await urlCommand([`sha256:${hex}`, "--expires", "604801"], t.dir, t.config, t.io)).toBe(1)
    expect(await urlCommand([`sha256:${hex}`, "--expires", "0"], t.dir, t.config, t.io)).toBe(1)
    expect(await urlCommand([], t.dir, t.config, t.io)).toBe(1)
  } finally {
    await t.server.close()
  }
})

test("check: request 커밋의 s3 첨부 존재 · 없는 객체 출력 exit 1 · 모두 있으면 exit 0", async () => {
  const { checkCommand, putCommand } = await import("../src/plugins/s3/commands.ts")
  const { tempRepo } = await import("./helpers.ts")
  const t = await commandSetup()
  const repo = tempRepo({ format: 1, plugins: [] })
  try {
    t.write("a.png", "aaa")
    await putCommand(["a.png"], t.dir, t.config, t.io)
    const line = t.out[0] ?? ""
    const missing = `gone.png  sha256:${"b".repeat(64)}  s3://gnam/gnam/${"b".repeat(64)}`
    const empty = (message: string) => repo.git("commit", "-q", "--no-verify", "--allow-empty", "-m", message)
    empty(`request: 첫\n\nText:\n> a\n\nAttachments:\n${line}\n문서  https://x.dev/doc`)
    const first = repo.git("rev-parse", "HEAD").out.trim()
    t.out.length = 0
    expect(await checkCommand([], repo.root, t.config, t.io)).toBe(0)
    expect(t.out).toEqual(["s3 check: 첨부 1개 확인"])
    empty(`request: 둘\n\nText:\n> b\n\nAttachments:\n${missing}`)
    const second = repo.git("rev-parse", "HEAD").out.trim()
    t.out.length = 0
    expect(await checkCommand([], repo.root, t.config, t.io)).toBe(1)
    expect(t.out).toEqual([`${second.slice(0, 7)}  gone.png  객체 없음`])
    t.out.length = 0
    expect(await checkCommand([`${first}~0`], repo.root, t.config, t.io)).toBe(0)
    expect(await checkCommand(["nope..HEAD"], repo.root, t.config, t.io)).toBe(1)
  } finally {
    repo.cleanup()
    await t.server.close()
  }
})
