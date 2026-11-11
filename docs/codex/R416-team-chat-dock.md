# R416 어느 화면에서나 뜨는 팀 채팅창

상태: 구현 완료. 2026-11-11 커밋. META에서 떠 있는 창을 숨기는 조건이 `if (!open)` 안에 있어 열린 채로는 겹치던 것을 같은 날 고쳤다.

박향근 요구(2026-11-10): "아바타를 직접 클릭해서 채팅할 수 있는 기능. 대화를 받는 사람은 웹 대시보드에 접속해 있을 경우, 대시보드 어느 화면에서든 고정해서 떠 있는 작은 채팅 팝업창이 있으면 좋겠다."

## 지금 무엇이 문제인가

`subscribeMetaChat` 호출처가 `src/routes/Meta.tsx` 한 곳뿐이다. **`/meta`를 보고 있지 않으면 메시지가 닿지 않는다.** DD MASTER에서 일하는 사람에게 보낸 말은 그 사람이 META를 열 때까지 아무 데도 안 뜬다. 여섯 명짜리 팀에서 대부분은 다른 화면에 있으므로 지금 채팅은 사실상 안 쓰인다.

## 비용부터 정한다

구독을 앱 수준으로 올리면 모든 사람이 모든 화면에서 리스너를 하나씩 든다. Firestore는 **문서가 리스너에 전달될 때마다 읽기로 과금한다**(R320에 같은 계산이 있다).

- 붙을 때: `limit(30)`이면 사람당 페이지 로드 1회에 30 읽기. 6명이 하루 20번 새로고침하면 3,600 읽기.
- 메시지 1건: 리스너 수만큼. 6명이면 6 읽기. 하루 200건이면 1,200 읽기.
- 합쳐서 하루 5,000 안쪽이다. 무료 한도 50,000 안이고 presence(17,280)와 합쳐도 여유가 있다.

**그래서 지켜야 하는 것 둘이다.**

1. **리스너는 앱 전체에 하나다.** 채팅창과 `/meta` 화면이 같은 구독을 나눠 쓴다. 각자 `onSnapshot`을 부르면 읽기가 두 배가 된다.
2. **`READ_LIMIT`을 50에서 30으로 줄인다.** 떠 있는 작은 창에 50건이 필요 없다.

## 비공개가 아니다

이번 건은 **지목이지 귓속말이 아니다.** 메시지에 받는 사람(`to`)을 적어 그 사람 화면에서 강조하고 안 읽음에 세는 것까지다. `metaChat` 한 컬렉션에 그대로 쌓이므로 승인된 사람은 누구나 읽을 수 있다.

진짜 1대1 비공개로 가려면 컬렉션을 따로 파고 `firestore.rules`를 고쳐 **사람이 직접 배포**해야 한다(`firebase deploy --only firestore:rules`, Actions가 안 올린다). 이번에는 하지 않는다. 지금 규칙은 `create`에서 필드를 제한하지 않으므로 **`to`를 더해도 규칙을 손댈 필요가 없다.**

## 파일별 조치

| 파일 | 할 일 |
|---|---|
| `src/data/meta-chat.ts` | 공유 구독 하나로 바꾸고 `to`, `toName`, 안 읽음 도우미를 더한다 |
| `src/components/layout/TeamChatDock.tsx` | 새 파일. 오른쪽 아래 고정 채팅창 |
| `src/App.tsx` | 채팅창을 레이아웃에 건다 |
| `src/routes/Meta.tsx` | 공유 구독으로 갈아타고, 아바타를 누르면 채팅창이 열리게 한다 |

---

## 1. `src/data/meta-chat.ts`

(가) `MetaChatMessage`에 두 줄 더한다.

```ts
  /** 받는 사람 uid. 비어 있으면 전체에게 한 말이다. 귓속말이 아니라 지목이다. */
  to?: string
  /** 받는 사람 이름. 보낸 시점의 이름을 그대로 둔다. */
  toName?: string
```

(나) `READ_LIMIT`을 30으로 줄인다.

