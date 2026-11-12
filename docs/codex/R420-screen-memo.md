# R420 화면 고정 메모(포스트잇)와 팀 채팅 독 제거

상태: 미착수.

박향근 요구(2026-11-12):

> 각 화면에 있는 팀 채팅 기능을 다른 형태로 바꾸고 싶다. 각 화면에 포스트잇 버튼을 채팅 형태로 만들고 클릭하면 어느 화면에나 이동 가능한 포스트잇 팝업이 뜨고 그 종이에 메모를 해서 각 화면에 위치시키고 접속하는 인원들이 그 메모를 지정 기간동안 볼 수 있게 하면 좋겠다. (중략) 디자인은 가장 많이 쓰는 포스트잇의 3가지 컬러로 하고 종이의 크기는 생성자가 조정할 수 있게한다. 이 메모 기능은 화면을 따라다니지 않고 각 화면에 고정되는 기능이다.

> 메모에 대한 답글도 달 수 있게 하자.

> 채팅 버튼은 일단 다 삭제하고 메타에 있는 채팅 기능은 유지는 하는데 버튼 따로 만들 거 없이 그냥 오른쪽 접속인원 상태 하단 박스만 history 유지하는걸로 하자.

> 메모 기능은 우리팀(통원부3팀)만 쓰는걸로

## 한 줄 요약

떠다니는 팀 채팅 독을 지우고 같은 자리에 포스트잇 버튼을 둔다. 메모는 경로(URL)에 고정되고 3팀만 읽고 쓴다. 답글이 달린다.

---

## 이미 조사한 사실. 다시 조사하지 마라

저장소를 다시 뒤지지 마라. 아래는 클로드가 코드를 열어 확인한 것이다.

1. **`TeamChatDock.tsx`와 META 오른쪽 패널의 대화 상자는 서로 다른 컴포넌트다.** 둘 다 `src/data/meta-chat.ts`의 `metaChat` 컬렉션을 쓰지만, META 쪽 UI는 `src/routes/Meta.tsx` 안에 자체 구현되어 있다. **독을 지워도 META 대화는 그대로 돈다.** META 쪽은 이 작업에서 손대지 않는다.

2. **독에서만 쓰는 export 넷이 있다.** `unreadChatCount`, `chatLastReadAt`, `markChatRead`, `ChatTarget`이다. `Meta.tsx`는 `chatCreatedAtMillis`, `sendMetaChat`, `subscribeMetaChat`, `MetaChatMessage` 넷만 쓴다. 확인 완료다.

3. **`fabric:chat-open` 커스텀 이벤트는 `Meta.tsx:266`이 쏘고 `TeamChatDock.tsx:65`만 듣는다.** 독을 지우면 쏘는 쪽이 죽은 코드가 된다. 아래 6번에서 처리한다.

4. **`users/{uid}` 문서에 `department` 필드가 있고 3팀 값은 `fabric3`이다.** 로그인하면 `src/data/auth.ts`의 `useAuthStore`에 `department: string | null`로 올라와 있다. 새로 읽어올 필요가 없다.

5. **`users` 컬렉션은 목록 조회가 막혀 있다.** `firestore.rules`의 `match /users/{uid}`가 본인 문서와 소유자에게만 읽기를 연다. **그래서 팀원 명부를 만들 수 없고, 답글의 "지목(받는 사람 지정)" 기능은 이번 범위에서 뺀다.** 규칙을 바꿔야 하는 일이라 따로 뗀다.

6. **`logAction`(`src/data/audit.ts:174`)은 `AuditKind`와 `AuditScreen` 열거형을 받는다.** 메모용 값을 추가해야 해서 **이번에는 감사 로그를 붙이지 않는다.**

7. **채팅 버튼의 현재 모양**은 `TeamChatDock.tsx:116`이다. 포스트잇 버튼이 이 자리와 크기를 그대로 받는다.

```
fixed bottom-4 right-4 z-[80] flex size-12 items-center justify-center rounded-full
bg-[var(--primary)] text-[var(--primary-foreground)] shadow-lg outline-none
hover:brightness-105 focus-visible:ring-[3px] focus-visible:ring-[var(--ring)]
```

8. **그만 보기 저장 방식의 본보기**는 `src/data/today-briefing.ts`의 `isBriefingHidden` / `hideBriefingToday`다. localStorage를 try/catch로 감싸고 실패해도 화면 동작은 유지한다. 같은 모양으로 쓴다.

---

