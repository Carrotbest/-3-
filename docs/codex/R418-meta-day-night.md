# R418 META 주/야간 모드와 시각별 자연광

상태: 폐기. 2026-11-11에 시공했다가 같은 날 박향근이 "주야간 모드 없애자"로 정해 전부 되돌렸다. 조사 결과는 남겨 둔다. 특히 `.dark` 씬 토큰 16개가 이미 있는데 아무도 그 클래스를 붙이지 않는다는 사실은 여전히 유효하다.

박향근 요구(2026-11-11): "현재 조명과 전반적인 농도를 야간으로 설정하고 주간모드를 추가하자. 주/야간 모드 선택 버튼도 META 바탕화면에 만들어줘. 주간 모드는 전체 방을 다 밝히되, 시간대별로 창문으로 들어오는 빛의 세기와 각도가 다르게(실제 자연광과 동일하게)"

시각 방식은 2026-11-11에 박향근이 **"실제 시각 + 슬라이더"**로 골랐다. 열 때는 지금 시각을 따르고, 바탕화면 슬라이더로 6시에서 20시를 끌어 볼 수 있다.

## 새로 만들지 않는다. 죽어 있는 코드를 살린다

**다크 씬은 이미 통째로 있다.** 다시 만들지 마라.

- `src/index.css` 172행 `.dark { ... }` 블록 안 **201행에서 216행**이 `--scene-bg`부터 `--scene-glass`까지 씬 토큰 16개다.
- `src/components/meta/OfficeScene.tsx` 246행 `readTheme()`가 `dark`를 읽고, 그 아래 전부가 `dark ? A : B`로 갈려 있다.
- 3839행 `repaint()`가 안개, 재질 색, 네 광원 세기를 다시 칠한다.
- 3899행 `themeObserver`가 `class`와 `data-theme` 변화를 감시해 `repaint`를 부른다.

**앱 어디에도 root에 `dark`를 붙이는 코드가 없어서** 이 전부가 닿지 않는 길이었다. 이번에 길을 연다.

## 틀렸던 가설. 다시 시도하지 말 것

**`document.documentElement.dataset.theme = "dark"`만 세우면 된다고 보면 안 된다.** 확인했다. `readTheme`의 `dark`는 true가 되지만 CSS 토큰은 안 바뀐다. `index.css`의 선택자가 `.dark` **클래스**뿐이고 `[data-theme="dark"]`가 없기 때문이다. `cssValue`는 `:root`의 밝은 값을 그대로 돌려준다. 결과는 **밝은 색에 어두운 조명**이라는 최악의 조합이다.

**`.dark` 클래스를 root에 붙이는 것도 답이 아니다.** 그러면 사이드바, 카드, 표까지 앱 전체가 다크로 뒤집힌다. 이번 건은 씬 조명이다. 앱 테마 토글은 별개 과제다.

그래서 **씬 전용 선택자를 새로 판다.**

## 파일별 조치

| 파일 | 할 일 |
|---|---|
| `src/index.css` | `[data-meta-scene="night"]` 블록 추가 |
| `src/components/meta/OfficeScene.tsx` | `readTheme` 확장, 자연광 함수, 주간 방 조명, `setDaylight` |
| `src/routes/Meta.tsx` | 바탕화면 오버레이(주/야 버튼 + 시각 슬라이더), 상태와 저장 |

---

## 1. `src/index.css`

`.dark` 블록은 **건드리지 마라.** 파일 끝에 새 블록을 더한다. `.dark` 201~216행의 씬 토큰 16개를 그대로 베껴 온다.

```css
/* META 씬만 야간으로 돌린다. 앱 UI 색(--background, --card 등)은 그대로 둔다.
   .dark 클래스를 쓰면 사이드바와 표까지 뒤집히므로 쓰지 않는다. */
[data-meta-scene="night"] {
  --scene-bg: #141a23;
  --scene-floor: #1d2531;
  --scene-wall: #2a3240;
  --scene-desk: #4a4336;
  --scene-metal: #5a6675;
  --scene-screen: #5b9bff;
  --scene-wood: #6b5438;
  --scene-tile: #262e3a;
  --scene-wallpaper: #3b434f;
  --scene-outer: #333b46;
  --scene-cabinet: #4b5563;
  --scene-sofa: #56617a;
  --scene-board: #d7dde6;
  --scene-dark: #232b37;
  --scene-paper: #cdd4de;
  --scene-glass: #4a79ab;
}
```

---

## 2. `src/components/meta/OfficeScene.tsx`

### (가) `readTheme`을 넓힌다 (252행 근처)

지금:

