#!/usr/bin/env node
// checkout (src 있음) = src 를 타입 제거 실행 (node >= 22.18 · bun). 배포본 (files 에 src 없음) = dist (tsc 결과, node >= 20 · bun)
import { existsSync } from "node:fs"
const src = new URL("../src/cli.ts", import.meta.url)
const { main } = await import(existsSync(src) ? src.href : new URL("../dist/cli.js", import.meta.url).href)
process.exitCode = await main(process.argv.slice(2))
