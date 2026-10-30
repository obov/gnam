# recall — 과거 기록 lexical 검색

opt-in 내장 plugin `recall`. 단어가 기억나지 않는 결정 · 계획 · 노하우의 위치를 찾는다.
검색 결과는 출처 참조만 준다. 내용과 근거는 `git show <hash>` · 파일에서 읽는다.

## 명령

```text
gnam run recall search <query…> [--limit N]
```

- 미구현: `--limit` 기본 10. N 은 양의 정수, 아니면 오류 (exit 1)
- 미구현: query 가 비거나 토큰이 하나도 없으면 사용법 출력 · exit 1
- 미구현: 결과 없음 = `결과 없음` 출력 · exit 0

## 검색 대상

문서 하나 = 아래 단위 하나. 매 실행마다 저장소에서 다시 읽는다 (영속 인덱스 없음).

```text
커밋   HEAD 에서 도달 가능한 모든 커밋의 제목 + 본문        ref = 짧은 hash (7자리, 겹치면 더 길게)
spec   specs/*.md (README.md 제외) 의 ## 절 + 머리 절 (첫 ## 전, # 제목 외 내용이 있을 때)   ref = <경로>:<시작 줄>
lore   lore/*.md (README.md 제외) 의 ## 항목                     ref = <경로>:<시작 줄>
```

- spec · lore 는 작업 트리 파일 (git 추적 · 미추적, 무시 제외) 을 읽는다
- 코드 블록 안 `## ` 줄은 절 경계가 아니다

## 토큰화

한글 문장의 조사 · 복합명사 · 2음절 명사를 사전 없이 맞추기 위한 규칙.

```text
한글 구간      연속 한글 (가-힣 · ㄱ-ㅎ · ㅏ-ㅣ) 을 겹치는 2글자 (bigram) 로. 1글자 구간은 그 글자
그 외 구간     영문 · 숫자 연속 (a-z · 0-9) 을 소문자 단어 하나로. 나머지 문자는 경계
```

```text
재시도를 추가        →  재시 시도 도를 추가
handoff.md 경로는    →  handoff md 경로 로는
plan커밋             →  plan 커밋
```

- 미구현: 문서와 query 에 같은 토큰화를 쓴다

## 순위

- 미구현: BM25 (k1 = 1.2, b = 0.75). 점수 높은 순, 같으면 수집 순서 (커밋 새 것부터 → spec → lore, 파일은 경로 · 줄 순)
- 미구현: 다른 커밋 본문의 `Supersedes: <hash>` 가 가리키는 plan 커밋은 `superseded by <hash>` 를 함께 표시

## 출력

결과 한 줄 = 참조 · 종류 · 제목.

```text
<ref>  <commit|spec|lore>  <제목>
```

```text
제목   커밋 = 제목 줄 · spec · lore = ## 제목 (머리 절은 파일의 첫 # 제목, 없으면 경로)
```

## 범위 밖

- Deferred: 형태소 분석 (Kiwi). 모델 약 100MB 별도 다운로드
- Deferred: embedding 검색. 동의어 · 한영 혼용 (`인증` ↔ `auth`) 은 lexical 검색으로 못 찾는다
- Deferred: 영속 인덱스 · 캐시. 규모가 커져 실행 시간이 문제될 때
