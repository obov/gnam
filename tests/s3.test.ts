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
