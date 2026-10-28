# R352 — 분석 완료 건을 개발 의뢰로 넘기기

**상태: 미착수.**

## 배경

대시보드는 원단분석 → 개발의뢰 → 현황관리 → 원가계산 → 창고관리를 한 줄로 잇는 것이 기획 의도다.
의뢰 이후 구간은 이미 이어져 있다. `request-link.ts`가 의뢰 옵션과 DD 행을 묶고, DD의 cost 밴드가 원가계산서를 가리키며, 창고 원장은 `buildFabricLedger(records, ...)`로 DD에서 파생된다.

**끊긴 곳은 분석 → 의뢰 한 군데다.** `FabricAnalysis.tsx`와 `data/fabric-analysis.ts` 어디에도 의뢰 쪽을 부르는 코드가 없다. 분석을 끝낸 건을 개발로 올릴 때 사람이 의뢰 화면에서 값을 다시 친다. 분석 번호가 의뢰에 남지 않아 "이 원단이 어느 분석에서 나왔나"를 거슬러 올라갈 수단도 없다.

`schema.ts:325`의 `AnalysisRequest.requestReqId`는 이 연결을 쓰려고 자리만 잡아 둔 필드다. 지금 저장소 전체에서 **선언 한 줄뿐이고 읽고 쓰는 곳이 없다.** 이번에 그 자리를 채운다.

## 2026-10-28 박향근 확정

1. **넘기는 버튼은 FABRIC ANALYSIS 화면에 단다.** 분석을 끝내고 바로 판단하는 실무 흐름이다.
2. **분석 결과는 스타일의 분석 밴드까지만 채운다.** 옵션 줄은 빈 채로 둔다. 개발 목표 사양은 분석값과 다를 수 있어 사람이 직접 적는다.
3. **시료 사진은 같이 옮긴다.** 의뢰 쪽 규격으로 다시 올린다.

## 왜 두 화면에 나눠 넣나

`commitRequests`는 `FabricRequest.tsx:887`의 **컴포넌트 안 지역 함수**다. 분석 화면에서 부를 수 없다.

`CLAUDE.md`의 FABRIC REQUEST 절에 이렇게 박혀 있다.

> 컴포넌트 안의 모든 요청 저장은 `commitRequests` 하나를 지난다. (...) `saveRequests`를 직접 부르는 길을 새로 만들지 말 것. 이력이 빠지고 전체 탭 편집이 뚫린다.

그래서 **분석 화면은 넘길 대상만 정해 의뢰 화면으로 보내고, 스타일을 실제로 만드는 것은 의뢰 화면이 한다.** 기존 `/request?focus=reqId`, `/development/workspace?focus=rowId`와 같은 화면 간 파라미터 방식이다.

**`saveRequests`를 분석 화면에서 직접 부르지 마라.** 공용 저장 함수를 `data/`로 새로 뽑지도 마라. 둘 다 위 규칙을 깨뜨린다.

## 동작

### 1단계 — FABRIC ANALYSIS

완료 탭에서 건을 체크하고 도구줄 **「개발 의뢰로 넘기기」** 를 누른다.

- 대상은 `state === "완료"` 인 건만이다. 선택에 다른 상태가 섞였으면 완료 건만 추리고 나머지는 건수로 알린다.
- `requestReqId`가 이미 있는 건은 **이미 넘긴 건이다. 대상에서 빼고 건수를 알린다.** 분석 1건은 의뢰 1건으로만 간다.
- 남은 대상이 없으면 `notify`로 알리고 아무것도 하지 않는다.
- 대상이 있으면 `navigate('/request?fromAnalysis=' + ids.join(','))` 로 의뢰 화면으로 보낸다.

목록에는 이미 넘긴 건을 알아볼 표시를 둔다. `requestReqId`가 있는 행의 AN 번호 옆에 작은 `REQ` 칩을 붙인다. DD MASTER Style No. 칸의 `REQ` 칩과 같은 어휘다.

### 2단계 — DEVELOPMENT REQUEST

