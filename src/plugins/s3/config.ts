/**
 * gnam.json "s3" 설정 · 환경 변수 자격 (specs/s3.md 설정). 자격은 gnam.json 에 두지 않는다.
 */
export interface S3Config {
  endpoint: string
  bucket: string
  region: string
  prefix: string
  pathStyle: boolean
  maxBytes: number
}

export interface Credentials {
  accessKeyId: string
  secretAccessKey: string
  sessionToken?: string
}

export const S3_DEFAULTS = { region: "us-east-1", prefix: "gnam/", pathStyle: true, maxBytes: 104857600 }
const MAX_PUT = 5 * 1024 ** 3
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"])
const SECRET_KEY = /access.?key|secret|token|password/i

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v)

export function s3ConfigProblems(value: unknown): string[] {
  if (value === undefined) return []
  if (!isObject(value)) return ["s3 = 객체"]
  const problems: string[] = []
  for (const key of Object.keys(value))
    if (SECRET_KEY.test(key)) problems.push(`s3.${key}: 자격은 gnam.json 에 두지 않는다 (GNAM_S3_ACCESS_KEY_ID · GNAM_S3_SECRET_ACCESS_KEY 환경 변수)`)
  const { endpoint, bucket, region, prefix, pathStyle, maxBytes } = value
  if (typeof endpoint !== "string") problems.push("s3.endpoint 필수 (https URL)")
  else {
    let url: URL | null = null
    try {
      url = new URL(endpoint)
    } catch {
      problems.push(`s3.endpoint URL 아님: ${endpoint}`)
    }
    if (url !== null && url.protocol !== "https:" && !(url.protocol === "http:" && LOCAL_HOSTS.has(url.hostname)))
      problems.push(`s3.endpoint 는 https (http 는 localhost 만): ${endpoint}`)
  }
  if (typeof bucket !== "string" || bucket === "") problems.push("s3.bucket 필수")
  if (region !== undefined && (typeof region !== "string" || region === "")) problems.push("s3.region = 문자열")
  if (prefix !== undefined && (typeof prefix !== "string" || !prefix.endsWith("/") || prefix.startsWith("/")))
    problems.push("s3.prefix = '/' 로 끝나고 '/' 로 시작하지 않는 문자열")
  if (pathStyle !== undefined && typeof pathStyle !== "boolean") problems.push("s3.pathStyle = true | false")
  if (maxBytes !== undefined && (typeof maxBytes !== "number" || !Number.isInteger(maxBytes) || maxBytes < 1 || maxBytes > MAX_PUT))
    problems.push(`s3.maxBytes = 1 ~ ${MAX_PUT} 정수`)
  return problems
}

/** 형식이 맞으면 기본값을 채운 설정, 없거나 틀리면 null */
export function s3ConfigOf(value: unknown): S3Config | null {
  if (value === undefined || s3ConfigProblems(value).length > 0 || !isObject(value)) return null
  return { ...S3_DEFAULTS, ...(value as Partial<S3Config>), endpoint: String(value["endpoint"]).replace(/\/+$/, "") } as S3Config
}

/** GNAM_S3_* 우선, 없으면 AWS_*. 키 둘 중 하나라도 없으면 null */
export function credentialsFrom(env: Record<string, string | undefined>): Credentials | null {
  for (const prefix of ["GNAM_S3_", "AWS_"]) {
    const accessKeyId = env[`${prefix}ACCESS_KEY_ID`]
    const secretAccessKey = env[`${prefix}SECRET_ACCESS_KEY`]
    if (accessKeyId && secretAccessKey) {
      const sessionToken = env[`${prefix}SESSION_TOKEN`]
      return sessionToken ? { accessKeyId, secretAccessKey, sessionToken } : { accessKeyId, secretAccessKey }
    }
  }
  return null
}

export const CREDENTIAL_HELP =
  "S3 자격 없음. GNAM_S3_ACCESS_KEY_ID · GNAM_S3_SECRET_ACCESS_KEY (· GNAM_S3_SESSION_TOKEN) 또는 AWS_ACCESS_KEY_ID · AWS_SECRET_ACCESS_KEY 를 설정한다"
