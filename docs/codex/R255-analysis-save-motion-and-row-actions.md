# R255 분석 의뢰 저장 모션과 행별 의뢰/완료 처리

상태: 미착수. 화면 동작만 바꾼다. 스키마, 저장 키, 동기화는 건드리지 않는다.

## 확인한 현재 상태

코드를 열어 확인한 사실이다.

**1. 저장해도 팝업이 안 닫힌다.** `AnalysisRequestDialog.tsx`의 `saveBatch`는 저장을 마치면 390행에서 `setNotice("N건을 저장했습니다.")`만 하고 끝난다. 행을 빈 줄 하나로 되돌리고 창은 열어 둔다. 사용자가 직접 닫아야 한다.

**2. 완료 처리는 상세 창에서만 된다.** `AnalysisDetailDialog.tsx` 95행 `completeAnalysis`가 유일한 경로다. 목록(`FabricAnalysis.tsx`)의 `finishedMail`은 **이미 완료된 건의 메일만 다시 띄운다.** 상태를 바꾸지 않는다.

**3. 의뢰 확정은 일괄만 된다.** `FabricAnalysis.tsx`의 `confirmRequests`가 체크박스로 고른 `draftSelected` 전체를 한 번에 처리한다. 행 하나만 처리하는 길이 없다.

**4. 저장 모션은 이미 있다.** `AnalysisDetailDialog.tsx` 44~52행과 95~108행이다. teal 알약에 Check 아이콘, 900ms 뒤 흐려지고 1200ms 뒤 닫힌다. `completionRun` ref로 닫힌 뒤 늦게 온 응답을 버린다. 이 방식을 그대로 가져온다.

## A. 저장 모션과 자동 닫기

`src/components/analysis/AnalysisRequestDialog.tsx`

`AnalysisDetailDialog`와 같은 state와 ref를 더한다.

```ts
const [savedNotice, setSavedNotice] = useState<"visible" | "fading" | null>(null)
const [savedMessage, setSavedMessage] = useState("")
const savedFadeTimer = useRef<number | null>(null)
const savedCloseTimer = useRef<number | null>(null)
```

언마운트에서 두 타이머를 반드시 정리한다(`useEffect(() => () => { ... }, [])`). 안 하면 창이 닫힌 뒤 타이머가 `setState`를 불러 경고가 난다.

`saveBatch`의 390행 `setNotice(...)` 자리를 이렇게 바꾼다.

- `setSavedMessage(failures.length ? \`${uploaded.length}건을 저장했습니다. 사진 실패 ${failures.length}건\` : \`${uploaded.length}건을 저장했습니다\`)`
- `setSavedNotice("visible")`
- 900ms 뒤 `setSavedNotice("fading")`
- 1200ms 뒤 `onOpenChange(false)`

**사진 업로드 실패가 있으면 닫지 않는다.** `failures.length`가 0이 아니면 모션만 띄우고 창은 열어 둔다. 어느 건이 실패했는지 사용자가 봐야 한다. 이때는 `setNotice`로 기존 문구도 같이 남긴다.

모션 오버레이는 `DialogContent` 안 맨 앞에 둔다. `AnalysisDetailDialog` 155행과 같은 마크업이다.

```
{savedNotice ? <div className={`pointer-events-none absolute inset-0 z-50 flex items-center justify-center transition-opacity duration-300 ${savedNotice === "fading" ? "opacity-0" : "opacity-100"}`}><div className="flex items-center gap-2 rounded-full bg-teal-600 px-5 py-3 text-sm font-medium text-white shadow-lg"><Check className="size-5" />{savedMessage}</div></div> : null}
```

`Check`를 `lucide-react`에서 import 한다.

**`DialogContent`에 `relative`를 넘기지 마라.** tailwind-merge가 기본 `fixed`를 지워 팝업이 문서 흐름으로 떨어진다. 안쪽 `absolute`는 `fixed` 기준으로 이미 선다.

모션이 도는 동안 저장 버튼과 닫기를 막는다. `saving || savedNotice !== null` 로 `disabled`를 준다. `onOpenChange` 가드에도 같은 조건을 더한다.

단건 수정 모드(`record`가 있을 때 `saveOne`)는 이번 범위가 아니다. 건드리지 마라.

## B. 행별 의뢰와 완료

`src/routes/FabricAnalysis.tsx`

### B-1. 처리 함수를 인자 받는 형태로 바꾼다

지금 `confirmRequests`는 `draftSelected`를 안에서 읽는다. 목록 전체를 받는 형태로 고쳐 단건과 일괄이 같은 코드를 지나게 한다.

```ts
const confirmRequests = (targets: AnalysisRequest[]) => { ... }
const completeRequests = (targets: AnalysisRequest[]) => { ... }
```

기존 일괄 버튼은 `onClick={() => confirmRequests(draftSelected)}`로 바꾼다.