```ts
const dark = root.classList.contains("dark") || root.dataset.theme === "dark"
```

바꿀 것:

```ts
// data-meta-scene은 META 화면의 주/야 토글이 세운다. 씬 토큰만 바꾸고 앱 UI는 그대로 둔다.
const dark = root.dataset.metaScene === "night"
  || root.classList.contains("dark")
  || root.dataset.theme === "dark"
```

**위에 있는 `prefers-color-scheme` 관련 주석은 유지한다. 폴백을 되살리지 마라.**

### (나) `themeObserver`에 속성을 더한다 (3899행)

```ts
themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-theme", "data-meta-scene"] })
```

### (다) 프롭을 둘 더한다 (`OfficeSceneProps`, 196행 근처)

```ts
  daylightHour?: number
```

`SceneApi`에 한 줄:

```ts
  setDaylight: (hour: number) => void
```

### (라) 조명 적용을 함수 하나로 모은다

지금 밝은 모드 수치가 **두 군데에 복사돼 있다.** 369~391행의 생성부와 3866~3869행의 `repaint` 안이다. 소스에도 "한쪽만 고치면 되돌아간다"는 경고가 달려 있다. 이번에 하나로 합친다.

`fill` 광원을 만든 **바로 뒤**(391행 근처)에 다음을 넣는다. **`hemi`, `sun`, `ambient`, `fill` 선언보다 앞에 두면 TDZ로 터진다. 이 파일은 `useEffect` 하나가 3,900줄이라 선언 순서가 늘 함정이다.**

```ts
    // 주간 자연광. 해가 뜨는 6시부터 지는 20시까지를 0에서 1로 본다.
    // 고도는 사인 곡선, 방위는 동에서 서로 반원이다. 창문으로 드는 빛의 각도가 시간마다 달라진다.
    const SUN_RISE = 6
    const SUN_SET = 20
    const SUN_RADIUS = 86
    let daylightHour = 12

    const applyDaylight = () => {
      const clamped = Math.min(SUN_SET, Math.max(SUN_RISE, daylightHour))
      const t = (clamped - SUN_RISE) / (SUN_SET - SUN_RISE)
      const elev = Math.sin(Math.PI * t)            // 0 → 1 → 0
      const alt = (Math.PI / 2) * elev              // 지평선 0, 천정 90도
      const az = -Math.PI / 2 + Math.PI * t         // 동 → 남 → 서
      sun.position.set(
        SUN_RADIUS * Math.cos(alt) * Math.sin(az),
        SUN_RADIUS * Math.sin(alt) + 6,
        SUN_RADIUS * Math.cos(alt) * Math.cos(az) * 0.5 + 16,
      )
      // 해뜨고 해질 때는 붉고 약하다. 한낮은 희고 세다.
      sun.color.copy(new THREE.Color(0xff9d4d).lerp(new THREE.Color(0xfff7ec), Math.min(1, elev * 1.6)))
      sun.intensity = 0.28 + elev * 1.02
      hemi.color.copy(new THREE.Color(0xcfe2ff).lerp(new THREE.Color(0xffffff), elev))
      hemi.groundColor.set(0xdde3ec)
      hemi.intensity = 0.34 + elev * 0.56
      ambient.intensity = 0.22 + elev * 0.3
      fill.intensity = 0.1 + elev * 0.24
    }

    const applyNightLights = () => {
      sun.color.set(0xffffff)
      sun.position.set(26, 44, 20)
      hemi.color.set(0x5b7ba8)
      hemi.groundColor.set(0x1a222e)
      hemi.intensity = 0.85
      sun.intensity = 0.8
      ambient.intensity = 0.25
      fill.intensity = 0.3
    }

    const applyLighting = () => {
      if (theme.dark) applyNightLights()
      else applyDaylight()
      markShadowDirty()
    }
```

`markShadowDirty`는 3346행 근처에 이미 있다. **`renderer.shadowMap.autoUpdate`를 켜지 마라(R413).** 해가 움직이면 그림자를 다시 구워야 하므로 반드시 `markShadowDirty()`를 거친다.

### (마) `repaint`에서 네 줄을 지우고 호출로 바꾼다 (3866~3869행)

지금:

```ts
      hemi.color.set(theme.dark ? 0x5b7ba8 : 0xffffff)
      hemi.groundColor.set(theme.dark ? 0x1a222e : 0xdde3ec)
      hemi.intensity = theme.dark ? 0.85 : 0.84
      sun.intensity = theme.dark ? 0.8 : 0.5
      ambient.intensity = theme.dark ? 0.25 : 0.47
      fill.intensity = theme.dark ? 0.3 : 0.32
```

