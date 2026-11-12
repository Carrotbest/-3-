# R423 옵션에 FINISH 열을 더한다

상태: 구현 완료, 빌드 통과, 화면 확인 미완. 코덱스 사용량 한도로 클로드가 직접 시공했다(2026-11-12).

2026-11-12 박향근 요구다.

> 대시보드에 공정부분(FINISH)도 항목 추가했으면 좋겠다. PRINT, BRUSH 등을 입력해야 옵션이 구분이 되는데 현재는 YARN DETAIL에 붙여서 입력하다보니 깔끔하지 않다.

## 한 줄 요약

DEVELOPMENT REQUEST 옵션에 `FINISH` 칸 하나를 더한다. 자유 입력이고, DD로 넘어갈 때 DD의 Finishing A 칸으로 들어간다.

---

## 이미 조사한 사실. 다시 조사하지 마라

저장소를 다시 뒤지지 마라. 아래는 클로드가 코드를 열어 확인한 것이다.

1. **DD MASTER에는 받을 칸이 이미 있다.** `DevelopmentMasterSheet.tsx:341~344`의 Finishing A, B, C, D 네 열이고 값은 `tech.finishingSlots.a~d`(`schema.ts:37`)다. 자유 입력이다. 새로 만들 것이 없다.

2. **`tech.finishing`(문자열 배열, `schema.ts:35`)은 따로다.** 엑셀 업로드 파서(`xlsx-parsers.ts:602`)만 채우고 `Development.tsx:1320`이 「Finishing A~D」로 보여 준다. **DD MASTER의 인라인 편집도 `finishingSlots`만 고치고 이 배열은 건드리지 않는다**(`DevelopmentMasterSheet.tsx:844`의 경로 표). 그러니 이번에도 `finishingSlots.a`만 쓴다. 두 값을 맞추는 일은 이번 범위가 아니다.

3. **REQUEST의 Dyeing 칸은 자유 입력이다**(`FabricRequest.tsx:616`의 `Input`). 그래서 지금 팀이 `PRINT(DENIM)`, `BACK BRUSH (PEACH)` 같은 가공 내용을 그 칸에 적고 있다. **DD의 Dyeing Side는 여섯 값으로 닫혀 있고**(R281) R422가 `matchDyeingSide`로 거르므로, 그 값들은 DD로 넘어갈 때 빈 칸이 된다. FINISH 칸이 생기면 제자리를 찾는다. **Dyeing 칸을 목록으로 닫지 마라. 이번 범위가 아니다.**

4. **선택 열을 더하는 방식은 R388, R389에 이미 있다.** `TEMPLATE_COLUMNS`에 `optional: true`로 넣으면 `PRESERVE_OPTION_IF_ABSENT`(`request-template.ts:517`)가 자동으로 걸려, 그 열이 없는 옛 양식으로 재업로드해도 웹에 적은 값을 지우지 않는다. **그 장치를 새로 만들지 말고 그대로 쓴다.**

5. **R422로 만든 옵션 보충 경로(`request-option-sheet.ts`)에도 같이 더해야 한다.** 안 더하면 옵션 양식으로는 FINISH를 못 채운다.

6. **`dyeingMethod`를 만지는 자리가 저장소 전체에서 열일곱 군데다.** 아래 표가 그 전부다. `finish`는 그 바로 옆에 같은 꼴로 들어간다. 이 목록 밖을 찾아다니지 마라.

| 파일 | 줄 | 내용 |
|---|---|---|
| `FabricRequest.tsx` | 113 | 옵션 밴드 열 정의 |
| `FabricRequest.tsx` | 274 | `blankOption` 기본값 |
| `FabricRequest.tsx` | 290 | `OPTION_CHANGE_LABEL` |
| `FabricRequest.tsx` | 473 | `setOption` 키 유니온 |
| `FabricRequest.tsx` | 616 | 신규 의뢰 창 입력칸 |
| `FabricRequest.tsx` | 680 | 편집 가능 열 분기 |
| `FabricRequest.tsx` | 1202 | 옵션이 채워졌는지 판정 |
| `FabricRequest.tsx` | 2067 | `rawValue` 분기 |
| `request-template.ts` | 77 | 양식 열 정의 |
| `request-template.ts` | 137 | `cellOf` 분기 |
| `request-template.ts` | 404 | `optionKeys` 배열 |
| `request-template.ts` | 496 | 파서의 옵션 만들기 |
| `request-option-sheet.ts` | 15 | 옵션 양식 열 |
| `request-option-sheet.ts` | 29 | `OptionSheetRow` |
| `request-option-sheet.ts` | 48 | `optionValue` |
| `request-option-sheet.ts` | 137 | 옵션 양식 파서 |
| `request-option-sheet.ts` | 168, 251, 289 | 변경 키 유니온, 비교 대상, `blankOption` |

