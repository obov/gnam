#!/usr/bin/env node
// 배포본 = dist (tsc 결과, node · bun 공통). checkout 에서 빌드 전이면 src (node >= 22.18 · bun 의 타입 제거 실행)
import { existsSync } from "node:fs"
const dist = new URL("../dist/cli.js", import.meta.url)
const { main } = await import(existsSync(dist) ? dist.href : new URL("../src/cli.ts", import.meta.url).href)
process.exitCode = await main(process.argv.slice(2))
