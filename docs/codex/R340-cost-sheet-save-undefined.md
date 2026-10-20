# R340 COST SHEET 저장 실패(undefined 필드)와 오류 노출

상태: 미착수. 원인 확인 완료, 코드 미수정.

팀원이 "원가계산서 작성은 되는데 저장이 안 된다"고 보고했다(2026-10-20). 화면에 붉은 문구가 떴다.

고치는 파일은 `src/components/dd/CostSheetDialog.tsx` 하나다.

## 원인

`normalizeComponentMode`(69~74행)가 스판덱스가 아닌 성분에 **`factor: undefined`를 키까지 만들어** 넣는다.

```ts
return fiber === "Spandex"
  ? { ...component, mode: "draft", factor: 3 }
  : { ...component, mode: "plain", factor: undefined }
```

자바스크립트에서 `{ ...a, factor: undefined }`는 키를 지우는 것이 아니라 값이 `undefined`인 키를 만든다.

`buildSheet()`(205행)가 저장 직전에 `normalizeInputModes`를 돌리고, 그것이 성분마다 이 함수를 부른다. 그래서 저장 문서의 `sheet.input.yarns[].spec.components[].factor`가 `undefined`로 들어간다.

`src/data/firebase.ts` 19행이 `getFirestore(firebaseApp)`를 옵션 없이 부른다. `ignoreUndefinedProperties`가 꺼져 있어 SDK가 `addDoc`에서 던진다. 오류 코드는 `invalid-argument`다.

**스판덱스가 아닌 성분이 하나라도 있으면 항상 실패한다.** 사실상 모든 원단이 해당된다. 2026-10-01 최초 도입 커밋 `e5e7834`부터 그랬고 지금까지 저장에 성공한 적이 없다.

처음에 권한 문제로 의심했으나 아니다. Firestore 규칙 배포는 이번 범위가 아니다.

## 조치 1. `factor` 키를 만들지 않는다

69~74행을 아래로 바꾼다.

```ts
const normalizeComponentMode = (component: YarnComponent): YarnComponent => {
  const fiber = FIBER_ALIASES[component.fiber.trim().toLowerCase()] ?? component.fiber.trim()
  if (fiber === "Spandex") return { ...component, mode: "draft", factor: 3 }
  // **`factor: undefined`로 두지 말 것**(R340). 키가 값 없이 만들어져 Firestore가 저장을 거부한다.
  // `ignoreUndefinedProperties`가 꺼져 있어 문서 어디든 undefined가 하나라도 있으면 던진다.
  const plain: YarnComponent = { ...component, mode: "plain" }
  delete plain.factor
  return plain
}
```

`fiber`는 판정에만 쓰고 돌려주는 객체의 `fiber`는 원래 값 그대로다. **그 동작을 바꾸지 마라.**

`factor`는 `YarnComponent`에서 선택 필드(`factor?: number`)라 `delete`가 타입에 걸리지 않는다.

## 조치 2. 오류를 드러낸다

지금은 세 곳이 FirebaseError를 통째로 버려서 권한 거부와 형식 오류를 구분할 수 없다. 이번 건이 한 달 넘게 안 잡힌 이유다.

파일 위쪽 헬퍼 근처에 둔다.

```ts
/** Firebase 오류 코드만 덧붙인다(R340). 메시지 본문에는 값이나 경로가 섞여 나올 수 있어 코드만 쓴다. */
const errorTail = (error: unknown): string => {
  const code = (error as { code?: string })?.code
  return code ? ` (${code})` : ""
}
```

세 곳을 고친다.

- 144행 이력 조회: `.catch(() => { ... setError("계산서 이력을 불러오지 못했습니다.") })`를 `.catch((error) => { ... setError(\`계산서 이력을 불러오지 못했습니다.${errorTail(error)}\`) })`로.
- 235행 `saveNew`: `catch { setError("계산서 저장에 실패했습니다. 다시 시도해 주세요.") }`를 `catch (error) { setError(\`계산서 저장에 실패했습니다. 다시 시도해 주세요.${errorTail(error)}\`) }`로.
- 244행 `overwrite`: 같은 방식으로 `계산서 수정에 실패했습니다...`에 붙인다.

`live` 검사와 `finally`는 그대로 둔다.

## 하지 말 것

- `src/data/firebase.ts`에서 `ignoreUndefinedProperties`를 켜지 마라. 모든 저장 경로에서 실수로 빠진 필드가 조용히 사라진다. 근원을 고치는 것이 맞다.
- `firestore.rules`를 건드리거나 배포하지 마라. 이번 건의 원인이 아니다.
- 241행 `overwrite`의 `{ blend: undefined }`는 그대로 둬라. 그 객체는 화면 상태로만 쓰이고 Firestore로 가는 payload에는 `blend`가 값이 있을 때만 들어간다. 범위 밖이다.
- `saveCostSheet`, `updateCostSheet`, `listCostSheets`(`src/data/cost-sheets.ts`)를 고치지 마라.
- 오류 메시지에 Firebase가 준 message 전문을 붙이지 마라. 필드 경로와 값이 섞여 나온다. 코드만 쓴다.
- 계산 로직(`src/data/fabric-cost.ts`)과 혼용율(`src/data/yarn-blend.ts`)을 건드리지 마라.

## 검증

```
npm run build
git status --short
```

- 빌드가 통과해야 한다(`tsc --noEmit` 포함).
- `git status --short`에 `src/components/dd/CostSheetDialog.tsx` 한 줄만 보여야 한다.
- 저장이 실제로 되는지는 로그인이 필요해 지시자가 화면에서 확인한다.

## 공통 제약

- 커밋하거나 푸시하지 마라. 워킹트리 변경까지만 한다.
- 사용자가 만든 기존 변경을 `git reset`이나 `git checkout`으로 되돌리지 마라.
- 파일은 `Get-Content -Encoding UTF8`로 읽어라. 한글 주석과 문구를 영어로 바꾸지 마라.
- 이 저장소는 공개 저장소다. 실데이터, 단가, 협력사명, 개인 메일을 코드나 문서에 넣지 마라.
- `npm run build`는 모든 수정을 마친 뒤 한 번만 돌려라.
- 마지막 보고는 수정 파일, 검증 결과, 판단이 필요한 지점만.