---

## 뒤집지 말 것

- **FINISH는 자유 입력이다. 목록으로 닫지 마라.** `BACK BRUSH (PEACH)`, `PRINT (INDIGO, PIGMENT)`, `(FEEDER STP) max 5.3cm`처럼 괄호 안 세부가 붙는다. `matchConstruction`이나 `matchCompany` 같은 검증을 걸지 마라.
- **가공과 편직 사양을 한 칸에 같이 적는다**(2026-11-12 박향근 확정). 칸을 둘로 가르지 마라.
- **열 `id`와 `key`는 `finish` 하나다.** 나중에 바꾸면 저장된 열 너비(`fabric.request.colWidths`)와 숨김 상태(`fabric.request.hiddenCols`)가 버려진다.
- **스키마에서 `finish?: string`이다.** 옛 데이터에 없다. 화면은 `?? ""`로 읽고, 값을 만드는 자리(`blankOption`, 파서, `buildRequestStyleFromAnalysis`)는 늘 `""`를 넣는다. **`undefined`를 넣지 마라**(R340).
- **`DevTechnical.finish`(`schema.ts:78`, `{ brush, chemical }`)와 이름이 겹치지만 다른 것이다.** 그 필드를 건드리지 마라.
- **분석에서 의뢰로 넘어올 때 FINISH는 빈칸이다.** 분석값과 개발 목표는 다르다. 옵션 사양과 같은 원칙이다(R388).
- Firestore는 값이 `undefined`인 키를 거부한다(R340).

---

## 파일별 조치

| 파일 | 조치 |
|---|---|
| `src/data/schema.ts` | `RequestOption.finish?: string` |
| `src/routes/FabricRequest.tsx` | 열 하나, 위 표의 일곱 자리 |
| `src/data/request-template.ts` | 양식 열 하나, 위 표의 네 자리 |
| `src/data/request-option-sheet.ts` | 옵션 양식 열 하나, 위 표의 여섯 자리 |
| `src/data/request-link.ts` | DD 연결 두 경로 |

---

## 1. `src/data/schema.ts`

`RequestOption`의 `dyeingMethod` 바로 아래에 넣는다.

```ts
  /**
   * FINISH. 가공과 편직 사양을 함께 적는 자유 입력 칸이다(R423).
   * PRINT, BRUSH 같은 가공과 FEEDER STP 같은 편직 사양을 한 칸에 적는다(2026-11-12 확정).
   * DD 로 넘어갈 때 Finishing A(`tech.finishingSlots.a`)로 들어간다. 옛 데이터에는 없다.
   */
  finish?: string
```

## 2. `src/routes/FabricRequest.tsx`

**열 정의(113행 아래).** `dyeingMethod` 다음, `remark` 앞이다. Remark는 스타일 단위 병합 칸이라 그 앞에 서야 옵션 열끼리 붙는다.

```ts
    { id: "finish", label: "Finish", width: 140, scope: "option" },
```

나머지 여섯 자리는 `dyeingMethod`가 하는 것을 그대로 따라 한다.

- 274행 `blankOption`에 `finish: ""`
- 290행 `OPTION_CHANGE_LABEL`에 `finish: "FINISH"`
- 473행 `setOption` 키 유니온에 `| "finish"`
- 616행 신규 의뢰 창에 입력칸 하나. `placeholder="Finish"`, `value={option.finish ?? ""}`
- 680행 편집 가능 열 분기에 `case "finish":` 추가
- 1202행 `filled` 배열에 `option.finish` 추가
- 2067행 `rawValue`에 `case "finish": return option.finish ?? ""`

시공하면서 확인한 정정: `DEFAULT_HIDDEN`은 `GROUP_COLUMNS`에서 자동으로 만들어진다(`FabricRequest.tsx:145`). 열을 더하면 저절로 들어가므로 손으로 넣을 것이 없다.