이 여섯 줄을 지우고 `applyLighting()` 한 줄로 바꾼다. `repaint` 안에서 `refreshRoomLighting()`도 함께 부른다(주간이면 전부 켜야 하므로).

369~389행 생성부의 `theme.dark ? A : B` 초기값은 그대로 둬도 된다. 초기 1회 `applyLighting()`을 `refreshRoomLighting`이 처음 불리기 전에 부른다.

### (바) 주간에는 꺼진 방이 없다

`setRoomLit` (3079행)을 고친다. 주간이면 방을 가르지 않는다.

```ts
    const setRoomLit = (path: string, lit: boolean) => {
      const lighting = roomGroups.get(path)?.lighting
      if (!lighting) return
      const day = !theme.dark
      // 주간에는 빛기둥과 바닥 웅덩이를 쓰지 않는다. 햇빛이 다 밝히므로 기둥이 뜨면 탁해 보인다.
      lighting.beamMaterial.opacity = day ? 0 : (lit ? 0.22 : 0)
      lighting.poolMaterial.opacity = day ? 0 : (lit ? 0.13 : 0)
      lighting.lineMaterial.opacity = day ? 0.34 : (lit ? 0.62 : 0)
      roomGroups.get(path)?.setFlagLit?.(day ? true : lit)
      const zoneMaterial = zoneMaterials.find((entry) => entry.room.path === path)
      if (zoneMaterial) {
        zoneMaterial.carpet.color.copy(zoneMaterial.baseColor)
        if (day) zoneMaterial.carpet.color.lerp(new THREE.Color(0xffffff), 0.18)
        else if (lit) zoneMaterial.carpet.color.lerp(new THREE.Color(0xffffff), 0.35)
      }
    }
```

`refreshRoomLighting` (3093행)에서 두 곳을 고친다.

```ts
      const day = !theme.dark
      roomGroups.forEach((entry, path) => {
        const lit = day || path === activeRoomPath || occupiedRoomPaths.has(path)
        ...
      })
```

그리고 점광원 배정에서, 주간이면 고른 방 하나만 약하게 준다.

```ts
      roomLights.forEach((light, index) => {
        const room = litRooms[index]
        if (!room || (day && room.path !== activeRoomPath)) {
          light.intensity = 0
          return
        }
        light.position.set(room.x, 3.4, room.z)
        if (day) light.intensity = 2.0
        else light.intensity = room.path === activeRoomPath ? 5.2 : 3.6
      })
```

**`ROOM_LIGHT_COUNT` 8을 늘리지 마라.** 열일곱 개면 셰이더 한도에 걸린다.

### (사) 룸 표지 밑 번짐도 주간에는 끈다

1227행 `lampHazeMaterial.opacity = lit ? 0.34 : 0`을 다음으로 바꾼다.

```ts
        lampHazeMaterial.opacity = theme.dark ? (lit ? 0.34 : 0) : 0
```

### (아) `setDaylight`를 api에 붙인다

`apiRef`에 넣는 객체에 더한다.

```ts
      setDaylight: (hour: number) => {
        daylightHour = hour
        if (!theme.dark) {
          applyDaylight()
          markShadowDirty()
        }
      },
```

컴포넌트 쪽 `useEffect` 하나를 `statsKey` 효과 옆에 더한다.

```ts
  useEffect(() => {
    apiRef.current?.setDaylight(daylightHour ?? 12)
  }, [daylightHour])
```

---

## 3. `src/routes/Meta.tsx`

### (가) 상태와 저장

컴포넌트 안에 더한다. **기본은 야간이다.**

```ts
const SCENE_MODE_KEY = "meta-scene-mode"

const [sceneMode, setSceneMode] = useState<"day" | "night">(() => {
  try {
    return localStorage.getItem(SCENE_MODE_KEY) === "day" ? "day" : "night"
  } catch {
    return "night"
  }
})
const [daylightHour, setDaylightHour] = useState(() => {
  const now = new Date()
  return Math.min(20, Math.max(6, now.getHours() + now.getMinutes() / 60))
})

useEffect(() => {
  const root = document.documentElement
  root.dataset.metaScene = sceneMode === "night" ? "night" : "day"
  try {
    localStorage.setItem(SCENE_MODE_KEY, sceneMode)
  } catch {
    // 사생활 보호 창에서는 저장이 막힌다. 화면은 그대로 돌아야 한다.
  }
  return () => {
    delete root.dataset.metaScene
  }
}, [sceneMode])
```

**`localStorage` 읽기와 쓰기를 모두 `try`로 감싼다.** 사생활 보호 창에서 던진다.