(다) **공유 구독으로 바꾼다.** `subscribeMetaChat`의 이름과 서명은 그대로 두되, 안에서 리스너를 하나만 들고 구독자에게 나눠 준다.

```ts
type ChatListener = (messages: MetaChatMessage[]) => void
let liveMessages: MetaChatMessage[] = []
let listeners: ChatListener[] = []
let stopFeed: (() => void) | null = null

/**
 * 리스너는 앱 전체에 하나다. 화면마다 onSnapshot을 부르면 읽기가 화면 수만큼 늘어난다.
 * 구독자가 0이 되면 끊고, 처음 생기면 붙인다.
 */
export function subscribeMetaChat(onChange: ChatListener): () => void {
  listeners.push(onChange)
  onChange(liveMessages)
  if (!stopFeed) {
    const recent = query(collection(db, COLLECTION), orderBy("createdAt", "desc"), limit(READ_LIMIT))
    stopFeed = onSnapshot(recent, (snapshot) => {
      liveMessages = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as MetaChatMessage).reverse()
      listeners.forEach((listener) => listener(liveMessages))
    }, () => {
      liveMessages = []
      listeners.forEach((listener) => listener(liveMessages))
    })
  }
  return () => {
    listeners = listeners.filter((entry) => entry !== onChange)
    if (listeners.length === 0 && stopFeed) {
      stopFeed()
      stopFeed = null
      liveMessages = []
    }
  }
}
```

(라) `sendMetaChat`에 받는 사람을 더한다. 인자를 객체로 바꾸지 말고 **뒤에 선택 인자로 붙여라.** 기존 호출처가 그대로 돌아야 한다.

```ts
export async function sendMetaChat(
  text: string,
  room: string,
  name: string,
  color: string,
  to?: { uid: string; name: string },
): Promise<boolean>
```

`addDoc` 본문에는 `to`가 있을 때만 `to`와 `toName`을 넣는다. **`to: undefined`를 넣지 마라.** Firestore가 값 없는 키를 거부한다(R340).

(마) 안 읽음 기준선. 개인 브라우저 값이다.

```ts
const LAST_READ_KEY = "fabric.chat.lastRead.v1"

export function chatLastReadAt(uid: string): number { /* localStorage, 없으면 0 */ }
export function markChatRead(uid: string, at: number): void { /* localStorage */ }
export function unreadChatCount(messages: MetaChatMessage[], uid: string): number {
  const since = chatLastReadAt(uid)
  return messages.filter((message) => message.uid !== uid && (chatCreatedAtMillis(message.createdAt) ?? 0) > since).length
}
```

**`CACHE_KEYS`에 넣지 마라.** 브라우저마다 다른 값이다. `try/catch`로 감싸라. 사생활 보호 모드에서 `localStorage`가 던진다.

---

## 2. `src/components/layout/TeamChatDock.tsx` (새 파일)

오른쪽 아래에 고정으로 뜨는 작은 창이다.

- **접힌 모습**: 지름 48px 둥근 버튼. 안 읽음이 있으면 숫자 배지. 나를 지목한 메시지가 있으면 배지가 강조색이다.
- **펼친 모습**: 폭 320px, 높이 420px 패널. 머리(제목, 닫기), 메시지 목록, 입력칸.
- 메시지 줄: 보낸 사람 색 점, 이름, 시각(`HH:MM`), 본문. **나를 지목한 메시지는 왼쪽에 색 띠를 주고 `나에게`를 붙인다.**
- 받는 사람이 정해져 있으면 입력칸 위에 `→ 이름` 칩이 뜨고 x로 지운다.
- 펼치면 `markChatRead`로 기준선을 올린다.
- 새 메시지가 오면 목록을 맨 아래로 굴린다.

**지켜야 할 것**

