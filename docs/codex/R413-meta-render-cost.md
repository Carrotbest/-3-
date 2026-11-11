# R413 META 가상 오피스 렌더 비용 다섯 가지

상태: 구현 완료. 2026-11-11 커밋.

파일은 `src/components/meta/OfficeScene.tsx` 하나뿐이다. 다른 파일은 열지도 고치지도 않는다.

겉보기를 바꾸는 작업이 아니다. 같은 화면을 더 적은 일로 그리게 하는 것이 전부다.

---

## 1. 유리 재질의 transmission을 없앤다

### 근거

`materials.glass`가 `MeshPhysicalMaterial`이고 `transmission: 0.15`다. 설치된 three 0.160.1 소스에서 확인한 것이다.

- `node_modules/three/src/renderers/webgl/WebGLRenderLists.js` 111행이 `material.transmission > 0.0`인 물체를 `transmissive` 목록에 따로 담는다.
- `node_modules/three/src/renderers/WebGLRenderer.js` 1410행이 그 목록이 비어 있지 않으면 `renderTransmissionPass`를 부른다.
- 그 함수(1428행)가 매 프레임 이렇게 한다. 캔버스 해상도 그대로(1465행) half-float에 MSAA 4배짜리 렌더 타깃을 잡고, 불투명 물체 전부를 거기 다시 그리고(1488행), MSAA를 풀고(1491행) 밉맵 체인을 전부 다시 만든다(1492행). 그러고 나서 본 화면에 불투명 물체를 또 그린다.

즉 유리 때문에 장면 전체가 매 프레임 한 번씩 더 그려진다. 불투명도가 0.16에서 0.22라 거의 안 보이는 유리다.

`transmission`이 0이면 111행 분기를 안 타고 저 패스가 통째로 사라진다.

### 조치

333행 `geometries` 아래 `materials` 객체의 `glass`를 아래로 바꾼다.

```ts
      glass: new THREE.MeshLambertMaterial({
        color: theme.glass,
        transparent: true,
        opacity: theme.dark ? 0.16 : 0.22,
        depthWrite: false,
      }),
```

`roughness`와 `transmission`은 없앤다. `MeshPhysicalMaterial`은 이 파일에서 여기 한 곳에만 쓰인다.

`repaint`(3087행)가 `materials.glass.color`와 `materials.glass.opacity`만 만지므로 그대로 둔다.

`addRoomWalls`(1238행)의 `materials.glass.clone()`도 그대로 둔다. Lambert도 `clone()`이 된다.

---

## 2. 그림자 맵을 필요할 때만 다시 굽는다

### 근거

`renderer.shadowMap.enabled = true`, 타입이 `PCFSoftShadowMap`, 해 그림자 맵이 2048 × 2048이다.

`node_modules/three/src/renderers/webgl/WebGLShadowMap.js` 66행에서 `autoUpdate`가 기본 `true`이고, 75행이 `autoUpdate === false && needsUpdate === false`일 때만 건너뛴다. 지금은 끈 적이 없으므로 매 프레임 그림자용으로 장면을 한 번 더 그린다.

이 씬은 거의 전부 고정이다. 움직이는 것은 아바타뿐이다.

### 조치

(가) 269행 `renderer.shadowMap.enabled = true` 아래에 한 줄 더한다.

```ts
    renderer.shadowMap.autoUpdate = false
```

(나) 그 바로 아래에 더러움 표시를 둔다. 선언 위치가 중요하다. `posePerson`, `syncPeople`, `repaint`, `tick`이 모두 이 변수를 봐야 하므로 **effect 맨 앞, renderer를 만든 직후**에 선언한다.

```ts
    // 그림자 맵은 autoUpdate를 껐다. 장면이 바뀐 프레임에만 다시 굽는다.
    // 두 프레임을 굽는 것은 걷기가 멈춘 마지막 자세까지 반영하기 위해서다.
    let shadowFrames = 2
    const markShadowDirty = () => {
      shadowFrames = 2
    }
```

(다) `markShadowDirty()`를 부르는 자리는 넷이다.

1. `posePerson`(2548행 근처) 함수 본문 맨 끝.
2. `syncPeople`(2801행) 함수 본문 맨 앞.
3. `repaint`(3087행) 함수 본문 맨 끝.
4. `tick`의 사람 루프 안, `const walking = distance > 0.045` 바로 아래에 `if (walking) markShadowDirty()`.

(라) `tick`에서 `renderer.render(scene, camera)` **바로 앞**에 넣는다.

```ts
      if (shadowFrames > 0) {
        renderer.shadowMap.needsUpdate = true
        shadowFrames -= 1
      }
```

`WebGLShadowMap.js` 197행이 그리고 나서 `needsUpdate`를 스스로 내린다. 우리가 내릴 필요가 없다.

