# R320 상단바 접속자 표시 (1단계)

상태: **미착수.**

## 목적

웹에 접속한 승인 사용자를 상단바 우측에 아바타로 보이고, 호버하면 이름과 지금 보고 있는 화면을 알린다. 팀즈 공동 편집 표시의 가장 바깥 층만 만든다.

**1단계만 만든다.** 행 범위 추적(2단계)과 셀 단위 커서(3단계)는 범위 밖이다. 2026-10-08에 박향근이 1단계만 하기로 정했다.

## 하지 말 것과 그 이유

- **`src/data/firestore-sync.ts`를 수정하지 마라.** 접속 정보는 `state/{key}` 청크 동기화와 완전히 별개다. 그 파일을 건드리면 R240 트랜잭션 병합이 위험해진다.
- **`src/data/cache.ts`의 `CACHE_KEYS`에 아무것도 더하지 마라.** 동기화 구독이 `CACHE_KEYS`에 없는 문서를 건너뛰는 구조이고, 접속 정보는 `state` 컬렉션이 아니라 별도 컬렉션이다. `state/mailRecipients`가 같은 이유로 `CACHE_KEYS`에 없다.
- **`saveCache`, `pushCache`, `saveCacheLocal`을 쓰지 마라.** 접속 정보는 IndexedDB에 남길 값이 아니다.
- **`logAction`(작업 이력)을 부르지 마라.** 하트비트가 이력을 초당 단위로 더럽힌다. 90일 보관 문서가 폭증한다.
- **Realtime Database를 도입하지 마라.** 1단계 쓰기량은 Firestore로 충분하다. RTDB는 이 프로젝트에 아직 없고 콘솔에서 새로 만들어야 한다.
- **하트비트 간격을 60초보다 짧게 하지 마라.** Firestore는 리스너에 문서가 전달될 때마다 읽기로 과금한다. 사람 수의 제곱으로 늘어난다. 6명 60초 기준 하루 쓰기 2,880회, 읽기 17,280회로 무료 한도(쓰기 20,000, 읽기 50,000) 안쪽이다. 30초로 줄이면 읽기가 34,560회가 되고 사람이 늘면 바로 넘는다.
- **아바타에 `backdrop-filter`(`backdrop-blur`)나 번짐 그림자를 넣지 마라.** 2026-10-07에 REQUEST 칩에 글라스 효과를 넣었다가 표 전체가 떨려 전량 되돌렸다. 상단바는 `sticky`이고 아래 표가 `sticky` 열을 쓴다.
- **셀, 행, 선택 범위를 전송하지 마라.** 1단계는 `pathname`까지다.

## 파일별 조치

| 파일 | 조치 |
|---|---|
| `src/data/presence.ts` | 신규. 타입, 쓰기, 구독 |
| `src/components/layout/PresenceStack.tsx` | 신규. 아바타 묶음 UI |
| `src/components/layout/Topbar.tsx` | 수정. 아바타 묶음 삽입 |
| `firestore.rules` | 수정. `presence/{uid}` 블록 추가 |

## 1. `src/data/presence.ts` (신규)

```ts
export interface PresenceEntry {
  uid: string
  email: string
  /** Firebase Auth displayName. 없으면 빈 문자열. */
  name: string
  /** 현재 경로(pathname). 예 `/development/workspace` */
  path: string
  /** routeDefinitions의 title. 못 찾으면 빈 문자열. */
  screen: string
  /** serverTimestamp. 읽을 때 Timestamp. */
  updatedAt: unknown
}
```

컬렉션은 `presence`, 문서 id는 `uid`다.

필요한 함수 네 개다.

- `writePresence(path: string): Promise<void>` — `setDoc(doc(db,"presence",uid), {...}, { merge: true })`. `updatedAt`은 `serverTimestamp()`. 승인 사용자가 아니거나 로그인 전이면 아무것도 하지 않고 반환한다. 실패는 조용히 삼킨다(`catch {}`). 접속 표시 실패가 화면을 막아선 안 된다.
- `clearPresence(): Promise<void>` — `deleteDoc`. 실패는 삼킨다.
- `subscribePresence(onChange: (entries: PresenceEntry[]) => void): () => void` — `onSnapshot(collection(db,"presence"))`. 콜백에 넘기기 전에 거른다. (1) 자기 `uid` 제외. (2) `updatedAt`이 없거나 **150초보다 오래된 항목 제외**. 정렬은 `name` 또는 `email` 오름차순으로 고정한다. 순서가 흔들리면 아바타가 춤춘다.
- `screenTitleOf(path: string): string` — `routeDefinitions`에서 찾는다. 정확히 일치하는 것을 먼저 보고, 없으면 `path.startsWith(definition.path)`를 **경로 길이 내림차순**으로 본다. `Topbar.tsx` 25~28행의 `currentRoute` 계산과 같은 규칙이다. 그 로직을 이 함수로 뽑아 `Topbar.tsx`에서도 쓰게 해도 좋다.