**정리 함수에서 속성을 지운다.** META를 떠난 뒤 다른 화면에 씬 토큰이 남을 이유가 없다.

### (나) 바탕화면 오버레이

331행의 캔버스 래퍼를 찾는다.

```tsx
<div className="overflow-hidden rounded-[14px] border border-[var(--border)] bg-[var(--card)] shadow-sm [height:clamp(280px,86vw,520px)] lg:min-h-[420px] lg:[height:calc(100vh-230px)]">
```

그 `className` 맨 앞에 `relative `를 더하고, `<Suspense>` **앞에** 오버레이를 넣는다.

```tsx
<div className="pointer-events-none absolute left-3 top-3 z-10 flex flex-col gap-2">
  <div className="pointer-events-auto flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--card)]/88 p-1 shadow-sm backdrop-blur">
    <button
      type="button"
      onClick={() => setSceneMode("day")}
      aria-pressed={sceneMode === "day"}
      className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${sceneMode === "day" ? "bg-[var(--primary)] text-[var(--primary-foreground)]" : "text-[var(--muted-foreground)]"}`}
    >
      <Sun className="size-3.5" aria-hidden="true" />주간
    </button>
    <button
      type="button"
      onClick={() => setSceneMode("night")}
      aria-pressed={sceneMode === "night"}
      className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${sceneMode === "night" ? "bg-[var(--primary)] text-[var(--primary-foreground)]" : "text-[var(--muted-foreground)]"}`}
    >
      <Moon className="size-3.5" aria-hidden="true" />야간
    </button>
  </div>
  {sceneMode === "day" ? (
    <label className="pointer-events-auto flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--card)]/88 px-3 py-1.5 shadow-sm backdrop-blur">
      <span className="text-[11px] text-[var(--muted-foreground)]">시각</span>
      <input
        type="range"
        min={6}
        max={20}
        step={0.5}
        value={daylightHour}
        onChange={(event) => setDaylightHour(Number(event.target.value))}
        className="w-28 accent-[var(--primary)]"
        aria-label="주간 시각"
      />
      <strong className="w-11 text-right text-[11px] tabular-nums">
        {`${String(Math.floor(daylightHour)).padStart(2, "0")}:${daylightHour % 1 ? "30" : "00"}`}
      </strong>
    </label>
  ) : null}
</div>
```

`Sun`과 `Moon`은 `lucide-react`에서 가져온다. 이 파일은 이미 `lucide-react`를 쓰고 있으니 기존 import 줄에 더한다.

### (다) 씬에 시각을 넘긴다

333행의 `<OfficeScene ... />`에 프롭 하나를 더한다.

```tsx
daylightHour={daylightHour}
```

---

## 하지 말 것

- **`.dark` 블록을 고치지 마라.** 앱 전체 다크 모드는 이번 건이 아니다.
- **`readTheme`의 `prefers-color-scheme` 폴백을 되살리지 마라.** 흰 페이지 안에 어두운 씬이 생긴다.
- **방마다 `PointLight`를 만들지 마라.** `ROOM_LIGHT_COUNT` 8이 상한이다.
- **`renderer.shadowMap.autoUpdate`를 켜지 마라.** `markShadowDirty()`를 쓴다.
- **유리를 `MeshPhysicalMaterial`로 되돌리지 마라(R413).** `transmission`이 매 프레임 전체 재렌더를 부른다.
- **모니터 재질을 `MeshLambertMaterial`로 바꾸지 마라.** 켜진 화면처럼 보이는 것은 `MeshBasicMaterial`이라서다.
- **재질 `color`를 직접 깎아 방을 어둡게 하지 마라.** 재질을 여러 방이 공유한다.
- **새 함수를 쓰는 자리보다 뒤에 정의하지 마라.** `useEffect` 하나가 3,900줄이고 TDZ는 타입 검사가 못 잡는다. 화면이 `RouteErrorBoundary`로 떨어진다.
- 그림자 카메라 범위(`left/right/top/bottom` ±60, `far` 140)는 그대로 둔다. `SUN_RADIUS` 86이면 그 안이다.

## 검증

`npm run build` 한 번만 돌린다(`tsc --noEmit` 포함). 통과하면 끝이다.

기준값: 직전 빌드에서 `OfficeScene` 청크 588.34 kB, `Meta` 청크 24.95 kB였다. 이번 변경은 조명 수식과 작은 오버레이라 `OfficeScene`은 600 kB 안쪽, `Meta`는 27 kB 안쪽이어야 한다. 크게 벗어나면 보고해라.

화면 확인은 사람이 한다. 하지 마라.