(마) 씬을 다 세운 뒤 첫 프레임이 반드시 구워지도록, `tick()`을 처음 부르는 자리 바로 앞에 `markShadowDirty()`를 한 번 더 넣는다.

---

## 3. 쉬는 중에는 초당 24장만 그린다

### 근거

`tick`이 조건 없이 `renderer.render`를 부른다. 아무도 안 움직이고 카메라도 멈춰 있어도 초당 60번 1번과 2번의 비용을 치른다.

깃발과 머리 위 공은 늘 흔들리게 돼 있어서 아예 멈출 수는 없다. 그래서 **멈추는 것이 아니라 느리게 그린다.** 흔들림 폭이 작아 24fps에서도 끊겨 보이지 않는다.

### 조치

(가) `const clock = new THREE.Clock()`(3156행) 근처에 상태를 둔다.

```ts
    const IDLE_FRAME_MS = 1000 / 24
    let lastDrawAt = 0
    let lastInteractionAt = 0
    let someoneWalking = false
    const markInteraction = () => {
      lastInteractionAt = performance.now()
    }
```

**`markInteraction`은 `handleControlChange`보다 위에 선언해야 한다.** 선언 위치를 옮기기 어려우면 `let lastInteractionAt = 0`만 effect 앞쪽으로 올리고 핸들러에서 `lastInteractionAt = performance.now()`를 직접 대입해도 된다.

(나) `markInteraction()`을 부르는 자리.

- `handleControlChange`(2422행) 본문 맨 앞. 이 이벤트는 damping이 잦아드는 동안 매 프레임 뜨므로 관성 이동이 자연스럽게 60fps로 돈다.
- `handlePointerDown`(2965행), `handlePointerMove`(2968행), `handlePointerUp`(2980행), `handleKeyDown`(3017행), `handleDoubleClick`(3037행) 각 본문 맨 앞.
- `syncPeople`(2801행) 본문 맨 앞. 목적지가 바뀌면 바로 깨어나야 한다.

(다) `tick` 맨 앞을 아래로 바꾼다. **`clock.getDelta()`를 건너뛰기 판정 뒤로 옮기는 것이 핵심이다.** 앞에 두면 건너뛴 시간이 버려져 애니메이션이 느려진다.

```ts
    const tick = () => {
      animationFrame = window.requestAnimationFrame(tick)
      const nowMs = performance.now()
      const active = cameraTween !== null || someoneWalking || nowMs - lastInteractionAt < 500
      if (!active && nowMs - lastDrawAt < IDLE_FRAME_MS) return
      lastDrawAt = nowMs
      const delta = Math.min(clock.getDelta(), 0.05)
      elapsed += delta
```

(라) 사람 루프에서 걷는 사람이 있는지 모은다. `personVisuals.forEach` 바로 앞에 `let walkingThisFrame = false`를 두고, 루프 안 `const walking = distance > 0.045` 아래에서 `if (walking) walkingThisFrame = true`로 세우고, 루프가 끝난 다음 줄에서 `someoneWalking = walkingThisFrame`로 받는다.

2번 (다) 4항의 `if (walking) markShadowDirty()`와 같은 자리이므로 한 줄로 합쳐도 된다.

### 하지 말 것

- 렌더를 아예 멈추지 마라. 깃발과 머리 위 공이 얼어붙어 화면이 고장 난 것처럼 보인다.
- `IDLE_FRAME_MS`를 24fps보다 낮추지 마라. 카메라를 막 놓은 직후가 끊겨 보인다.
- 건너뛴 프레임에서 `controls.update()`를 부르지 마라. 위 구조대로 `return`하면 저절로 안 불린다.

---

## 4. 픽셀 배율 상한을 1.5로 내린다

267행을 바꾼다.

```ts
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
```

`antialias: true`는 그대로 둔다. 2배 디스플레이에서 그리는 픽셀 수가 44% 준다. 아이소메트릭 뷰라 차이가 거의 안 보인다.

---

## 5. 머리 위 이모지 텍스처를 기분별로 한 장씩만 만든다

### 근거

`moodCanvas`가 1536 × 512 캔버스를 만드는데 `updateMoodEmoji`가 **사람마다 따로** 부른다. 기분은 `good`, `normal`, `tired`, `stuck` 넷뿐인데 사람 수만큼 텍스처가 생긴다. RGBA 기준 한 장이 3 MB가 넘고 화면에서는 20픽셀짜리 공이다.

R412에서 들어간 것이고 설계가 틀린 것이다.

### 조치

(가) `moodCanvas`의 크기를 줄인다. 셀 폭이 가로의 6분의 1이고 `k`가 셀 폭에 비례하므로 둘을 같이 반으로 줄인다.