`?fromAnalysis=` 파라미터를 받으면 확인 팝업을 띄운다.

- 팝업은 받을 보드(활성 보드 이름), 가져올 건수, 건별 AN 번호와 Source code 목록을 보인다.
- **활성 보드가 전체 탭(`ALL_BOARDS`)이거나 보관함(`ARCHIVE_VIEW`)이면 가져오기 버튼을 막고** "보드를 먼저 고르세요"라고 적는다. 전체 탭은 저장이 막히는 자리다.
- 읽기 전용(`readOnly`)이면 같이 막는다.
- 「가져오기」를 누르면 스타일을 만들어 `commitRequests(next, "create")` 한 번으로 저장한다. 건마다 따로 저장하지 마라.
- 저장이 성공하면 그 분석 건들의 `requestReqId`에 새 `reqId`를 넣어 `saveAnalysisRequests`로 저장한다. 실패하면 분석 쪽은 건드리지 않는다.
- 끝나면 `fromAnalysis` 파라미터를 지운다. 새로 고쳐도 다시 들어오지 않게 한다.
- 취소하면 아무것도 만들지 않고 파라미터만 지운다.

## 필드 매핑

`AnalysisRequest` → `RequestStyle` 1건. 건마다 스타일 하나다.

| 분석 | 의뢰 | 비고 |
|---|---|---|
| — | `reqId` | `crypto.randomUUID()` 기반 새 값 |
| — | `boardId`, `chart` | 활성 보드의 id와 이름 |
| — | `seq` | `nextBoardSeq(requests, boardId)` 부터 1씩 |
| — | `stage` | `"분석"` 고정 |
| `brand` | `brand` | |
| `contents` | `contents` | |
| `construction` | `origConstruction` | 의뢰자가 적은 원본 사양 |
| `weight` | `origWeight` | **빈 값이면 `weightRnd`를 넣는다.** 의뢰자가 중량을 안 적었으면 실측값이 유일한 값이다 |
| `yarnDescription` | `yarnAnalysis` | 분석 결과 |
| `constructionRnd` | `devConstruction` | 분석 결과 |
| `commentRnd` | `comment` | 분석 결과 |
| `inCharge` | `analyst` | |
| `requester` | `requester` | 1팀 의뢰 담당 |
| `requestType === "Urgent"` | `urgent` | |
| `imagePath`, `imageThumbPath` | 같은 두 필드 | 아래 "사진" 절 |
| `id` | `analysisId` | 새 필드 |
| `anNo` | `analysisAnNo` | 새 필드. 표시용 |

**비워 두는 것**: `garmentNo`, `developer`, `devPlan`, `remark`, `result`, `resultAt`.

- `garmentNo`는 의류 번호라 분석의 `sourceCode`와 체계가 다르다. **`sourceCode`를 여기 넣지 마라.** 사람이 적는다.
- `developer`(R&D 개발 담당)는 분석 담당과 다른 사람일 수 있다. `inCharge`를 넣지 마라.

**옵션**: 빈 옵션 1개만 만든다. `no: 1`, `optId: reqId + "#1"`, `lineId`는 새 값, 나머지 문자열 칸은 빈 문자열이다. 확정 2번에 따라 `yarnDetail`, `construction`, `weight`에 분석값을 넣지 않는다.

`createdAt`, `updatedAt`은 현재 시각이다.

## 엑셀 차트 내려받기

2026-10-28 박향근 추가 요구다. 웹으로 바로 넘기는 길과 별개로, 분석 완료 건을 **의뢰 양식 그대로의 엑셀로 받는** 길을 둔다. 1팀과 주고받는 실물 문서가 필요한 자리다.

분석 화면 도구줄에 **「엑셀 차트 내려받기」** 를 「개발 의뢰로 넘기기」 옆에 단다.