- **승인된 사용자에게만 보인다.** `useAuthStore`의 `approval === "approved" || isOwner`가 아니면 아무것도 그리지 말고 구독도 하지 마라. 로그인 화면에 뜨면 안 된다.
- **`z-[80]`이다.** 일정 알림 카드가 `z-[90]`, 파싱 오버레이가 `z-[100]`, `UpdateBanner`가 `z-[1000]`이다. 그 밑에 둔다.
- **`/meta` 화면에서는 접힌 버튼을 숨겨라.** 그 화면에는 이미 오른쪽에 채팅 패널이 있다. `useLocation`으로 판정한다. 단 **구독은 유지한다.** 끊었다 붙이면 읽기가 다시 든다.
- 전송 실패(`sendMetaChat`이 `false`)를 조용히 넘기지 마라. 입력 글자를 지우지 말고 "보내지 못했습니다"를 한 줄 띄워라. 지금 `/meta` 패널은 먼저 지우고 결과를 버린다. 같은 실수를 하지 마라.
- 좁은 화면에서 오른쪽 아래 16px 여백을 두고, 폭이 모자라면 `calc(100vw - 32px)`로 줄여라.

---

## 3. `src/App.tsx`

`<ScheduleReminder />` 바로 위에 `<TeamChatDock />`를 건다. 레이아웃 안이라 어느 화면에서나 산다.

---

## 4. `src/routes/Meta.tsx`

(가) `subscribeMetaChat`은 그대로 쓴다. 공유 구독으로 바뀌었으므로 손댈 것이 없다.

(나) **아바타를 누르면 채팅창이 그 사람을 받는 사람으로 잡고 열린다.**

`handlePick`의 마지막 줄이 지금 이렇다.

```ts
    setFocusUid(kind === "person" && id ? id : null)
```

사람을 골랐을 때 카메라 이동은 그대로 두고, 채팅 대상도 같이 세운다. 창을 여는 신호는 **커스텀 이벤트 하나**로 보낸다. 전역 상태를 새로 만들지 마라.

```ts
    if (kind === "person" && id) {
      const target = people.find((person) => person.uid === id)
      if (target && !target.isSelf) {
        window.dispatchEvent(new CustomEvent("fabric:chat-open", { detail: { uid: target.uid, name: target.name } }))
      }
    }
```

`TeamChatDock`이 `fabric:chat-open`을 듣고 받는 사람을 세운 뒤 펼친다. **본인 아바타를 누를 때는 보내지 마라.**

(다) 오른쪽 패널의 접속 목록 사람 줄에 작은 `채팅` 버튼을 더한다. 누르면 같은 이벤트를 쏜다. 줄 전체를 누르는 것은 지금처럼 카메라 이동이다.

---

## 하지 말 것

- 커밋하거나 푸시하지 마라. 워킹트리 변경까지만 한다.
- 사용자가 만든 기존 변경을 `git reset`이나 `git checkout`으로 되돌리지 마라.
- 파일을 지우지 마라.
- **`onSnapshot`을 두 곳에서 부르지 마라.** 읽기가 두 배가 된다.
- **`firestore.rules`를 고치지 마라.** 이번 설계는 규칙 변경이 필요 없다. 고치면 사람이 직접 배포해야 하는 일이 생긴다.
- `metaChat`을 `CACHE_KEYS`에 넣지 마라.
- 옛 메시지를 지우는 코드를 만들지 마라. 서버가 없어 정리 작업을 돌릴 데가 없다.
- 알림음, 진동, 브라우저 `Notification` 권한 요청을 넣지 마라. 2026-11-04에 일정 알림에서 쓰지 않기로 정했다.
- `/meta`의 기존 채팅 패널을 지우지 마라. 방 탭이 있어 쓰임이 다르다.
- 이 저장소는 공개 저장소다. 실데이터, 단가, 협력사명, 개인 메일을 코드나 문서에 넣지 마라.
- `public/data` 아래 JSON을 열지 마라.
- `legacy/`, `legacy-vanilla/`, `backup/`은 읽지 마라.
- 같은 오류를 두 번 고쳐 실패하면 멈추고 보고해라.

## 검증

- 모든 수정을 마친 뒤 `npm run build`를 한 번만 돌린다.
- 개발 서버는 띄우지 마라. 화면 확인은 클로드가 한다.
- 보고는 수정 파일, 빌드 결과, 판단이 필요한 지점만.
