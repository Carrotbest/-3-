# R394 — META 가상 오피스 1단계: 라우트와 지연 로딩

상태: 미착수.

2026-11-06 박향근 지시. 가상 오피스를 사이드바 HOME 바로 밑에 `META`라는 화면으로 만든다. 거기서 다듬다가 어느 정도 되면 HOME 메인으로 올릴지 나중에 정한다.

**1단계는 뼈대까지다.** 가구와 작업 이력 연결은 2단계와 3단계로 따로 간다. 이 지시서에 없는 것을 미리 만들지 마라.

## 반드시 지킬 것 두 가지

### 1. 메인 번들이 무거워지면 안 된다

박향근 요구다. "웹 사이트 자체의 로딩속도에 영향 없이 매끄럽게 보여져야한다."

`three`는 압축 전 약 600KB다. 지금 앱은 라우트를 전부 정적 import 한다(`src/App.tsx` 24~40행). 그대로 더하면 **META를 안 여는 사람도 three를 내려받는다.** 그러면 안 된다.

- `App.tsx`에서 META만 `React.lazy`로 가른다. 나머지 라우트는 건드리지 마라.
- `vite.config.ts`의 `optimizeDeps.include`에 `three`를 넣지 마라. 넣으면 dev에서 사전번들에 섞인다.
- `manualChunks`를 새로 쓰지 마라. `lazy`면 Vite가 알아서 청크를 가른다.
- 검증에서 `dist/assets` 안에 three가 **별도 파일**로 떨어지고, 메인 진입 청크에 three가 없는 것을 확인한다.

### 2. 아바타를 팀으로 묶지 마라

박향근 요구다. "가상오피스내 아바타들을 팀으로 묶지 말고 접속한 각 개인의 활동을 모두 보여줘."

- 담당자 4명을 모아 집계 막대를 세우는 구성을 만들지 마라. 참고 파일에 그런 코드가 있는데 **가져오지 마라.**
- 단위는 `presence/{uid}` 한 줄, 곧 **접속한 사람 한 명**이다. 3팀이든 1팀이든 창고팀이든 똑같이 한 명으로 선다.
- `MEMBERS`, `SAMPLE_OWNERS` 같은 팀 명단으로 사람을 거르거나 묶지 마라. 아바타 색을 고를 때만 참고한다.

## 참고 파일

`.codex-runs/R394-reference-scene.html` 에 같은 화면을 단일 HTML로 만들어 둔 것이 있다(gitignore 대상, 저장소에 커밋되지 않는다). **씬을 짜는 방식만 참고한다.** 방 좌표, 카메라 설정, 라벨 스프라이트 만드는 법, 사람 모델이 거기 있다.

그대로 베끼면 안 되는 것:
- 그 파일의 `PRESENCE`, `MEMBERS` 상수는 예시 데이터다. **실데이터를 쓴다.**
- 팀 자리(`buildMemberSeat`)와 담당자 막대는 위 2번 때문에 **가져오지 마라.**
- 오른쪽 패널 HTML은 React 컴포넌트로 다시 짠다.

## 파일별 조치

| 파일 | 조치 |
|---|---|
| `package.json` | `three` 의존성 추가. 버전 `^0.160.0`. `@types/three`도 devDependencies에 같은 메이저로 |
| `src/data/screen-permissions.ts` | 권한 키 `metaOffice` 추가 |
| `src/routes/route-config.ts` | 라우트 정의와 네비 항목 추가 |
| `src/App.tsx` | `lazy` + `Suspense`로 META 라우트 등록 |
| `src/routes/Meta.tsx` | 새 파일. 화면 껍데기 |
| `src/components/meta/OfficeScene.tsx` | 새 파일. three.js 씬 |
| `src/components/meta/usePresencePeople.ts` | 새 파일. presence 구독 훅 |

## 1. 권한

`src/data/screen-permissions.ts`

`SCREEN_PERMISSION_OPTIONS`에서 `home` 바로 다음 줄에 넣는다.

```ts
{ key: "metaOffice", label: "META", paths: ["/meta"] },
```

**키 이름을 `meta`로 하지 마라.** `meta`는 이미 `CACHE_KEYS`에 있는 저장 키다(`src/data/cache.ts` 7행). 이름이 겹치면 `CACHE_KEY_SCREENS`에서 둘이 섞인다.

`SCREEN_PERMISSION_GROUPS`의 `업무` 묶음 `keys` 맨 앞 `home` 다음에 `metaOffice`를 넣는다.

`READ_ONLY_KEYS`에 `metaOffice`를 더한다. 이 화면은 보기만 하는 화면이라 편집 단계가 뜰 이유가 없다.

`DEFAULT_NONE_KEYS`에는 **넣지 마라.** 접속자 목록은 이미 상단바 아바타로 전원에게 보이는 값이라 새로 가릴 것이 없다.

