# R359 — 옵션이 모두 FL완료면 결과를 완료로

**상태: 미착수.** R352~R358은 구현과 빌드를 마쳤다.

## 요구

2026-10-28 박향근. DEVELOPMENT REQUEST 화면에서 **스타일의 옵션이 모두 FL완료가 되면 「결과」 열을 자동으로 「완료」로 바꾼다.** 조건은 **전체 옵션**이다. 하나라도 덜 끝났으면 바꾸지 않는다.

지금은 사람이 결과 칸을 손으로 고른다. 보드를 종결하려면 진행중인 스타일을 전부 정리해야 하는데(R150), 실제로는 FL까지 끝난 건이 진행중으로 남아 있다.

## 1. 판정 함수

`src/data/request-process-stage.ts` 맨 아래에 더한다. `ProcessStage`를 만드는 `requestProcessStage` 바로 다음이다.

```ts
/**
 * 이 옵션이 FL완료까지 갔는가(R359).
 * 멈춘 건(HOLD·DROP·REJECT)과 미연결은 거짓이다. 멈춘 것은 끝난 것이 아니다.
 */
export function isFlCompletedStage(stage: ProcessStage): boolean {
  if (!stage.linked || stage.halted) return false
  const last = stage.steps[stage.steps.length - 1]
  return Boolean(last && last.key === "fl" && stage.currentIndex === stage.steps.length - 1)
}
```

**`stage.label === "FL완료"`로 판정하지 마라.** 라벨은 화면 글자라 바뀔 수 있고, 멈춘 건은 라벨이 `HOLD`로 덮여 판정이 흐려진다.

`fl` 단계의 도달 조건은 이미 `isCompletedFlNo(record.flNo)`다(89행). 그 규칙을 여기서 다시 쓰지 마라.

## 2. 자동 반영

`src/routes/FabricRequest.tsx`. 보드 이관 effect(764행 근처)와 같은 꼴로 둔다. `commitRequests` 정의 아래 아무 곳이나 좋다.

```ts
  /**
   * 옵션이 모두 FL완료면 결과를 완료로 올린다(R359).
   *
   * 한 방향이다. 올리기만 하고 되돌리지 않는다. DD 연결이 잠깐 끊겨도 결과가 진행중으로 돌아가면
   * 사람이 정리해 둔 보드가 흔들린다.
   * 사람이 고른 드롭·보류는 건드리지 않는다. 진행중인 건만 대상이다.
   * 활성 보드만 본다. 보고 있지 않은 보드까지 고치면 그 보드 이력에 영문 모를 결과 변경이 쌓인다.
   */
  useEffect(() => {
    if (readOnly || !activeBoardInfo || !currentUserCanEditKey("requests")) return
    const now = new Date().toISOString()
    let changed = 0
    const next = requests.map((style) => {
      if (style.boardId !== activeBoard || resultOf(style) !== "진행중" || style.options.length === 0) return style
      if (!style.options.every((option) => isFlCompletedStage(requestProcessStage(ddByLine, option)))) return style
      changed += 1
      return { ...style, result: "완료" as const, resultAt: now, updatedAt: now }
    })
    if (!changed) return
    if (commitRequests(next)) setNotice({ kind: "ok", text: `옵션이 모두 FL완료라 결과를 완료로 바꿨습니다. ${changed}건` })
    // commitRequests는 매 렌더 새로 만들어지는 함수라 의존성에 넣지 않는다. 넣으면 effect가 끝없이 돈다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requests, ddByLine, activeBoard, activeBoardInfo, readOnly])
```

`isFlCompletedStage`를 `@/data/request-process-stage` import 줄에 더한다. `requestProcessStage`는 이미 들어와 있다.

### 왜 이렇게 두는가

- **반복 저장으로 돌지 않는다.** 저장하면 `requests`가 바뀌어 effect가 다시 돌지만, 그때는 결과가 이미 완료라 `changed`가 0이고 멈춘다.
- **`currentUserCanEditKey("requests")` 가드를 빼지 마라.** 읽기 권한자는 중앙 저장이 막히고 화면 값이 서버 값으로 되돌려진다. 그러면 effect가 다시 바꾸고 또 되돌려지며 **끝없이 돈다.**
- **`pushSnapshot`을 부르지 마라.** 되돌리기로 진행중으로 돌려 놔도 effect가 곧바로 다시 완료로 올린다. 되돌리기 스택만 지저분해진다.
- **`commitRequests` 말고 다른 저장 경로를 만들지 마라.** 보드 이력(`appendRequestHistory`)이 거기 붙어 있어 결과 변경이 보드 기록에 남는다. 자동으로 바뀐 것도 기록이 남아야 한다.

## 하지 말 것

- 옵션이 하나도 없는 스타일을 완료로 올리지 마라. 검사할 것이 없는 건이다.
- HOLD·DROP·REJECT인 옵션을 끝난 것으로 세지 마라.
- 결과가 완료인 건을 다시 진행중으로 내리지 마라.
- 결과 열을 보기 전용으로 바꾸지 마라. 사람이 손으로 고르는 길은 그대로 있어야 한다.
- 보드 종결 창(`RequestBoardCloseDialog`)의 조건을 바꾸지 마라.
- DD MASTER나 분석 화면을 건드리지 마라.
- `isCompletedFlNo` 규칙(`FL`+숫자 8자리)을 고치지 마라.

## 검증

```
npm run build
```

통과하면 된다. 다른 검증은 하지 마라. 빌드 뒤 `git status --short`로 명세에 없는 파일이 바뀌지 않았는지 본다.

고칠 파일은 둘이다. `src/data/request-process-stage.ts`, `src/routes/FabricRequest.tsx`.

화면 확인은 박향근이 한다. 옵션이 모두 FL완료인 스타일이 있는 보드를 열어 결과 칸이 완료로 바뀌고 안내 문구가 한 번 뜨는지, 옵션 하나가 덜 끝난 건은 그대로 진행중인지 본다.
