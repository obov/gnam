### release (버전 · 태그)

```text
release:    버전 변경 커밋. 'Package: <name> <version>' 절 = GitHub Release 본문. 대상 = gnam.json release.targets
            수준은 직전 release 이후 커밋 근거에서 계산, 호환성 깨짐은 plan · impl 본문 Breaking:
명령        npx gnam run release status | bump | publish <before> <sha> (CI)
규약        .agents/skills/gnam-release/references/release.md
```
