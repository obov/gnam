---
okf_version: "0.2"
---

# Git-Native Agent Memory

> 파일에는 현재 상태를, commit에는 상태가 변한 이유를 기록한다.

처음이면 개요 → 커밋 종류 → Agent 프로토콜 순서. 나머지는 필요할 때.

* [개요](overview.md) - 현재 상태 (spec · 코드 · 테스트) 와 과거 맥락 (git history) 의 구분. 미구현: · 미결: 고정 표기
* [Agent 프로토콜](agent-protocol.md) - 세션 시작 · 작업 · 중단 · 재개 (인계 메모) 절차의 원본
* [ADR와의 관계](adr.md) - ADR · plan · impl · spec 의 결정 기록 범위 구분

# 커밋

* [커밋](commits/) - 커밋 종류별 제목 · 본문 형식과 커밋 단위


# 참조

* [추적 명령](reference/git-commands.md) - 질문 → git 명령, 양방향 추적, 추적이 끊기는 지점