`completeRequests`는 새로 만든다. `AnalysisDetailDialog`의 `completeAnalysis`와 같은 규칙이다.

- 대상은 `state === "의뢰"`인 건만이다. 다른 상태는 걸러낸다.
- `state: "완료"`, `finishedAt: item.finishedAt || analysisTodayValue()`, `inCharge: item.inCharge || defaultName`, `updatedAt: new Date().toISOString()`
- `saveAnalysisRequests`로 한 번에 저장한다. 건마다 따로 저장하면 앞 저장을 뒤 저장이 덮는다.
- 저장 뒤 `openAnalysisFinishedMail(완료된 건들, recipients)`를 부르고 결과에 따라 `showNotice`를 띄운다. 문구는 기존 `finishedMail`과 같게 쓴다.
- 처리한 건의 id를 `selected`에서 뺀다. `confirmRequests`가 지금 하는 것과 같다.

**결과가 빈 건 경고.** `yarnDescription`과 `commentRnd`가 둘 다 빈 건이 있으면 완료 전에 `confirm`으로 묻는다. 문구는 `분석 결과가 비어 있는 건이 N건 있습니다. 완료 메일 표가 비어 나갑니다. 계속할까요?`다. 취소하면 아무것도 하지 않는다.

### B-2. 행 끝에 처리 열을 더한다

표 머리글 배열 끝에 빈 제목 하나를 더한다. 지금 15개 뒤에 `""`를 붙여 16개가 된다. 체크박스 열까지 세면 17열이다.

행이 없을 때 쓰는 `colSpan={16}`을 `colSpan={17}`로 고친다.

각 행 마지막에 `<TableCell>`을 더한다. 상태에 따라 버튼 하나만 보인다.

| 상태 | 버튼 | 동작 |
|---|---|---|
| 작성 | `의뢰` | `confirmRequests([item])` |
| 의뢰 | `완료` | `completeRequests([item])` |
| 완료 | `메일` | `openAnalysisFinishedMail([item], recipients)` |
| 취소 | 없음 | 빈 칸 |

버튼은 `size="sm" variant="ghost"`에 `className="h-7 px-2 text-xs"`다. `canEdit`이 아니면 `의뢰`와 `완료`는 감추고 `메일`만 남긴다.

**`onClick`에 `event.stopPropagation()`을 반드시 넣는다.** 행 클릭이 상세 창을 여는데 그게 같이 뜨면 안 된다. `<TableCell>`에도 `onClick={(event) => event.stopPropagation()}`을 준다.

이 열은 탭과 무관하게 항상 보인다. 전체 탭에서도 각 행 상태에 맞는 버튼이 뜬다.

### B-3. 일괄 버튼에 완료 처리를 더한다

선택 액션 줄에 버튼 하나를 더한다. `의뢰 확정` 다음 자리다.

```
{canEdit ? <Button size="sm" variant="outline" disabled={!requestedSelected.length} onClick={() => completeRequests(requestedSelected)}>완료 처리</Button> : null}
```

`requestedSelected`를 더한다.

```ts
const requestedSelected = selectedRows.filter((item) => item.state === "의뢰")
```

기존 `완료 메일` 버튼은 그대로 둔다. 이미 완료된 건의 메일을 다시 띄우는 별도 기능이다.

## 파일별 조치

| 파일 | 조치 |
|---|---|
| `src/components/analysis/AnalysisRequestDialog.tsx` | A 전부 |
| `src/routes/FabricAnalysis.tsx` | B 전부 |

다른 파일은 열지 않는다. `AnalysisDetailDialog.tsx`는 **읽기만** 한다.

## 손대지 말 것

- `AnalysisDetailDialog.tsx`. 상세 창 완료 흐름은 그대로 둔다
- `saveBatch`의 저장 순서, 사진 업로드 루프, `blankAnalysisRequest` 호출 방식
- `analysis-mail.ts`의 메일 문구와 열 구성
- 공통 줄, 엑셀 업로드, 빠른 입력 버튼
- 스키마. 필드를 더하지 않는다

## 반복 실수 방지

- **`DialogContent`에 `relative`, `absolute`, `static`을 넘기지 마라.** 기본 `fixed`가 지워져 팝업이 화면 아래로 떨어진다.
- **타이머를 언마운트에서 정리해라.** 창이 닫힌 뒤 `setState`가 돌면 경고가 난다.
- **여러 건 저장은 `saveAnalysisRequests` 한 번으로 한다.** 건마다 부르면 앞 저장이 지워진다.
- 행 버튼에 `stopPropagation`을 빼지 마라. 상세 창이 같이 열린다.

## 검증

```
npm run build
git status --short
```

빌드 오류 0이면 통과다. `git status --short`에 위 두 파일과 이 문서 외에 다른 변경이 없어야 한다.

화면 확인은 사용자가 한다.
