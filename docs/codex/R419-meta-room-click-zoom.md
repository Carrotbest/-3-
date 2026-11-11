# R419 룸 표지 한 번은 불, 두 번은 줌인

상태: 구현 완료. 2026-11-11 커밋. 빌드와 타입 검사는 통과했고 화면 동작은 박향근이 직접 눌러 보았다. 클로드 쪽 자동 검증은 같은 시각 사람 조작과 섞여 판독하지 못했다.

박향근 요구(2026-11-11): "룸 이름을 한 번 클릭하면 불만 켜지고 더블 클릭했을때 줌인시켜주고 줌인 거리를 지금보다 조금 멀리서 보게 해줘."

## 지금 무엇이 문제인가

`selectRoom`(3116행)이 **불 켜기와 카메라 이동을 한꺼번에** 한다. 그래서 육면체 표지를 한 번 누르면 방에 불이 들어오면서 동시에 그 방으로 끌려 들어간다. 방 하나만 밝혀 두고 전체를 보고 싶어도 그럴 수가 없다.

줌인 거리도 가깝다. `roomZoom`(3031행)이 `frame * 1.6 / max(w, d)`다.

## 바꿀 동작

| 조작 | 지금 | 바꾼 뒤 |
|---|---|---|
| 육면체 표지 한 번 클릭 | 불 켜짐 + 줌인 | **불만 켜짐** |
| 육면체 표지 더블클릭 | 선택 해제 + 전체 보기 | **그 방으로 줌인** |
| 빈 곳 더블클릭 | 전체 보기 | 그대로 전체 보기 |
| 빈 곳 한 번 클릭 | 선택 해제 + 전체 보기 | 그대로 |
| Esc | 선택 해제 | 그대로 |

**`kind === "room"`이 육면체 표지다.** 방 전체 히트박스는 `kind === "floor"`이고 걷기 전용이다(R408). 둘을 섞지 마라.

---

## 1. `roomZoom`을 멀리 잡는다 (3031행)

```ts
    // 1.6은 방이 화면을 꽉 채워 둘레가 안 보였다. 2026-11-11 박향근 "조금 멀리서".
    const roomZoom = (room: Room) => Math.min(controls.maxZoom, frame * 1.2 / Math.max(room.w, room.d))
```

`overviewZoom`은 건드리지 마라. 전체 보기 줌은 그대로다.

## 2. `selectRoom`에서 카메라 이동을 뗀다 (3116행)

지금 함수 끝이 이렇다.

```ts
      refreshRoomLighting()
      if (activeRoomPath) {
        const room = roomGroups.get(activeRoomPath)?.room
        if (room) focusAt(new THREE.Vector3(room.x, 0, room.z), roomZoom(room))
      } else {
        focusAt(new THREE.Vector3(0, 0, -2), overviewZoom())
      }
    }
```

이렇게 바꾼다.

```ts
      refreshRoomLighting()
      // 방을 고르는 것과 그 방으로 들어가는 것을 가른다(2026-11-11 박향근).
      // 한 번 클릭은 불만 켜고, 줌인은 더블클릭이 zoomToRoom으로 따로 한다.
      // 선택을 풀 때 전체 보기로 돌아가는 것은 그대로다. 전체 보기 단추와 Esc가 이 길을 쓴다.
      if (!activeRoomPath) focusAt(new THREE.Vector3(0, 0, -2), overviewZoom())
    }

    const zoomToRoom = (path: string) => {
      const room = roomGroups.get(path)?.room
      if (!room) return
      focusAt(new THREE.Vector3(room.x, 0, room.z), roomZoom(room))
    }
```

`zoomToRoom`은 `selectRoom` **바로 뒤**에 둔다. `roomGroups`, `focusAt`, `roomZoom`이 모두 그 앞에 서 있다. 더 뒤로 미루지 마라. 이 파일은 `useEffect` 하나가 3,900줄이라 선언 순서가 늘 함정이고 TDZ는 타입 검사가 못 잡는다.