`CACHE_KEY_SCREENS`는 손대지 마라. 이 화면은 저장 키가 없다.

## 2. 라우트와 네비

`src/routes/route-config.ts`

`routeDefinitions`에서 `/` 바로 다음 줄에 넣는다.

```ts
{ path: "/meta", title: "META", subtitle: "지금 접속한 사람들이 어느 화면에서 무엇을 하고 있는지 공간으로 봅니다." },
```

`navigationGroups`의 `개요` 묶음 `items`에서 HOME 바로 다음에 넣는다. 아이콘은 `lucide-react`의 `Boxes`가 이미 WAREHOUSE에 쓰이므로 `Building2`를 쓴다. import를 더한다.

```ts
{ label: "META", path: "/meta", icon: Building2 },
```

## 3. App.tsx 지연 로딩

`src/App.tsx`

- `react` import에 `lazy`와 `Suspense`를 더한다.
- 라우트 컴포넌트 import 줄 근처에 둔다. **정적 import로 가져오지 마라.**

```ts
const Meta = lazy(() => import("@/routes/Meta").then((m) => ({ default: m.Meta })))
```

- `<Route path="/" ...>` 바로 다음 줄에 등록한다. `Suspense`는 그 라우트 하나만 감싼다. 전체 `<Routes>`를 감싸지 마라.

```tsx
<Route path="/meta" element={<Suspense fallback={<MetaFallback />}><Meta /></Suspense>} />
```

- `MetaFallback`은 `App.tsx` 안의 작은 함수여도 되고 `Meta.tsx`에서 export 해도 된다. 내용은 화면 높이를 차지하는 회색 자리와 `가상 오피스를 불러오는 중입니다` 한 줄이다. 스피너 라이브러리를 들이지 마라.

- `RouteErrorBoundary`는 이미 바깥에 있다. 그대로 둔다.

## 4. `src/routes/Meta.tsx`

화면 껍데기다. three를 **직접 import 하지 마라.** 이 파일은 가볍게 두고 씬만 또 한 번 가른다.

```ts
const OfficeScene = lazy(() => import("@/components/meta/OfficeScene").then((m) => ({ default: m.OfficeScene })))
```

구성은 이렇다. 이 앱의 다른 화면(`Rdda.tsx`, `TechnicalReferences.tsx`)의 머리말과 카드 모양을 따른다.

- 머리말: 제목 `META`, 부제 `routeDefinitions`의 subtitle. 오른쪽에 접속 인원 수.
- 본문 2단: 왼쪽이 씬 카드, 오른쪽이 접속자 패널. 좁아지면 한 단으로 쌓는다.
- 씬 카드 안에 `<Suspense>`로 `OfficeScene`을 감싼다. fallback은 같은 높이의 회색 자리.
- 씬 높이는 `clamp(380px, 60vh, 620px)`. 좁은 화면(`lg` 미만)에서는 `clamp(250px, 74vw, 430px)`.

오른쪽 패널은 **접속자 개인 목록**이다. 팀으로 묶지 않는다. 한 사람마다 한 줄이고 아래를 보인다.

- 이름(`PresenceEntry.name`, 비면 이메일 앞부분)
- 지금 보는 화면(`PresenceEntry.screen`, 비면 `screenTitleOf(path)`)
- 마지막 갱신에서 지난 시간(`updatedAt` 기준, `방금`, `1분 전`, `N분 전`)
- 줄을 누르면 그 사람에게 카메라가 가고 그 사람만 표시가 강조된다.

접속자가 없으면 `지금 접속한 사람이 없습니다` 한 줄을 띄운다. **예시 사람을 만들어 채우지 마라.**

## 5. `src/components/meta/usePresencePeople.ts`

`src/data/presence.ts`의 `subscribePresence`와 `screenTitleOf`를 그대로 쓴다. **그 파일을 고치지 마라.** 특히 하트비트 60초를 줄이지 마라. Firestore 읽기 과금이 사람 수의 제곱으로 는다(R320).

훅이 돌려주는 것은 배열 하나다. 항목마다 `uid`, `name`, `path`, `screen`, `ago`(초), `color`다.

색 고르는 규칙:
- `src/data/schema.ts`의 `MEMBERS`에 이름이 있으면 그 사람 고유 색을 준다. 색 표를 이 파일 안에 상수로 둔다(`박근후` `#7b61c9`, `박향근` `#2f7fd0`, `김지현` `#2a9d78`, `변재휘` `#c97a2a`).
- 없으면 `uid` 문자열의 문자 코드 합으로 팔레트에서 고른다. **랜덤을 쓰지 마라.** 새로 고칠 때마다 색이 바뀌면 누가 누군지 못 알아본다.
- 이것이 `MEMBERS`를 쓰는 유일한 자리다. 사람을 거르거나 묶는 데 쓰지 마라.

## 6. `src/components/meta/OfficeScene.tsx`