## 3. `src/data/request-template.ts`

**77행 아래에 열을 넣는다.** `optional: true`다. 그래야 이 열이 없는 옛 양식 파일을 계속 읽고, `PRESERVE_OPTION_IF_ABSENT`가 기존 값을 지킨다.

```ts
  { band: "옵션", head: "FINISH", width: 20, scope: "option", key: "finish", optional: true, screenWidth: 140 },
```

- 137행 `cellOf`에 `case "finish": return option ? option.finish || null : null`
- 404행 `optionKeys` 배열에 `"finish"` 추가. 그 줄이 있는 행을 옵션 줄로 볼지 정하는 목록이다.
- 496행 옵션 만들기에 `finish: asText(at(row, "finish"))`

## 4. `src/data/request-option-sheet.ts`

`DYEING METHOD` 다음, `CO` 앞이다.

- 15행 `OPTION_COLUMNS`에 `{ head: "FINISH", key: "finish", width: 22 }`
- 29행 `OptionSheetRow`에 `finish: string`
- 48행 `optionValue`에 `if (key === "finish") return option.finish ?? ""`
- 137행 파서에 `finish: asText(at(row, "finish"))`
- 168행 `OptionFieldChange["key"]` 유니온에 `| "finish"`
- 251행 비교 대상 배열에 `["finish", row.finish]` 추가. **`construction`이나 `co`처럼 목록 검증을 걸지 마라.** 자유 입력이다.
- 289행 `blankOption`에 `finish: ""`

`optionText`(199행)는 키로 값을 읽는 일반 함수라 고칠 것이 없다.

## 5. `src/data/request-link.ts` — DD로 넘긴다

두 경로 모두 **빈 칸일 때만** 넣는다. DD에 이미 적힌 가공을 덮지 마라.

**`requestToIntakeRecords`**(249행 부근). 새 레코드라 Finishing A가 비어 있다.

```ts
        ...(option.finish?.trim() ? { finishingSlots: { ...record.tech?.finishingSlots, a: option.finish.trim() } } : {}),
```

`tech` 객체 안, `yarnDetail` 옆에 넣는다.

**`applyRequestLinks`의 빈 칸 채우기**(99행 부근). 기존 DD 행이라 값이 있을 수 있다.

```ts
    const finishEmpty = !String(record.tech?.finishingSlots?.a ?? "").trim()
```

`fillEmpty && finishEmpty && option.finish?.trim()`일 때만 같은 모양으로 얹는다.

**`tech.finishing` 배열은 건드리지 마라.** 위 조사 2번을 보라.

---

## 검증

```
npm run build
```

`tsc --noEmit`이 들어 있다. **모든 수정을 마친 뒤 한 번만 돌려라.**

끝나면 `git status --short`로 바뀐 파일이 위 표와 같은지 본다. 그 밖의 파일이 바뀌었으면 보고하라.

워킹트리에 R420, R421, R422 미커밋 변경이 이미 있다. 그 파일들을 되돌리거나 건드리지 마라.

화면 확인은 박향근이 한다. 개발 서버를 띄우거나 로그인하지 마라.

---

## 하지 말 것

- FINISH에 목록 검증이나 드롭다운을 붙이지 마라. 자유 입력이다.
- 칸을 가공과 편직으로 가르지 마라.
- `Dyeing` 칸을 목록으로 닫지 마라. 이번 범위가 아니다.
- `tech.finishing` 배열과 `finishingSlots`를 맞추는 코드를 넣지 마라.
- `DevTechnical.finish`(`{ brush, chemical }`)를 건드리지 마라. 이름만 같다.
- 커밋, 푸시, `firebase deploy` 금지. 워킹트리 변경까지만 한다.
- 사용자가 만든 기존 변경을 `git reset`이나 `git checkout`으로 되돌리지 마라.
- 이 저장소는 공개 저장소다. 실데이터, 단가, 협력사명, 개인 메일을 코드나 문서에 넣지 마라.
- `public/data` 아래 JSON을 열지 마라. `feed.json`은 2.8MB다.
- `legacy/`, `legacy-vanilla/`, `backup/`은 읽지 마라.
- 같은 오류를 두 번 고쳐 실패하면 멈추고 보고하라.
- 마지막 보고는 수정 파일, 빌드 결과, 판단이 필요한 지점만 적어라. 바꾼 코드를 다시 붙이지 마라.