## 뒤집지 말 것 (이미 정해진 사양)

- **메모는 화면을 따라다니지 않는다.** 경로에 고정이다. 다른 화면으로 가면 그 화면 메모만 보인다.
- **3팀 전용이다.** 화면에서 숨기는 것으로 끝내지 말고 **Firestore 규칙에서도 막는다.**
- **탭 단위 고정은 이번 범위가 아니다.** 경로(`location.pathname`) 단위까지만 한다. 쿼리 문자열은 키에 넣지 않는다.
- **답글은 메모 문서 안 배열이 아니라 별도 컬렉션이다.** 배열은 서버 시각을 못 넣고, 답글 하나에 메모 문서 전체가 모든 리스너에 다시 전달되고, 답글 단위 권한을 못 건다.
- **리스너는 앱 전체에 둘뿐이다**(메모 하나, 답글 하나). 화면마다 `onSnapshot`을 부르지 마라. Firestore는 문서가 리스너에 전달될 때마다 과금한다.
- **새 답글이 달려도 팝업을 다시 띄우지 않는다.** 뱃지와 점으로만 알린다.
- **좌표는 픽셀이 아니라 비율(0~1)로 저장한다.** 픽셀로 저장하면 다른 해상도에서 화면 밖으로 나간다.
- **이 앱은 해시 라우터다.** 경로는 반드시 react-router의 `useLocation().pathname`에서 얻어라. `window.location.pathname`은 base인 `/-3-/`만 돌려준다.
- **Firestore는 값이 `undefined`인 키를 거부한다**(R340). `updateMemo(id, patch)`에서 `{ ...x, key: undefined }`를 쓰지 말고 키를 아예 빼라. `screenMemos`는 `state` 청크가 아니라 별도 컬렉션이라 `JSON.stringify`가 걸러 주지 않는다. 저장이 통째로 실패한다.
- **만료된 메모는 읽을 때 거른다. 자동 삭제는 없다.** 서버가 없어 정리 작업을 돌릴 데가 없다. `metaChat`도 같은 이유로 옛 메시지를 안 지운다.
- `CACHE_KEYS`(`src/data/cache.ts:7`)에 메모를 **넣지 마라.** 로컬 캐시 동기화 대상이 아니다.

---

## 파일별 조치

| 파일 | 조치 |
|---|---|
| `src/data/screen-memo.ts` | **신규.** 타입, 리스너 둘, 쓰기 함수, localStorage 헬퍼 |
| `src/components/layout/MemoDock.tsx` | **신규.** 버튼과 포스트잇 렌더링 |
| `src/components/layout/TeamChatDock.tsx` | **삭제** |
| `src/App.tsx` | 11행 import와 226행 마운트를 `MemoDock`으로 교체 |
| `src/data/meta-chat.ts` | 독 전용 export 넷 제거 |
| `src/routes/Meta.tsx` | `openChat`을 입력창 채우기로 교체 |
| `firestore.rules` | 컬렉션 둘 추가 |

---

## 1. `src/data/screen-memo.ts` (신규)

`src/data/meta-chat.ts`의 구조를 본떠라. 구독 하나를 여러 곳이 나눠 쓰는 refcount 방식이 거기 있다.

```ts
export type MemoColor = "yellow" | "pink" | "blue"
export type MemoSize = "s" | "m" | "l"

export interface ScreenMemo {
  id: string
  /** react-router `useLocation().pathname` 그대로. 쿼리는 넣지 않는다. */
  path: string
  text: string
  color: MemoColor
  size: MemoSize
  /** 화면 안 위치. 0~1 비율이다. 픽셀이 아니다. */
  x: number
  y: number
  /** 화면을 열 때 자동으로 펼칠지. 작성자가 정한다. */
  pinned: boolean
  /** "YYYY-MM-DD". 이 날짜까지 보인다. 타임존 문제를 피하려고 문자열로 둔다. */
  expiresAt: string
  uid: string
  name: string
  createdAt: unknown
  updatedAt: unknown
}

export interface MemoReply {
  id: string
  memoId: string
  text: string
  uid: string
  name: string
  createdAt: unknown
}
```

상수와 규칙:

