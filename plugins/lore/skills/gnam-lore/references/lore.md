---
type: Principle
title: lore — 작업 노하우
description: 경험으로 확인한 작업 방법의 현재 상태. 위치 · 항목 형식 · 경계 · 추가 · 교체 · 승격
tags: [gnam, lore]
generated: { by: claude-code/claude-opus-5-5, at: 2026-09-27T00:00:00Z }
---

# lore — 작업 노하우

spec 이 "제품이 무엇을 해야 하는가" 의 현재 상태라면, lore 는 "일을 어떻게 하면 잘 되는가" 의 현재 상태다.
원칙은 같다. 파일에는 지금 유효한 노하우만, 바뀐 이유는 커밋에.

노하우의 재료는 이미 history 에 흩어져 있다 (impl Deviation · run.end 판정 · 조사 결과).
lore 는 그것을 모아 "지금 믿고 쓰는 것" 으로 정리한 파일이다. 커밋을 모아 맞춰 보지 않아도 되게.

## 위치 · 형식

```text
lore/README.md     인덱스. 파일마다 한 줄 '<파일>.md  <적용 조건 요약>'. 새 세션은 이것만 읽는다
lore/<주제>.md     주제별 항목. kebab-case. 하위 디렉터리 금지
```

항목 = `##` 제목 하나. 필수 필드 3개 (G18 lore/entry-fields):

```markdown
## 첫 3초에 질문을 던진다

When: 데이터 스토리 쇼츠 도입부를 쓸 때
Basis: 실측
Evidence: a1b2c3d, researches/04-storytelling.md

도입부에 결론 대신 질문. 인기 쇼츠 39편 중 31편이 이 형식.
```

```text
When       적용 조건. 이 조건이 맞을 때만 본문을 읽고 따른다
Basis      실측 = 측정 · 비교 결과가 있다 / 경험칙 = 한두 번 겪었고 측정은 없다
Evidence   근거. 커밋 hash · 자료 경로 · 작업 id (쉼표 구분). 다시 검증할 때 볼 곳
```

검증 횟수는 적지 않는다. Evidence 목록이 그 역할을 한다.

## 경계

```text
specs/          제품이 해야 할 일. 합의 · 코드 · 테스트로 성립
lore/           일하는 방법. 실측 · 경험으로 성립. 틀릴 수 있어 Basis · Evidence 필수
researches/     조사 시점의 사실 (있는 저장소만). lore 의 Evidence 가 가리키는 곳
폴더 AGENTS.md   특정 코드 폴더에 묶인 노하우 (배경 · 기각 대안). 코드 폴더에 묶이면 lore 가 아니라 여기
스킬            실행 절차. lore 를 참조하되 내용을 복사하지 않는다 (항목 제목으로 가리킨다)
```

## 추가 · 교체 · 삭제

```text
추가     경험이 생기면 바로. plan 없음. 커밋은 chore: (lore 변경만 따로), 본문에 무엇을 겪었는지
교체     틀렸거나 더 나은 방법 → 항목을 고친다. 과거 서술 ("예전엔 A 였으나") 금지. 이유는 커밋에
삭제     더 이상 맞지 않으면 지운다
승격     검사로 만들 수 있으면 저장소 검사 · 파이프라인 동작이면 spec · 절차면 스킬. 옮긴 뒤 lore 에서 지운다
```

lore 는 prompt 로만 전달된다. 검사로 강제할 수 있게 되면 승격이 기본이다.

```bash
cat lore/README.md                      # 인덱스
git log -p -- lore/<주제>.md            # 노하우가 바뀐 과정
git log --oneline -- lore/              # lore 변경 커밋
```
