### recall (과거 기록 검색)

```text
언제      단어가 기억나지 않는 결정 · 계획 · 노하우를 찾을 때. git log --grep 으로 안 걸리면 먼저
명령      npx gnam run recall search <query…> [--limit N]   커밋 · specs/ 절 · lore/ 항목, BM25 (한글 bigram)
결과      ref 만. 원문은 git show <hash> · <경로>:<줄>. superseded by <hash> = 대체된 plan → 대체한 plan 을 읽는다
```