- 대상은 체크한 건 중 `state === "완료"` 인 것뿐이다. 다른 상태가 섞이면 완료 건만 추리고 건수를 알린다. 분석 결과가 없으면 양식의 분석 밴드가 빈 채로 나간다.
- **이미 넘긴 건(`requestReqId` 있음)도 대상에 넣는다.** 문서를 다시 뽑는 것뿐이다. 넘기기와 달리 막지 않는다.
- `buildRequestStyleFromAnalysis`로 `RequestStyle[]`를 만들고 그대로 `buildRequestWorkbook(styles)`(`request-template.ts:124`)에 넘긴다. **열 구성을 새로 짜지 마라.** 그 함수가 `TEMPLATE_COLUMNS` 순서로 1행 밴드, 2행 열 이름, 3행부터 데이터를 쓴다. 의뢰 화면 「양식 내려받기」와 같은 파일 구조가 나오고, 받은 파일을 의뢰 화면에 그대로 업로드할 수 있다.
- 이 경로에서는 `boardId`와 `chart`를 **빈 문자열**로 넘긴다. 보드를 고르는 단계가 없다. 업로드할 때 활성 보드로 들어간다.
- `seq`는 1부터 매긴다.
- `reqId`는 새로 만들되 **아무 데도 저장하지 않는다.** 이 버튼은 파일만 만든다.
- **`requestReqId`를 기록하지 마라.** 엑셀을 받은 것은 의뢰가 생긴 것이 아니다. 기록하면 나중에 웹으로 넘기는 길이 막힌다.
- 사진은 양식에 없다. `buildRequestWorkbook`이 원래 안 넣는다.
- 파일명은 `분석건_개발의뢰양식_YYMMDD.xlsx` 로 한다. `requestTemplateFileName`을 쓰지 마라. 그건 빈 양식 이름이다.
- 다운로드는 의뢰 화면 `downloadTemplate`(`FabricRequest.tsx:1683`)과 같은 방식으로 한다.

## 새 필드

`src/data/schema.ts`의 `RequestStyle`에 둘을 더한다. 둘 다 선택 필드다. 기존 데이터에는 없다.

```ts
  /** 이 스타일이 넘어온 분석 건 id(R352). 없으면 분석에서 오지 않은 건이다. */
  analysisId?: string
  /** 넘어온 분석 건의 AN 번호. 표시용이며 판정에 쓰지 않는다. */
  analysisAnNo?: string
```

`AnalysisRequest.requestReqId`는 이미 있다. 더하지 말고 채우기만 해라.

**`TEMPLATE_COLUMNS`(`request-template.ts`)에 이 두 열을 더하지 마라.** 엑셀 양식과 파서가 공유하는 목록이라 건드리면 기존 양식 파일이 깨진다. 웹에서만 사는 값이다. `dd-export.ts`에도 넣지 않는다.

## 역추적 표시

의뢰 화면에서 분석으로 돌아갈 길을 둔다.

- `analysisAnNo`가 있는 스타일은 **행 머리**(rowSpan 영역, 지금 `DD 연결/옵션` 수가 있는 자리)에 작은 `AN` 배지를 붙인다. 툴팁은 AN 번호다.
- 배지를 누르면 `/analysis?q=<anNo>` 로 간다.
- `FabricAnalysis.tsx`가 `?q=` 를 읽어 검색어 상태에 넣고 파라미터를 지운다. 검색 입력칸에도 그 값이 보여야 한다. 그 건 하나만 남는다.

## 사진

분석 사진을 의뢰 사진 칸으로 복사한다. **스타일을 저장한 뒤 비동기로 한다.**

1. `requestImageUrl(analysis.imagePath)` 로 원본 URL을 얻는다.
2. `fetch` 해서 `Blob`을 받고 `File`로 감싼다.
3. `uploadRequestImage(reqId, file)` 를 **profile 없이** 부른다. 기본 `"request"` 규격(원본 1200px, 썸네일 400px)으로 올라간다. `profile: "analysis"`를 넘기지 마라. 그건 의뢰서 출력용 비압축 경로다.
4. 성공하면 그 스타일의 `imagePath`, `imageThumbPath`를 받은 값으로 고쳐 `commitRequests`로 한 번 더 저장한다. 여러 건이면 **모두 끝난 뒤 한 번만** 저장한다.