```ts
const MEMO_COLLECTION = "screenMemos"
const REPLY_COLLECTION = "screenMemoReplies"
/** 활성 메모 상한. 넘으면 옛 것이 안 보인다. */
const MEMO_LIMIT = 200
/** 답글 상한. 전체 기준이다. */
const REPLY_LIMIT = 300
/** 메모 하나에 달 수 있는 답글 수. 넘으면 입력창을 막고 안내한다. */
export const REPLY_PER_MEMO = 50
export const MEMO_TEXT_MAX = 500
export const REPLY_TEXT_MAX = 300
/** 기본 보존 기간(일). 작성자가 7, 14, 30 중에 고른다. */
export const MEMO_DAYS = [7, 14, 30] as const
```

크기는 세 단이고 픽셀 값은 여기서 정한다. 작성자가 고르는 것은 이 셋뿐이다. 자유 리사이즈는 넣지 마라.

```ts
export const MEMO_SIZES: Record<MemoSize, { w: number; h: number }> = {
  s: { w: 180, h: 170 },
  m: { w: 240, h: 230 },
  l: { w: 320, h: 300 },
}
```

색은 CSS 변수를 쓰지 않는다. 포스트잇은 실물 색이라 밝은 모드와 어두운 모드에서 같아야 한다. 글자색까지 한 벌로 고정한다.

```ts
export const MEMO_COLORS: Record<MemoColor, { bg: string; edge: string; ink: string }> = {
  yellow: { bg: "#FEF3A7", edge: "#F0DE7C", ink: "#4A3F0B" },
  pink: { bg: "#FCCFE0", edge: "#F3B4CC", ink: "#4F1030" },
  blue: { bg: "#C7E2FB", edge: "#A6CDF5", ink: "#10324F" },
}
```

함수:

- `subscribeScreenMemos(onChange)`: `query(collection(db, MEMO_COLLECTION), orderBy("createdAt", "desc"), limit(MEMO_LIMIT))`. 구독자 수를 세고 마지막 하나가 떠날 때 `onSnapshot`을 끊는다.
- `subscribeMemoReplies(onChange)`: 같은 방식, `REPLY_LIMIT`.
- `createMemo(input)`: `addDoc`. `createdAt`과 `updatedAt`은 `serverTimestamp()`. 본문이 비면 쓰지 않는다. `MEMO_TEXT_MAX`에서 자른다.
- `updateMemo(id, patch)`: 본문, 색, 크기, 위치, 만료일, 중요 표시를 고친다. `updatedAt` 갱신.
- `deleteMemo(id)`: 메모 문서만 지운다. 답글은 남는다(아래 참조).
- `addReply(memoId, text, name)` / `deleteReply(id)`
- `memoIsActive(memo, todayKey)`: `memo.expiresAt >= todayKey`. 문자열 비교로 충분하다. `YYYY-MM-DD`는 사전순이 곧 날짜순이다.
- `repliesOf(replies, memoId)`: **메모가 없는 답글은 걸러낸다.** 메모를 지우면 답글이 고아로 남는데 지울 방법이 없다. 보이지만 않게 한다.

localStorage 두 벌. `src/data/view-prefs.ts`의 `saveViewPref`를 쓰고, 읽기는 try/catch로 감싼다.

```ts
/** { [memoId]: true }. 사용자가 "그만 보기"를 누른 메모. */
const HIDDEN_KEY = "memo.hidden"
/** { [memoId]: epochMillis }. 답글을 마지막으로 본 시각. */
const READ_KEY = "memo.read"
```

`chatLastReadAt`(`meta-chat.ts:111`)이 같은 꼴의 맵을 쓴다. 그대로 본떠라. **이 둘은 Firestore에 올리지 마라.** 사람마다 브라우저마다 다른 값이고, 올리면 읽기가 는다.

---

## 2. `firestore.rules`

`metaChat` 블록 아래에 넣는다. 3팀 판정 함수를 새로 만든다.

```
    // 통합원단부 3팀 전용. 화면에서 숨기는 것만으로는 콘솔로 읽히므로 규칙에서 막는다.
    function isTeam3() {
      return isOwner()
        || (exists(/databases/$(database)/documents/users/$(request.auth.uid))
            && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.department == 'fabric3');
    }

    // 화면 고정 메모(R420). 본인 글만 고치고 지운다. 소유자는 전부 지울 수 있다.
    match /screenMemos/{docId} {
      allow read: if isTeam3();
      allow create: if isTeam3() && request.auth.uid == request.resource.data.uid;
      allow update: if isOwner() || (isTeam3() && request.auth.uid == resource.data.uid);
      allow delete: if isOwner() || (isTeam3() && request.auth.uid == resource.data.uid);
    }

    match /screenMemoReplies/{docId} {
      allow read: if isTeam3();
      allow create: if isTeam3() && request.auth.uid == request.resource.data.uid;
      allow update: if false;
      allow delete: if isOwner() || (isTeam3() && request.auth.uid == resource.data.uid);
    }
```

