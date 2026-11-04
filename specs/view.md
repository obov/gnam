# view — status 데이터를 보여 줄 탭 정의 (프로젝트 · plugin)

`gnam status` 를 읽어 화면에 그리는 도구 (gnam-view 등) 가 무엇을 탭으로 보여 줄지 선언한다.
탭 하나 = status 트리의 경로 하나 + 거르기 + 표시 방법. 프로젝트는 gnam.json 에, plugin 은 status 섹션에 같은 형식으로 쓴다.
gnam 은 그리지 않는다. 정의를 검사하고 모아서 `views` 로 낸다.

## 탭 정의

```text
id       탭 식별자. 소문자 · 숫자 · '-' (1-32자). 같은 목록 안에서 유일
title    탭 이름 (1-24자)
source   status 경로 (gnam status <경로> 와 같은 문법). 값이 배열 또는 객체여야 그릴 수 있다
where    (선택) 거르기. { "<키 점 경로>": <스칼라> }. 모두 만족 (AND). 비교는 --where 와 같음 (JSON 스칼라의 문자열 표현)
view     list | table | progress
fields   (선택) 표시에 쓸 키 점 경로. title · badge · meta · detail · done · total · columns (table 의 열 목록)
icon     (선택) 아이콘 이름. 그리는 도구가 모르면 무시
```

view 별 fields:

```text
list      title (기본: 첫 문자열 키) · badge · meta · detail
table     columns (기본: 첫 원소의 스칼라 키 최대 4개)
progress  title · done · total (원소마다 done/total 막대)
```

## 프로젝트 탭 (gnam.json)

```json
{ "format": 1, "plugins": [], "view": { "tabs": [
  { "id": "risks", "title": "위험", "source": "trace.items", "where": { "kind": "risk" }, "view": "list",
    "fields": { "title": "text", "badge": "kind", "meta": "sha" } }
] } }
```

- `view` 키는 선택. 없으면 프로젝트 탭 없음
- 커밋되는 공유 설정이다. 탭 보이기 · 순서 · 아이콘 같은 개인 화면 설정은 그리는 도구가 각자 저장한다 (gnam.json 에 쓰지 않는다)

## plugin 탭 (status 섹션)

plugin 의 `status.sections.<이름>` 에 `view` 를 더하면 그 섹션이 탭이 된다.

```text
view     { title · view · fields · icon · where }   id · source 는 쓰지 않는다
id       <plugin id>-<섹션 이름>
source   plugins.<plugin id>.sections.<섹션 이름>
```

- deep 섹션도 탭이 될 수 있다. 그리는 도구가 source 경로로 직접 고르면 계산된다
- 내장: lore `entries` (list, title = summary, meta = file) · multi-agent `runs` (list)

## gnam status

```text
views    [{ id · title · source · where · view · fields · icon · owner }]
         owner = project (gnam.json) | <plugin id>. 프로젝트 탭 먼저, 그다음 plugin 순서
```

- 검사 실패한 정의는 views 에서 빼고 problems 에 `source: config` 로 이유를 남긴다 (exit 0, readConfig 는 실패하지 않는다)
- 검사: 필수 키 · 형식 · id 중복 · view 값 · source 경로 문법 · where 값이 스칼라
- source 경로가 실제 트리에 있는지는 검사하지 않는다 (plugin 이 꺼지면 사라질 수 있음). 그리는 도구가 없음을 표시한다
- 스키마 (`--schema`) 에 views 추가. schema 판은 그대로 (키 추가)

## 범위 밖

- plugin 명령 결과 (`gnam run <plugin> <명령> --json`) 를 source 로 쓰기 (명령 실행 비용 · 인자 전달 방식이 정해지지 않음)
- 탭 정렬 · 그룹 · 집계
