# R362 — 회색으로 죽은 옵션도 종결로 센다

**상태: 미착수.** R359에서 만든 자동 완료 규칙을 넓히는 건이다.

## 요구

2026-10-28 박향근. R359는 **옵션이 전부 FL완료**일 때만 결과를 완료로 올린다. 여기에 조건을 더한다.

**FL완료가 아닌 옵션이 전부 회색으로 죽어 있으면 그 스타일도 완료로 올린다.** DROP과 REJECT로 끝난 건을 종결로 보이게 하려는 것이다.

즉 조건은 "모든 옵션이 **FL완료이거나 회색**"이다. 옵션 전부가 회색인 건(살아남은 옵션이 하나도 없는 건)도 완료가 된다.

## 회색이 무엇인가

`requestProcessStage`가 주는 `stage.halted`와 `stage.color`다.

| 값 | 색 | 이번 판정 |
|---|---|---|
| `DROP` | `var(--muted-foreground)` 회색 | 종결로 센다 |
| `REJECT` | `var(--muted-foreground)` 회색 | 종결로 센다 |
| `HOLD` | `var(--warning)` 앰버 | **세지 않는다** |
| 미연결 | 붉은 "미연결" | **세지 않는다** |

**HOLD를 넣지 마라.** 2026-10-07에 "HOLD는 멈춘 것이지 끝난 것이 아니라 앰버 색만 준다"로 정했다. 회색이 아닌 이유가 그것이다. 미연결은 아직 시작도 못 한 건이다.

## 1. 판정 함수

`src/data/request-process-stage.ts`, R360에서 더한 `isFlCompletedStage` 바로 아래에 둔다.

```ts
/**
 * 화면에서 회색으로 죽은 옵션인가(R362). DROP과 REJECT뿐이다.
 * HOLD는 앰버다. 멈춘 것이지 끝난 것이 아니라 종결로 세지 않는다(2026-10-07 확정).
 */
export function isDroppedStage(stage: ProcessStage): boolean {
  return stage.halted === "DROP" || stage.halted === "REJECT"
}
```

`stage.color`로 판정하지 마라. 색은 화면 값이라 바뀐다. `halted`가 뜻을 들고 있다.

## 2. 자동 완료 조건을 넓힌다

`src/routes/FabricRequest.tsx`, R359에서 더한 effect다. 지금 이 줄이다.

```ts
      if (!style.options.every((option) => isFlCompletedStage(requestProcessStage(ddByLine, option)))) return style
```

이렇게 바꾼다.

```ts
      // FL완료이거나 회색(DROP·REJECT)이면 그 옵션은 끝난 것이다(R362).
      // 전부 회색인 건도 완료로 올린다. 결과 열에서 종결로 보여야 보드를 닫을 수 있다.
      const closed = style.options.every((option) => {
        const stage = requestProcessStage(ddByLine, option)
        return isFlCompletedStage(stage) || isDroppedStage(stage)
      })
      if (!closed) return style
```

import 줄에 `isDroppedStage`를 더한다.

나머지는 R359 그대로다. **한 방향이고, 진행중인 건만 대상이고, 활성 보드만 본다.** 그 가드를 건드리지 마라.

안내 문구도 그대로 둔다. 건수만 말하므로 조건이 넓어져도 맞는 말이다.

## 하지 말 것

- HOLD를 종결로 세지 마라.
- 미연결 옵션을 종결로 세지 마라. 연결이 안 된 것뿐이다.
- 옵션이 하나도 없는 스타일을 올리지 마라. R359의 `style.options.length === 0` 가드를 지우지 마라.
- 전부 DROP인 건을 결과 "드롭"으로 넣지 마라. 박향근이 "완료"로 정했다(2026-10-28). 사람이 결과 칸에서 드롭으로 바꿀 수 있다.
- `requestProcessStage`의 `halted` 판정 규칙을 고치지 마라.
- 공정 칩 색을 바꾸지 마라.

## 검증

```
npm run build
```

통과하면 된다. 다른 검증은 하지 마라. 빌드 뒤 `git status --short`로 명세에 없는 파일이 바뀌지 않았는지 본다.

고칠 파일은 둘이다. `src/data/request-process-stage.ts`, `src/routes/FabricRequest.tsx`.

화면 확인은 박향근이 한다. 옵션이 DROP·REJECT로만 남은 스타일의 결과가 완료로 바뀌는지, HOLD가 섞인 건은 진행중 그대로인지 본다.
