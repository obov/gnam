// 앱 · bridge · 테스트를 dist/ 로 묶는다 (CommonJS: pixel bootstrap 이 require 로 entry 를 연다).
// node build.mjs          → dist/main.cjs, dist/bridge.cjs
// node build.mjs --tests  → 위 + dist/tests/*.spec.cjs (claude plugin test 가 *.test.ts 를 집어 가지 않게 spec)
import { readdirSync, rmSync } from 'node:fs'
import { build } from 'esbuild'

const tests = process.argv.includes('--tests')
rmSync('dist', { recursive: true, force: true })

const common = {
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  jsx: 'automatic',
  // pixel (native · electron) 과 react 는 node_modules 그대로: 앱과 pixel 이 같은 react 를 써야 한다
  external: ['@zenbu-labs/pixel', '@zenbu-labs/pixel/*', 'electron', 'react', 'react/*', 'react-test-renderer'],
  tsconfig: 'tsconfig.json',
  logLevel: 'warning',
  sourcemap: 'inline',
}

await build({ ...common, entryPoints: { main: 'src/main.tsx', bridge: 'src/bridge.ts' }, outdir: 'dist', outExtension: { '.js': '.cjs' } })

if (tests) {
  const entries = readdirSync('tests').filter(f => /\.spec\.tsx?$/.test(f)).map(f => `tests/${f}`)
  await build({ ...common, entryPoints: entries, outdir: 'dist/tests', outExtension: { '.js': '.cjs' } })
}