**150초은 하트비트 60초의 두 배 여유다.** 탭을 그냥 닫으면 `pagehide`가 못 돌 수 있어 유령이 남는데, 이 필터가 최대 150초 뒤에 치운다. Firestore에는 접속 종료를 서버가 아는 수단이 없다.

React 훅 하나를 같은 파일이나 `PresenceStack.tsx`에 둔다.

- 마운트 시 1회 `writePresence(pathname)`.
- `pathname`이 바뀌면 다시 쓴다.
- 60초 `setInterval` 하트비트. **문서가 숨겨져 있으면(`document.hidden`) 쓰지 않는다.** 백그라운드 탭이 쓰기를 쌓지 않게 한다.
- `visibilitychange`로 다시 보이게 되면 즉시 한 번 쓴다.
- `pagehide`에서 `clearPresence()`를 시도한다. `beforeunload`가 아니라 `pagehide`다(모바일 사파리에서 `beforeunload`가 안 온다).
- 언마운트와 로그아웃에서 interval을 해제하고 `clearPresence()`를 부른다.

승인 상태는 `useAuthStore`의 `approval === "approved"` 또는 `isOwner`로 본다. `approval`이 `"approved"`가 아니면 쓰지도 구독하지도 않는다.

## 2. `src/components/layout/PresenceStack.tsx` (신규)

- `subscribePresence`를 구독해 목록을 들고 있는다.
- **목록이 비면 `null`을 반환한다.** 빈 자리를 남기지 않는다.
- 아바타는 원형이고 이니셜을 넣는다. 이름이 있으면 첫 글자, 없으면 이메일 로컬파트 첫 글자를 대문자로 쓴다. `@radix-ui/react-avatar`가 이미 의존성에 있다. `src/components/ui/`에 avatar 래퍼가 있으면 그것을 쓰고, 없으면 `div`로 만들어도 된다. 새 의존성을 추가하지 마라.
- **최대 4명까지 보이고 나머지는 `+N` 원형 하나로 접는다.**
- 겹쳐 놓는다(`-space-x-2` 정도)고 각 아바타에 `ring-2 ring-[var(--background)]`를 줘 경계를 만든다.
- 각 아바타에 `title={`${표시이름} · ${screen}`}`를 건다. `screen`이 비면 이름만 쓴다. 표시이름은 `name`이 있으면 `name`, 없으면 이메일 로컬파트다.
- 접근성: 묶음 컨테이너에 `aria-label="접속 중인 팀원"`을 준다. 아바타는 장식이 아니므로 이니셜 글자를 실제 텍스트로 넣고 `aria-hidden`을 걸지 마라.
- 색은 토큰만 쓴다. 배경은 `var(--muted)`, 글자는 `var(--muted-foreground)`, `+N`은 `var(--accent)` 계열로 한다. 고정 hex를 쓰지 마라.
- 좁은 화면에서는 숨긴다. 컨테이너에 `hidden sm:flex`를 준다. 상단바가 모바일에서 이미 빽빽하다.

## 3. `src/components/layout/Topbar.tsx` (수정)

56행 `{user ? (` 다음 57행이 이 줄이다.

```tsx
        <div className="flex shrink-0 items-center gap-2">
```

그 `div`의 **첫 자식**으로 `<PresenceStack />`을 넣는다. 58행의 편집 권한 배지(`<span className={...}>`)보다 앞이다. import를 파일 상단 import 묶음에 더한다.

25~28행 `currentRoute` 계산을 `screenTitleOf`로 바꿔도 되지만 필수는 아니다. 바꾼다면 결과가 같아야 한다(정확 일치 우선, 그다음 `startsWith`를 경로 길이 내림차순으로).

`Topbar.tsx`의 다른 부분은 건드리지 마라. 편집 권한 배지, 이메일 표시, 계정 설정 버튼, 로그아웃은 그대로다.

## 4. `firestore.rules` (수정)

`trendStars` 블록과 같은 모양으로 더한다. 위치는 `trendStars` 블록 바로 다음이다.

```
    match /presence/{uid} {
      allow read: if isApproved();
      allow create, update: if isApproved() && request.auth.uid == uid;
      allow delete: if isOwner() || (isApproved() && request.auth.uid == uid);
    }
```

**규칙 배포는 하지 마라. 파일만 고친다.** 이 PC에 firebase CLI가 없어 박향근이 콘솔 규칙 탭에서 직접 게시한다. 게시 전에는 맨 아래 `match /{document=**} { allow read, write: if false }`에 걸려 접속 표시가 전부 거부된다. 그건 예상된 상태다.

## 검증

1. `npm run build` 한 번. 모든 수정을 마친 뒤에 돌린다.
2. `git status --short`로 위 표의 네 파일과 이 문서만 바뀌었는지 본다.

화면 확인은 하지 마라. 로그인이 필요하고 규칙 게시 전이라 어차피 보이지 않는다. 박향근이 규칙을 올린 뒤에 두 브라우저로 확인한다.