```ts
    const moodCanvas = (mood: PresenceMood) => {
      const canvas = document.createElement("canvas")
      canvas.width = 768
      canvas.height = 256
      const context = canvas.getContext("2d")
      if (!context) return canvas
      context.fillStyle = MOOD_COLORS[mood]
      context.fillRect(0, 0, 768, 256)
      for (let cell = 0; cell < 6; cell += 1) drawMoodEmoji(context, cell * 128 + 64, 128, 8, mood, "#2b3340")
      return canvas
    }
```

(나) 바로 아래에 기분별 텍스처 창고를 둔다. **`textureOf`보다 뒤에 선언해야 한다.** `textureOf`는 760행이고 `moodCanvas`는 그보다 뒤에 있으므로 그 자리면 된다.

```ts
    // 기분은 넷뿐이다. 사람마다 만들면 20픽셀짜리 공 하나에 3MB 텍스처가 사람 수만큼 생긴다.
    const moodTextures = new Map<PresenceMood, THREE.CanvasTexture>()
    const moodTextureOf = (mood: PresenceMood) => {
      const existing = moodTextures.get(mood)
      if (existing) return existing
      const texture = textureOf(moodCanvas(mood))
      moodTextures.set(mood, texture)
      return texture
    }
```

(다) `updateMoodEmoji`를 아래로 바꾼다. **`map?.dispose()` 줄을 반드시 지워야 한다.** 이제 공유 텍스처라 한 사람이 기분을 바꾸면 남의 공까지 빈 텍스처가 된다.

```ts
    const updateMoodEmoji = (visual: PersonVisual, person: PresencePerson) => {
      const mood: PresenceMood = person.mood ?? "normal"
      if (visual.moodBall.userData.mood !== mood) {
        visual.moodBall.userData.mood = mood
        visual.moodBall.material.map = moodTextureOf(mood)
        visual.moodBall.material.needsUpdate = true
      }
      const statusColor = person.status ? STATUS_COLORS[person.status] : undefined
      visual.statusDot.visible = Boolean(statusColor)
      if (statusColor) visual.statusDot.material.color.set(statusColor)
    }
```

(라) **사람이 빠질 때 공유 텍스처가 같이 버려지는 것을 막는다.** 이게 이 항목에서 제일 위험한 자리다.

`disposeObject`(233행)가 `material.map`을 찾아 `texture.dispose()`를 부른다(244~249행). 사람이 접속을 끊으면 `syncPeople`의 제거 분기에서 `disposeObject(visual.group)`을 부르는데, 그대로 두면 **남아 있는 다른 사람들의 공 텍스처까지 버려진다.**

`syncPeople` 안 `scene.remove(visual.group)`과 `disposeObject(visual.group)` 사이에 한 줄 넣는다.

```ts
        visual.moodBall.material.map = null
```

(마) effect의 정리 함수에서 `disposeObject(scene)` 다음 줄에 더한다. 아무도 접속하지 않은 채 화면을 떠나면 창고의 텍스처를 아무도 안 버리기 때문이다.

```ts
      moodTextures.forEach((texture) => texture.dispose())
```

---

## 하지 말 것

- 커밋하거나 푸시하지 마라. 워킹트리 변경까지만 한다.
- 사용자가 만든 기존 변경을 `git reset`이나 `git checkout`으로 되돌리지 마라.
- 파일을 하나도 지우지 마라.
- `src/components/meta/OfficeScene.tsx` 밖의 파일을 고치지 마라.
- 이 저장소는 공개 저장소다. 실데이터, 단가, 협력사명, 개인 메일을 코드나 문서에 넣지 마라.
- `public/data` 아래 JSON을 열지 마라. `archive.json`은 2.5MB다.
- `legacy/`, `legacy-vanilla/`, `backup/`은 읽지 마라.
- 외부 자격증명이 필요한 명령은 돌리지 마라.
- **방 좌표, 가구, 카메라 극각, 조명 세기, 아바타 생김새, 섹션 간판을 건드리지 마라.** 이번 건은 렌더 비용만이다. 겉보기가 달라지면 틀린 것이다.
- `castShadow`와 `receiveShadow`를 끄고 다니지 마라. 2번은 굽는 **횟수**를 줄이는 것이지 그림자를 없애는 것이 아니다.
- 같은 오류를 두 번 고쳐 실패하면 멈추고 보고해라.

## 검증

- 모든 수정을 마친 뒤 `npm run build`를 한 번만 돌린다. `tsc --noEmit`이 포함돼 있다.
- 통과하면 끝이다. 개발 서버를 띄우지 마라.
- 마지막 보고는 수정 파일, 빌드 결과, 판단이 필요한 지점만 적어라. 바꾼 코드를 다시 붙이지 마라.