제약:

- **사진 복사가 실패해도 스타일은 그대로 둔다.** 전체를 되돌리지 마라. 실패 건수만 `notify`로 알리고 "사진은 의뢰 화면에서 직접 올리세요"라고 적는다. Storage CORS나 권한으로 `fetch`가 막힐 수 있다.
- **원본 분석 사진은 지우지 않는다.** 분석 건에 그대로 남아야 한다. `deleteRequestImage`를 부르지 마라.
- 분석 사진이 없는 건은 건너뛴다.
- 사진 복사 중에는 팝업에 진행 상태를 보이고, 끝나기 전에 사용자가 화면을 떠나도 스타일은 이미 저장돼 있어야 한다.

## 파일별 조치

| 파일 | 조치 |
|---|---|
| `src/data/schema.ts` | `RequestStyle`에 `analysisId?`, `analysisAnNo?` 추가 |
| `src/data/analysis-to-request.ts` | **신규.** 매핑 순수 함수 `buildRequestStyleFromAnalysis(item, opts)` 와 대상 추리기 `pickTransferable(list, ids)`. `opts`는 `{ boardId, chart, seq }`를 받아 웹 경로와 엑셀 경로가 같은 매핑을 쓴다 |
| `src/routes/FabricAnalysis.tsx` | 도구줄 「개발 의뢰로 넘기기」와 「엑셀 차트 내려받기」 두 버튼, 대상 추리기, `/request?fromAnalysis=` 이동, `REQ` 칩, `?q=` 파라미터 읽기 |
| `src/routes/FabricRequest.tsx` | `?fromAnalysis=` 수신, 확인 팝업, `commitRequests` 저장, `saveAnalysisRequests`로 `requestReqId` 기록, 사진 복사, 행 머리 `AN` 배지 |
| `src/components/request/AnalysisImportDialog.tsx` | **신규.** 가져오기 확인 팝업 |

매핑 로직을 `data/`의 순수 함수로 빼는 이유는 두 화면이 같은 규칙을 봐야 하고, `FabricRequest.tsx`가 이미 149KB라 더 불리지 않기 위해서다.

## 하지 말 것

- `saveRequests`를 분석 화면이나 새 공용 함수에서 직접 부르지 마라. 보드 이력이 빠지고 전체 탭 편집이 뚫린다.
- 옵션 줄에 분석 사양을 채우지 마라(확정 2번).
- `sourceCode`를 `garmentNo`에 넣지 마라.
- `TEMPLATE_COLUMNS`와 `dd-export.ts`에 새 필드를 더하지 마라.
- `profile: "analysis"`로 의뢰 사진을 올리지 마라.
- 분석 원본 사진을 지우지 마라.
- 이미 넘긴 건(`requestReqId` 있음)을 다시 넘기게 열어 두지 마라. **단 엑셀 내려받기는 예외다.**
- 엑셀 내려받기에서 열 구성을 새로 짜지 마라. `buildRequestWorkbook`을 그대로 쓴다.
- 엑셀 내려받기가 `requestReqId`를 기록하거나 요청을 저장하게 하지 마라. 파일만 만든다.
- 표 격자 칸 안에 `backdrop-blur`나 번짐 그림자를 넣지 마라(`CLAUDE.md` 주의 절). `AN` 배지와 `REQ` 칩은 평범한 배경색으로 한다.
- `DialogContent`에 `relative`, `absolute`, `static`을 넘기지 마라.
- Firestore는 `undefined` 값을 거부한다. 저장 payload에 `{ ...x, key: undefined }`를 쓰지 말고 **키를 아예 빼라.** 분석 사진이 없는 건의 `imagePath`가 그 자리다.

## 검증

```
npm run build
```

`tsc --noEmit`이 포함돼 있다. 타입 오류 없이 통과하면 된다. 다른 검증은 하지 마라.

빌드 뒤 `git status --short`로 명세에 없는 파일이 바뀌지 않았는지 본다.

화면 확인은 박향근이 한다.
