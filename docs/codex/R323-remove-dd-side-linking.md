# R323 DD MASTER의 요청 연결 생성 경로 삭제

상태: **미착수.** 2026-10-08 박향근 지시.

## 결정

**요청과 DD의 연결은 REQUEST 화면에서만 만든다. 일방향이다.** DD MASTER에서 새로 연결하는 길을 전부 닫는다.

연결 생성 경로가 양쪽에 있어서 규칙이 어긋나 있었다. DD 쪽은 "이미 다른 DD 행에 연결된 옵션은 고를 수 없다"로 막는데 REQUEST 쪽에는 그 가드가 없어 옵션 하나에 DD 행이 겹쳐 붙었다(R322에서 바꿔치기로 고쳤다). 입구를 하나로 줄여 이런 비대칭이 다시 생기지 않게 한다.

## 지우는 것과 남기는 것

| # | 위치 | 기능 | 조치 |
|---|---|---|---|
| 1 | 도구줄 `요청 연결 도우미` | 미연결 DD 행 일괄 연결 | **삭제** |
| 2 | 우클릭 `DEVELOPMENT REQUEST 연결…` | 선택 행과 옵션 짝 표 | **삭제** |
| 3 | 우클릭 `요청 폴더에서 찾아 연결…` | 행 1개를 폴더에서 찾아 연결 | **삭제** |
| 4 | 우클릭 `요청 연결 해제` | 선택 행 연결 끊기 | **유지** |
| 5 | 도구줄 `끊어진 연결 N` | 사라진 옵션을 가리키는 연결 정리 | **유지** |
| 6 | 신규 접수 창 `FABRIC REQUEST에서 불러오기` | 요청 옵션으로 DD 접수 행 생성 | **유지** |

4번을 남기는 이유는 DD에서 여러 행을 골라 한 번에 끊는 일을 REQUEST에서 못 하기 때문이다. 5번은 R314에서 만든 유지보수 기능이고 안 끊으면 그 행이 요청 쪽 후보에서 사라진다. 6번은 요청에서 DD를 만드는 것이라 방향이 반대다.

## 하지 말 것과 그 이유

- **`src/components/dd/RequestPickerDialog.tsx`를 삭제하지 마라.** 이 컴포넌트는 두 군데에서 쓴다. 하나는 지우는 2번(`mode="link"`)이고 다른 하나는 **남기는 6번 신규 접수 불러오기**(`onConfirm={importRequest}`)다. 파일을 지우면 신규 접수가 깨진다. **사용처 하나만 떼고 파일은 그대로 둔다.**
- **`src/components/dd/RequestPickerDialog.tsx`의 내부 코드를 고치지 마라.** `mode="link"` 분기가 안 쓰이는 채로 남는다. 그건 둬도 된다. 지금 건드리면 신규 접수가 같이 위험해진다.
- **`src/data/request-link.ts`를 수정하지 마라.** `buildLinkHelperGroups`와 `HelperGroup`과 `HelperStatus`가 안 쓰이게 되지만 그대로 둔다. 이 파일은 REQUEST와 DD와 끊어진 연결 정리가 같이 본다. 지금 손대면 되돌리기 범위가 커진다.
- **`src/data/request-link-match.ts`를 지우지 마라.** REQUEST 쪽 `DdCandidateDialog`가 쓴다.
- **`removeRequestLinks`와 `clearBrokenRequestLinks`를 지우지 마라.** 4번과 5번이 쓴다.
- **`requestToIntakeRecords`와 `importRequest`를 지우지 마라.** 6번이 쓴다.
- **`requestLinkIndex`와 `resolveRequestLink`를 지우지 마라.** Style No. 칸의 `REQ` 배지가 쓴다.
- **REQUEST 화면(`src/routes/FabricRequest.tsx`)을 건드리지 마라.** 이번 작업은 DD MASTER만이다.
- **워킹트리에 R321 미완성 작업이 있다. 건드리지 마라.** `src/routes/TechnicalReferences.tsx`, `src/data/reference-schema.ts`, `src/data/reference-demo.ts`, `src/App.tsx`, 삭제된 `src/routes/Study.tsx`다.

## 파일별 조치