`isApproved()`는 그대로 둔다. 다른 컬렉션이 쓴다.

**배포는 사람이 한다.** 규칙 파일만 고치고 `firebase deploy`를 돌리지 마라. 외부 자격증명이 필요하다.

---

## 3. `src/components/layout/MemoDock.tsx` (신규)

### 띄울지 말지

```ts
const user = useAuthStore((state) => state.user)
const isOwner = useAuthStore((state) => state.isOwner)
const department = useAuthStore((state) => state.department)
const allowed = Boolean(user) && (isOwner || department === "fabric3")
```

`allowed`가 거짓이면 **아무것도 렌더하지 않고 구독도 걸지 않는다.** 소유자 계정은 `department` 값과 무관하게 통과시킨다.

**`/meta`에서는 버튼을 숨긴다.** META는 오른쪽 패널이 그 높이를 쓰고 3D 화면이라 종이를 붙일 자리가 아니다. `useLocation().pathname === "/meta"`면 `null`을 반환한다.

### 버튼

`TeamChatDock.tsx:116`의 클래스를 그대로 쓴다. 아이콘만 바꾼다. `lucide-react`의 `StickyNote`를 쓴다.

뱃지는 **이 화면의 활성 메모 수**다. 0이면 뱃지를 숨긴다. 답글이 새로 달린 메모가 있으면 뱃지 색을 `bg-[var(--destructive)]`로 바꾼다. 없으면 `bg-slate-600`이다. 독의 `hasDirectUnread` 처리와 같은 꼴이다.

### 종이

`position: fixed`로 띄운다. 좌표는 비율을 뷰포트 크기에 곱해 구하고, 화면 밖으로 나가지 않게 가둔다.

```ts
const left = Math.min(Math.max(memo.x, 0), 1) * (window.innerWidth - size.w)
const top = Math.min(Math.max(memo.y, 0), 1) * (window.innerHeight - size.h)
```

**종이는 `z-40`이다.** 이 앱의 `DialogContent`가 `z-50`이라 그보다 높으면 **포스트잇이 팝업을 덮는다.** 올리지 마라. 버튼만 채팅 독이 쓰던 `z-[80]`을 그대로 받는다. 일정 알림 카드(`z-[90]`), 파싱 오버레이(`z-[100]`), `UpdateBanner`(`z-[1000]`)가 그 위에 있고 그 셋은 건드리지 않는다.

종이 안 구성은 위에서부터 이렇다.

1. 머리줄: 작성자 이름, 만료일(`~11/19` 꼴), 닫기 단추
2. 본문
3. 답글 영역: **최근 2개만 보인다.** 더 있으면 `답글 N개 더 보기`를 누르면 그 영역이 스크롤되는 목록으로 펼쳐진다. **종이 크기는 그대로 둔다.** 답글이 늘어도 종이가 커지지 않는다.
4. 답글 입력 한 줄
5. 바닥줄: `이 메모 그만 보기` 체크박스

작성자 본인에게만 고치기와 지우기 단추를 보인다.

### 드래그

머리줄을 잡아 끈다. 본문은 드래그 손잡이가 아니다. 글자 선택을 막으면 안 된다.

**저장은 손을 뗄 때 한 번만 한다.** 끄는 동안 `updateMemo`를 부르지 마라. 1.5초보다 짧은 간격의 연속 쓰기는 막는다. `presence.ts`의 `writePresenceSpot`에 같은 제한이 있다.

**작성자만 옮길 수 있다.** 남의 메모는 못 끈다. 규칙에서도 막히니 조용히 실패하게 두지 말고 손잡이를 아예 비활성으로 둔다.

### 언제 펼치는가

화면이 바뀔 때마다 이렇게 판정한다.

| 조건 | 결과 |
|---|---|
| 이 경로의 메모 중 `pinned`이고 만료 전이고 그만 보기가 아닌 것 | **자동으로 펼친다** |
| `pinned`이 아닌 메모 | 뱃지 숫자에만 들어간다 |
| 그만 보기를 누른 메모 | 자동으로 안 뜬다. 버튼을 누르면 보인다 |
| 만료된 메모 | 아무 데도 안 나온다 |

