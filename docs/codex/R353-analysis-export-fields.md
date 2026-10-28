# R353 — 분석 엑셀 내려받기 보완

**상태: 구현 완료, 빌드 통과, 화면 확인 대기.** 2026-10-28에 코덱스가 `-s danger-full-access`로 두 파일을 고쳤고 클로드가 `npm run build`를 다시 돌려 통과를 확인했다. R352도 구현과 빌드를 마쳤다.

## 배경

2026-10-28에 박향근이 R352의 「엑셀 차트 내려받기」로 받은 파일을 열어 보고 지적했다.

1. **Garment Number가 비어 있다.** 분석의 Source code를 넣어 달라.
2. **순번 열 이름을 「스타일」로 바꿔 달라.**

R352에서 `garmentNo`를 일부러 비웠다. 의류 번호와 분석 Source code는 체계가 다르다고 판단해 사람이 적게 두었다. **그 판단을 박향근이 뒤집었다. Source code를 넣는다.**

## 1. Garment Number에 Source code를 넣는다

`src/data/analysis-to-request.ts`의 `buildRequestStyleFromAnalysis`에서 지금 이렇게 돼 있다.

```ts
    garmentNo: "",
```

이것을 `item.sourceCode`로 바꾼다. 주석의 "`sourceCode`를 여기 넣지 마라" 문장도 함께 고친다. 남겨 두면 다음 사람이 되돌린다.

**영향을 함께 볼 것.** 이 값은 엑셀에만 쓰이는 것이 아니다.

- 웹으로 바로 넘기는 길(`/request?fromAnalysis=`)에도 같은 함수가 쓰인다. 스타일의 Garment No. 칸에 Source code가 들어간다. 그것이 지금 의도다.
- 엑셀 **업로드** 병합 키가 `boardId + Garment No.`다. Garment No.가 비어 있던 동안에는 업로드가 매번 새 스타일을 만들었다. 이제 같은 Source code를 가진 파일을 두 번 올리면 같은 스타일로 합쳐진다. 의도한 동작이다.
- `parseRequestWorkbook`은 **Garment No.가 채워진 행을 스타일 행으로 본다.** 그 아래 빈 행은 직전 스타일의 옵션 줄이다. 값이 들어가면서 이 판정이 제대로 선다.

## 2. 「순번」을 「스타일」로 바꾼다

`src/data/request-template.ts:38`의 열 정의다.

```ts
  { band: "기본", head: "순번", width: 6, scope: "style", key: "seq" },
```

`head`를 `"스타일"`로 바꾼다. 화면 쪽 열 이름은 손대지 않는다. 이 요구는 엑셀 양식 이야기다.

**그냥 바꾸면 기존 양식 파일의 업로드가 통째로 막힌다.** `parseRequestWorkbook`(`request-template.ts:284` 근처)이 2행 열 이름을 정확히 대조하고, `optional`이 아닌 열을 못 찾으면 예외를 던진다.

```ts
    const found = header.findIndex((head) => head === column.head)
    if (found >= 0) indexByKey.set(column.key, found)
    else if (!column.optional) throw new Error(`양식이 다릅니다. 2행에 "${column.head}" 열이 없습니다. ...`)
```

`seq`는 `optional`이 아니다. 이미 내려받아 둔 파일은 2행이 "순번"이라 `양식이 다릅니다. 2행에 "스타일" 열이 없습니다.`로 **파일 전체가 거부된다.**

그래서 **옛 이름을 함께 받는 별칭을 둔다.**

`TemplateColumn`에 필드를 더한다.

```ts
  /** 이름을 바꾸기 전 양식 파일을 계속 읽기 위한 옛 열 이름(R353). 내려받기는 `head`만 쓴다. */
  aliases?: readonly string[]
```

`seq` 열에 `aliases: ["순번"]`을 준다. 파서의 찾기 한 줄을 이렇게 고친다.

```ts
    const names = [column.head, ...(column.aliases ?? [])]
    const found = header.findIndex((head) => names.includes(head))
```

내려받기(`buildRequestWorkbook`)는 `head`만 쓰므로 새 파일에는 "스타일"로 나간다.

**`optional`로 바꿔 넘어가지 마라.** 그러면 순번 열이 아예 없는 파일도 조용히 읽혀서 번호가 행 순서로 밀려 들어간다.

## 하지 말 것

- 열 **순서**를 바꾸지 마라. 1행 밴드 병합과 어긋난다.
- 다른 열 이름을 건드리지 마라. 이번 건은 `seq` 하나다.
- 화면(`FabricRequest.tsx`)의 열 라벨을 바꾸지 마라. 요구는 엑셀 양식에 대한 것이다.
- `dd-export.ts`와 `TEMPLATE_COLUMNS` 외의 파일에 새 열을 더하지 마라.
- Construction(개발)과 Comment 칸은 **이번에 손대지 않는다.** 매핑은 이미 `constructionRnd` → `devConstruction`, `commentRnd` → `comment`로 맞다. 비어 나온 것은 그 분석 건의 결과값이 비었기 때문으로 보이며, 박향근이 화면에서 확인 중이다. 원본 `construction`을 개발 칸에 복사하는 식으로 메우지 마라. 모르는 값을 넣느니 빈칸이다.

## 검증

```
npm run build
```

통과하면 된다. 다른 검증은 하지 마라.

빌드 뒤 `git status --short`로 명세에 없는 파일이 바뀌지 않았는지 본다.

화면 확인은 박향근이 한다. 분석 완료 탭에서 건을 체크하고 「엑셀 차트 내려받기」를 눌러 D열에 Source code가 들어오는지, A열 2행 이름이 「스타일」인지 본다.