| 파일 | 조치 |
|---|---|
| `src/components/dd/RequestLinkHelperDialog.tsx` | **삭제** |
| `src/components/dd/RequestBrowseDialog.tsx` | **삭제** |
| `src/routes/DevelopmentMasterSheet.tsx` | 아래 심볼 제거 |

두 파일 삭제는 박향근이 승인했고 스크래치패드에 백업해 두었다. git 이력에도 남는다. **이 둘 외에 어떤 파일도 지우지 마라.**

## `DevelopmentMasterSheet.tsx`에서 지울 심볼

줄 번호는 지우는 동안 밀리므로 **이름으로 찾아라.**

**import 두 줄**
- `RequestLinkHelperDialog`
- `RequestBrowseDialog`

**`@/data/request-link` import 목록에서 뺄 것** (다른 곳에서 안 쓰게 되는 것만)
- `buildLinkHelperGroups`
- `HelperGroup`
- `defaultLinkPairs`, `requestCandidates`, `LinkPair`는 **남겨야 할 수도 있다.** 지운 뒤 `npm run build`가 "선언했으나 안 씀"으로 잡아 준다. 빌드가 통과하는 최소 조합을 찾아라.

**상태**
- `linkRows`, `setLinkRows` (1372행 근처)
- `browseRow`, `setBrowseRow` (1414행 근처)
- `blockedRequestLineIds` (1416행 근처 `useMemo`. `linkRows`를 보므로 같이 간다)
- `linkHelperOpen`, `setLinkHelperOpen`
- `linkHelperPending` (`useMemo`)

**핸들러**
- `openRequestLink`
- `confirmRequestLink`
- `openRequestBrowse`
- `confirmRequestBrowse`
- `linkHelperAuto`
- `reviewLinkHelperGroup`

**화면**
- 도구줄 `요청 연결 도우미` 버튼 한 줄 (3137행 근처)
- 우클릭 메뉴 `DEVELOPMENT REQUEST 연결…` 항목 한 줄 (3344행 근처)
- 우클릭 메뉴 `요청 폴더에서 찾아 연결…` 항목 한 줄 (3345행 근처)
- `<RequestLinkHelperDialog ... />` 한 줄 (3551행 근처)
- `<RequestPickerDialog ... mode="link" ... />` 한 줄 (3552행 근처). **`mode="link"`가 붙은 쪽만이다.** 3550행 근처의 `onConfirm={importRequest}`가 붙은 `RequestPickerDialog`는 그대로 둔다.
- `<RequestBrowseDialog ... />` 한 줄 (3553행 근처)

**아이콘 import**
- `Link2`와 `FolderTree`가 안 쓰이게 되면 lucide import에서 뺀다. 다른 데서 쓰고 있으면 둔다. 빌드가 잡아 준다.

**우클릭 메뉴 `요청 연결 해제` 항목은 그대로 둔다.** `Unlink` 아이콘과 `unlinkSelectedRequests`도 그대로다.

## 안내 문구 하나 고치기

Style No. 칸의 `REQ?` 배지 `title`에 이런 문구가 있다.

```
연결된 요청 스타일 또는 옵션을 찾을 수 없습니다. 우클릭 > 요청 연결 해제로 정리하세요.
```

이 문구는 그대로 맞다. `요청 연결 해제`를 남기므로 고치지 않는다.

도구줄 `끊어진 연결 N` 버튼의 `title`도 그대로 둔다.

## 검증

1. `npm run build` 한 번. 모든 수정을 마친 뒤에 돌린다. **쓰지 않는 import와 변수를 `tsc`가 잡는다. 그것이 이 작업의 주된 검증이다.**
2. `git status --short`로 확인한다. 기대하는 모습은 이렇다.
   - `D src/components/dd/RequestLinkHelperDialog.tsx`
   - `D src/components/dd/RequestBrowseDialog.tsx`
   - `M src/routes/DevelopmentMasterSheet.tsx`
   - 그리고 손대지 않은 R321, R322 변경들
3. `src/components/dd/RequestPickerDialog.tsx`가 **삭제 목록에 없어야 한다.** 있으면 되돌려라.

화면 확인은 하지 마라. 박향근이 직접 본다.