## 3. `pickAt`이 더블클릭도 받게 한다 (3648행)

```ts
    const pickAt = (event: MouseEvent) => {
```

`PointerEvent`가 `MouseEvent`를 상속하므로 기존 호출처 셋은 그대로 돈다. 몸통은 `clientX`, `clientY`만 쓴다.

## 4. `handleDoubleClick`이 표지를 집는다 (3781행)

지금은 인자가 없다. 이벤트를 받아 무엇을 눌렀는지 본다.

```ts
    const handleDoubleClick = (event: MouseEvent) => {
      markInteraction()
      // 육면체 표지를 두 번 누르면 그 방으로 들어간다(2026-11-11 박향근).
      // 한 번 클릭은 불만 켜므로 들어가는 길이 여기 하나다.
      const hit = pickAt(event)
      const data = hit?.object.userData as { kind?: string; id?: string } | undefined
      if (data?.kind === "room" && data.id && roomGroups.has(data.id)) {
        if (activeRoomPath !== data.id) {
          selectRoom(data.id)
          onPickRef.current("room", data.id)
        }
        zoomToRoom(data.id)
        return
      }
      // 고른 것이 없어도 전체 보기로 되돌린다. 캔버스 아래 안내가 그렇게 약속한다.
      // 예전에는 여기서 조기 반환해서, 휠로만 확대한 경우 돌아갈 길이 휠밖에 없었다.
      // 방을 고른 경우와 사람을 고른 경우 둘 다 빠져나온다.
      if (activeRoomPath) {
        selectRoom(null)
        onPickRef.current("room", "")
      }
      ...
```

`if (activeRoomPath)` 아래 기존 본문(사람 선택 해제, `userAdjustedView = false`, `focusAt`)은 **그대로 둔다.** 손대지 마라.

등록부도 그대로다. `canvas.addEventListener("dblclick", handleDoubleClick)`가 이벤트를 넘긴다.

## 5. 안내 문구를 고친다 (`src/routes/Meta.tsx`)

캔버스 아래 `<p>` 한 줄이다. 지금 글이 이렇다.

> 끌기로 돌리고, 스페이스를 누른 채 끌면 화면이 움직입니다. 휠로 확대합니다. 육면체 표지나 사람을 누르면 그쪽으로 들어가고, 더블클릭하면 전체 화면으로 돌아옵니다.

이렇게 바꾼다.

> 끌기로 돌리고, 스페이스를 누른 채 끌면 화면이 움직입니다. 휠로 확대합니다. 육면체 표지를 누르면 그 방에 불이 켜지고, 두 번 누르면 그쪽으로 들어갑니다. 빈 곳을 두 번 누르면 전체 화면으로 돌아옵니다.

---

## 하지 말 것

- **아바타 클릭은 건드리지 마라.** `applyFocus(data.id, true)`가 지금처럼 한 번 클릭에 카메라를 옮긴다. 이번 요구는 룸 표지뿐이다.
- **`kind === "floor"` 분기를 손대지 마라.** 고른 방 바닥을 누르면 아바타가 걸어가는 길이다(R405).
- **`overviewZoom`을 바꾸지 마라.** 전체 보기 줌 공식은 세 군데가 같이 보는 자리다.
- **`selectRoom(null)`의 전체 보기 복귀를 없애지 마라.** 오른쪽 패널 「전체 보기」 단추와 Esc, 빈 곳 클릭이 그 길을 쓴다.
- **`SceneApi`의 `selectRoom` 서명을 바꾸지 마라.** `Meta.tsx`가 `selectedRoomPath`가 바뀔 때마다 부르는데, 인자를 더하면 그 호출이 카메라를 움직이게 될 수 있다.
- 새 함수를 쓰는 자리보다 뒤에 정의하지 마라.

## 검증

`npm run build`를 마지막에 한 번만 돌린다. 직전 기준값은 `OfficeScene` 588.32 kB, `Meta` 24.95 kB다. 이번 변경은 작아서 거의 그대로여야 한다. 크게 벗어나면 보고해라.

