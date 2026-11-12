# R421 메모 저장 실패를 알리고 새 메모 창을 끌 수 있게 한다

상태: 미착수. R420 시공 직후 박향근이 화면을 보고 보고한 두 가지다.

> 저장을 눌러도 반응이 없고 위치도 이동되지 않는다

## 원인은 둘 다 코드에서 확인했다. 다시 조사하지 마라

**1. 저장 실패가 조용히 묻힌다.**

`src/data/screen-memo.ts`의 `createMemo`가 `catch { return false }`다. 오류를 삼키고 `false`만 돌려준다. `MemoDock.tsx`의 `saveNew`는 `if (saved)` 안에서만 창을 닫고, **`false`일 때 아무것도 하지 않는다.** 그래서 눌러도 화면이 그대로다.

지금 실패하는 까닭은 **Firestore 규칙이 아직 배포 전이라 `permission-denied`가 나기 때문**일 가능성이 높다. 규칙 배포는 사람이 한다. 다만 배포를 하더라도 **실패를 안 알리는 것 자체가 결함**이라 이번에 고친다. COST SHEET가 같은 이유로 한 달 넘게 저장 실패를 모르고 지냈다(R340).

**2. 새 메모 창은 끌 수 없고 위치가 늘 화면 한가운데다.**

`MemoDock.tsx`의 새 메모 창(`creating` 분기)은 `fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2`에 크기가 `h-[230px] w-[240px]` 고정이다. 머리줄에 포인터 핸들러가 없다. 저장할 때도 `x: 0.5, y: 0.5`가 **하드코딩**되어 있어서 어느 메모나 한가운데에 생긴다. 박향근 요구는 메모를 화면의 원하는 자리에 두는 것이다.

**저장된 메모(`MemoCard`)의 끌기는 이미 되어 있다.** 머리줄에 `startDrag`, `moveDrag`, `endDrag`가 붙어 있고 본인 메모일 때만 `cursor-move`다. 그쪽은 손대지 마라. 저장이 한 번도 성공하지 못해 끌어 볼 대상이 없었을 뿐이다.

## 파일별 조치

| 파일 | 조치 |
|---|---|
| `src/data/screen-memo.ts` | 쓰기 함수 다섯의 반환값을 오류 코드로 바꾼다 |
| `src/components/layout/MemoDock.tsx` | 실패 문구, 새 메모 창 끌기, 위치 저장 |

---

## 1. `src/data/screen-memo.ts`

`createMemo`, `updateMemo`, `addReply`, `deleteMemo`, `deleteReply` 다섯의 반환형을 `Promise<boolean>`에서 **`Promise<string | null>`**로 바꾼다. 성공이면 `null`, 실패면 Firebase 오류 코드다.

```ts
  } catch (error) {
    return (error as { code?: string }).code ?? "unknown"
  }
```

입력이 비어 되돌아가는 자리(`if (!user || !text)`)는 `"invalid"`를 돌려준다.

**오류 `message` 전문을 돌려주지 마라.** 필드 경로와 값이 섞여 나온다. 코드만 쓴다(R340).

## 2. `src/components/layout/MemoDock.tsx`

### 실패 문구

새 메모 창과 메모 카드에 각각 지역 상태 `error`를 둔다. 저장, 답글, 삭제가 코드를 돌려주면 그 자리에 붉은 한 줄로 적는다. 토스트를 새로 만들지 마라. 이 앱에 공용 토스트 헬퍼가 없다.

문구는 두 가지뿐이다.

```ts
const saveErrorText = (code: string) =>
  code === "permission-denied"
    ? "저장 권한이 없습니다. Firestore 규칙 배포와 3팀 권한을 확인하세요."
    : `저장하지 못했습니다 (${code})`
```

성공하면 `error`를 비운다. 실패했을 때 **창을 닫지 마라.** 사람이 친 글이 사라진다.

### 새 메모 창을 끈다

창 머리줄(`새 메모` 줄)에 `MemoCard`와 같은 방식으로 포인터 핸들러를 붙인다. 닫기 단추에는 `onPointerDown`에 `stopPropagation`을 건다. `MemoCard`의 머리줄이 그렇게 하고 있다.

위치는 지역 상태 픽셀 좌표로 들고, 처음 열 때 화면 가운데로 둔다. `left-1/2 top-1/2`와 `-translate-x-1/2 -translate-y-1/2` 클래스를 떼고 `style`의 `left`, `top`으로 그린다. **`transform`을 남긴 채 `left`/`top`을 주면 끌 때 좌표가 반칸씩 어긋난다.**

화면 밖으로 못 나가게 가둔다. `MemoCard`가 쓰는 것과 같은 식이다.

```ts
const clampX = Math.min(Math.max(nextX, 0), window.innerWidth - size.w)
const clampY = Math.min(Math.max(nextY, 0), window.innerHeight - size.h)
```

### 창 크기를 고른 크기로 보인다

`h-[230px] w-[240px]` 고정을 떼고 `MEMO_SIZES[newSize]`를 쓴다. S, M, L을 누르면 창이 그 크기로 바뀐다. 저장했을 때 나올 종이와 같은 크기라 고르기 전에 보인다.

크기를 바꾸면 창이 화면 밖으로 나갈 수 있으니 바꾼 뒤에도 위 가두기를 다시 건다.

### 위치를 저장한다

`saveNew`의 `x: 0.5, y: 0.5` 하드코딩을 지우고 **놓은 자리를 비율로 바꿔 넣는다.** `MemoCard`가 비율을 픽셀로 푸는 식(`ratio * (window.innerWidth - size.w)`)의 역이다.

```ts
const denomX = Math.max(window.innerWidth - size.w, 1)
const denomY = Math.max(window.innerHeight - size.h, 1)
x: Math.min(Math.max(pos.x / denomX, 0), 1)
y: Math.min(Math.max(pos.y / denomY, 0), 1)
```

**0으로 나누는 것을 막아라.** 창이 뷰포트보다 크면 분모가 0이나 음수가 된다.

---

## 검증

```
npm run build
```

모든 수정을 마친 뒤 한 번만 돌려라. 개발 서버를 띄우지 마라. 화면 확인은 박향근이 한다.

## 하지 말 것

- `MemoCard`의 끌기와 좌표 계산을 고치지 마라. 이미 맞다.
- 커밋하거나 푸시하지 마라. `firebase deploy`도 돌리지 마라.
- 명세에 적힌 두 파일만 고쳐라. 삭제는 없다.
- 공용 토스트나 알림 컴포넌트를 새로 만들지 마라.
- `public/data` 아래 JSON을 열지 마라. `legacy/`, `backup/`은 읽지 마라.
- 같은 오류를 두 번 고쳐 실패하면 멈추고 보고해라.
- 마지막 보고는 수정 파일, 빌드 결과, 판단이 필요한 지점만. 바꾼 코드를 다시 붙이지 마라.
