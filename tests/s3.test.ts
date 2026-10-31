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