화면 확인은 사람이 한다. 하지 마라.

---

## 추가 (2026-11-11, 같은 날 박향근)

> "룸 네임을 클릭했을때 불이 들어오는것까지는 봤는데 더블 클릭이 아닌 다시 한번 일반 클릭하면 불이 꺼지게도 해줘."

같은 표지를 한 번 더 누르면 불을 끈다. 토글이다.

### 함정: 더블클릭은 단일 클릭 두 번을 먼저 발생시킨다

그냥 토글로 만들면 표지를 두 번 빠르게 눌렀을 때 이렇게 된다.

1. 첫 클릭 — 불 켜짐
2. 둘째 클릭 — 같은 방이므로 불 꺼짐 + `selectRoom(null)`이 카메라를 전체 보기로 되돌림
3. `dblclick` — 다시 켜고 줌인

끝 상태는 맞지만 2번에서 카메라가 전체 보기로 튀었다가 다시 들어간다. 눈에 보이는 깜빡임이다.

**그래서 끄는 쪽만 220밀리초 미룬다.** 그 안에 `dblclick`이 오면 취소한다. 이 저장소는 DD MASTER FL# 칸에서 이미 같은 수법을 쓴다(한 번 클릭은 원가계산, 두 번은 편집, 220ms 타이머로 가름).

**켜는 쪽은 미루지 마라.** 불이 바로 들어오는 것을 박향근이 보고 좋다고 한 동작이다.

### 조치

`src/components/meta/OfficeScene.tsx`

(가) 타이머 변수를 `handlePointerUp` 정의보다 **앞에** 둔다.

```ts
    // 같은 표지를 다시 누르면 불을 끈다. 다만 더블클릭도 단일 클릭 두 번을 먼저 던지므로
    // 끄는 것만 미뤄 두고 dblclick 이 오면 취소한다. 안 그러면 줌인 직전에 카메라가 한 번 튄다.
    let roomOffTimer: number | null = null
    const cancelRoomOff = () => {
      if (roomOffTimer === null) return
      window.clearTimeout(roomOffTimer)
      roomOffTimer = null
    }
```

(나) `handlePointerUp`의 `data.kind === "room"` 분기를 바꾼다.

```ts
      if (data.kind === "room") {
        cancelRoomOff()
        if (activeRoomPath === data.id) {
          roomOffTimer = window.setTimeout(() => {
            roomOffTimer = null
            selectRoom(null)
            onPickRef.current("room", "")
          }, 220)
        } else {
          selectRoom(data.id)
          onPickRef.current("room", data.id)
        }
        return
      }
```

(다) `handleDoubleClick` 맨 앞, `markInteraction()` 바로 뒤에 `cancelRoomOff()`를 넣는다. 표지를 집었든 아니든 먼저 취소한다.

(라) 정리 함수에서 타이머를 푼다. `canvas.removeEventListener("dblclick", handleDoubleClick)`가 있는 자리에 `cancelRoomOff()`를 더한다.

### 하지 말 것

- **켜는 쪽에 타이머를 걸지 마라.** 반응이 굼떠진다.
- **`selectRoom(null)`을 직접 부르는 다른 자리(빈 곳 클릭, Esc, 전체 보기 단추)에 타이머를 걸지 마라.** 거기는 더블클릭과 겹치지 않는다.
- 220을 더 키우지 마라. 끄는 반응이 눈에 띄게 늦어진다.

### 안내 문구 (`src/routes/Meta.tsx`)

> 끌기로 돌리고, 스페이스를 누른 채 끌면 화면이 움직입니다. 휠로 확대합니다. 육면체 표지를 누르면 그 방에 불이 켜지고 다시 누르면 꺼집니다. 두 번 누르면 그쪽으로 들어가고, 빈 곳을 두 번 누르면 전체 화면으로 돌아옵니다.