버튼을 누르면 **그만 보기한 것까지 포함해** 이 경로의 활성 메모를 전부 펼친다. 한 번 더 누르면 접는다. 그만 보기를 영구 추방으로 만들지 마라. 되돌릴 길이 없으면 사람이 겁나서 안 누른다.

### 새 메모 만들기

버튼을 길게 누르거나 우클릭하는 식으로 숨기지 마라. 펼친 상태의 버튼 옆에 `+ 메모` 단추를 둔다. 누르면 화면 가운데에 빈 종이가 뜨고 색 3개, 크기 3단, 기간(7/14/30일), 중요 표시를 고를 수 있다. 기본값은 노랑, m, 14일, 중요 꺼짐이다.

`path`는 **지금 경로를 그대로** 넣는다. `/fabric/FL1234` 같은 상세 화면이면 그 원단에만 붙는다. 의도한 동작이다.

---

## 4. `src/App.tsx`

11행 import를 바꾸고 226행 마운트를 바꾼다. 위치와 순서는 그대로다.

```tsx
import { MemoDock } from "@/components/layout/MemoDock"
...
      <MemoDock />
```

---

## 5. `src/data/meta-chat.ts` 정리

독에서만 쓰던 것을 지운다. 끊는 쪽만 지우고 만드는 쪽을 남기면 죽은 코드가 쌓인다.

- `unreadChatCount` 삭제
- `chatLastReadAt` 삭제
- `markChatRead` 삭제
- `ChatTarget` 타입이 이 파일에 있으면 삭제

**`sendMetaChat`의 `to` 매개변수와 `MetaChatMessage`의 `to` / `toName` 필드는 남긴다.** 이미 저장된 문서에 값이 들어 있다. 타입에서 빼면 옛 문서를 읽을 때 어긋난다.

`READ_LIMIT = 30`은 그대로 둔다. META 대화가 최근 30건만 보이는 것은 바꾸지 않는다.

---

## 6. `src/routes/Meta.tsx`

`openChat`(265행)이 쏘는 `fabric:chat-open`을 듣는 쪽이 사라진다. 이벤트를 걷고 **그 자리에서 대화 입력창을 채우는 것으로 바꾼다.** 기능을 조용히 없애지 마라.

```tsx
  const openChat = useCallback((_uid: string, name: string) => {
    setDraft((current) => (current.startsWith(`${name} `) ? current : `${name} ${current}`))
  }, [])
```

호출하는 두 곳(294행 아바타 클릭, 496행 목록의 채팅 단추)은 그대로 둔다. 단추 글자와 아이콘도 그대로다.

`setDraft`가 그 자리에서 쓸 수 있는지 확인하고, 선언 순서 때문에 못 쓰면 `openChat` 정의를 `draft` 상태 선언 뒤로 옮겨라. **이 파일은 선언 순서가 늘 함정이다.**

---

## 검증

```
npm run build
```

`tsc --noEmit`이 포함되어 있다. **모든 수정을 마친 뒤 한 번만 돌려라.**

끝나면 `git status --short`로 바뀐 파일이 위 표와 같은지 본다. 그 밖의 파일이 바뀌었으면 보고하라.

화면 동작 확인은 박향근이 직접 한다. 네가 개발 서버를 띄우거나 로그인을 시도하지 마라.

---

## 하지 말 것

- 커밋하거나 푸시하지 마라. 워킹트리 변경까지만 한다.
- 사용자가 만든 기존 변경을 `git reset`이나 `git checkout`으로 되돌리지 마라.
- 이 저장소는 공개 저장소다. 실데이터, 단가, 협력사명, 개인 메일을 코드나 문서에 넣지 마라.
- `firebase deploy`를 돌리지 마라. 외부 자격증명이 필요하다.
- `public/data` 아래 JSON을 열지 마라. `feed.json`은 2.8MB다.
- `legacy/`, `legacy-vanilla/`, `backup/`은 읽지 마라.
- `src/routes/Meta.tsx`의 3D 씬 부분을 건드리지 마라. 6번에 적은 `openChat` 한 곳뿐이다.
- 메모 기능에 감사 로그, 지목, 탭 단위 고정, 읽음 표시를 넣지 마라. 이번 범위가 아니다.
- 같은 오류를 두 번 고쳐 실패하면 멈추고 보고하라.
- 마지막 보고는 수정 파일, 빌드 결과, 판단이 필요한 지점만 적어라. 바꾼 코드를 다시 붙이지 마라.