three.js 씬이다. 참고 파일의 구조를 TypeScript React로 옮긴다.

### 받는 값

```ts
interface OfficeSceneProps {
  people: PresencePerson[]
  focusUid: string | null
  onPick: (kind: "room" | "person", id: string) => void
}
```

### 씬 내용 (1단계 범위)

- 바닥 한 장. 크기 52 × 40, 중심 `(-1, 0, -1)`.
- 방 16개. 좌표와 크기, 구역 색은 참고 파일의 `ROOMS`와 `ZONES` 그대로다. 다만 **방 목록은 상수를 새로 쓰지 말고 `routeDefinitions`를 읽어 만든다.** 화면이 늘면 방도 늘어야 한다. 좌표만 이 파일 안의 표에서 `path`로 찾는다. 표에 없는 경로는 그리지 않는다.
- 방마다 낮은 벽 두 면(북, 서), 구역 색 띠, 카펫, 책상 1~3개, 방 이름 핀.
- 접속한 사람마다 아바타 하나. 그 사람의 `path`에 해당하는 방 앞에 선다. 같은 방에 여럿이면 가로로 벌린다.
- 아바타 위 이름표에 **이름과 지금 보는 화면 이름**을 함께 적는다. 두 줄이 아니라 한 줄에 `이름 · 화면` 꼴이다.
- `focusUid`와 같은 사람은 발밑 고리를 굵게 하고 나머지는 흐리게 한다.

가구, 창문, 바닥 재질, 앉은 자세는 **2단계다. 만들지 마라.**

### 카메라와 조작

참고 파일 그대로다. `OrthographicCamera`, `OrbitControls`, `FIT_H = 42`, `FIT_W = 64`, 화면 비율에 맞춰 담는 `resize`.

### 테마

이 앱은 `:root`에 CSS 변수를 두고 어두운 모드를 쓴다. 씬 색도 변수에서 읽는다. `src/index.css`의 `:root`와 어두운 모드 블록 **양쪽에** 아래를 더한다. 한쪽만 더하면 그 모드에서 색이 없다.

| 토큰 | 밝은 모드 | 어두운 모드 |
|---|---|---|
| `--scene-bg` | `#dde3ec` | `#161c24` |
| `--scene-floor` | `#e8ecf2` | `#232a34` |
| `--scene-wall` | `#cfd6e0` | `#39414d` |
| `--scene-desk` | `#b99a74` | `#7a6a55` |
| `--scene-metal` | `#9aa4b2` | `#5d6774` |
| `--scene-screen` | `#5b7fd6` | `#6f93e6` |

테마가 바뀌면 색을 다시 먹인다. 참고 파일의 `repaint`와 같은 방식으로 `MutationObserver`와 `matchMedia` 둘 다 본다.

### 정리

컴포넌트가 사라질 때 `renderer.dispose()`, `controls.dispose()`, 만든 geometry와 texture를 모두 `dispose()` 하고 `ResizeObserver`와 `requestAnimationFrame`을 끊는다. **이것을 빠뜨리면 화면을 오갈 때마다 GPU 메모리가 샌다.** React 화면이라 단일 HTML과 다르다.

`prefers-reduced-motion`이 켜져 있으면 움직임을 끈다.

## 하지 말 것

- 예시 데이터나 더미 사람을 만들지 마라. 접속자가 없으면 빈 오피스가 맞다.
- `src/data/presence.ts`를 고치지 마라.
- 다른 화면의 파일을 고치지 마라. 위 표에 없는 파일은 건드리지 마라.
- `firestore.rules`를 고치지 마라. presence 규칙은 이미 있다.
- 외부 3D 파일(.glb, 이미지)을 쓰지 마라. 전부 코드로 만든다.
- `@react-three/fiber`나 `drei`를 들이지 마라. 순수 three만 쓴다.
- 커밋하거나 푸시하지 마라.
- 파일은 `Get-Content -Encoding UTF8`로 읽어라. 한글 문구를 영어로 바꾸지 마라.
- 갈아치운 코드를 `~Legacy` 같은 이름으로 남기지 마라. 지운다.
- 코드를 한 줄로 눌러 담지 마라.

## 검증

1. `npm install` 한 번(three 추가 때문이다).
2. `npm run build` 한 번. `tsc --noEmit`이 포함되어 있다. 통과해야 한다.
3. 빌드 뒤 `dist/assets`를 보고 아래를 확인해 보고에 적어라.
   - three가 들어간 청크 파일 이름과 크기
   - 메인 진입 청크 이름과 크기, 그리고 그 안에 three가 **없다는** 것
4. `git status --short`로 바뀐 파일이 위 표와 새 파일 셋뿐인지 확인해라.

화면 확인은 하지 마라. 박향근이 직접 본다.

마지막 보고에는 고친 파일, 청크 크기 숫자, 판단이 필요했던 지점만 적어라. 코드를 다시 붙이지 마라.
