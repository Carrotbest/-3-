# R248 로그인 화면 비밀번호 찾기 + 담당자 이름 필수화

상태: 미착수.

## 배경

두 가지를 더한다.

1. 로그인 화면에 일반적인 홈페이지처럼 "비밀번호 찾기"를 넣는다. "아이디 찾기"도 요청받았지만, 이 앱은 로그인 전 방문자가 Firestore `users` 컬렉션을 읽지 못하게 막혀 있다(직원 이메일 유출 방지, `firestore.rules` 25~32행). 사용자와 상의한 결과 **아이디 찾기는 규칙을 풀지 않고 안내 문구로 대체하기로 확정했다.** 다시 묻지 말 것.
2. 화면 곳곳(창고 담당자, FABRIC REQUEST 담당자, 분석 의뢰 Requester 등)이 담당자 이름으로 쓰는 값은 Firebase Auth의 `displayName`이다(`state.user?.displayName || state.user?.email?.split("@")[0] || ""` 패턴, `Warehouse.tsx` 512행 등 6곳 이상). 가입 화면(`AuthExperience.tsx`)은 이미 이름을 받아 `updateProfile`로 `displayName`을 채우지만(`auth.ts` `signUp`), **이 이름을 나중에 고칠 방법이 없고, 이름을 안 넣은 채 넘어간 기존 계정은 계속 이메일 앞부분이 담당자로 찍힌다.** 배포 후 로그인한 사용자 중 `displayName`이 없는 사람은 이름을 넣어야 나머지 화면을 쓸 수 있게 막는다.

## 1. 비밀번호 찾기

### `src/data/auth.ts`

`firebase/auth`에서 `sendPasswordResetEmail`을 새로 import한다.

```ts
/** 로그인 화면의 "비밀번호 찾기". 가입 여부와 무관하게 항상 같은 안내를 보인다(계정 존재 유출 방지). */
export async function requestPasswordReset(email: string): Promise<void> {
  const trimmed = email.trim()
  if (!trimmed) throw new Error("이메일을 입력하세요.")
  try {
    await sendPasswordResetEmail(auth, trimmed)
  } catch (error) {
    const code = (error as { code?: string }).code
    // user-not-found는 계정 존재 여부를 알려주는 신호라 일부러 성공과 같은 화면으로 둔다(호출부에서 처리).
    if (code === "auth/invalid-email") throw new Error("이메일 형식이 올바르지 않습니다.")
    if (code === "auth/too-many-requests") throw new Error("시도가 너무 많습니다. 잠시 후 다시 시도하세요.")
    if (code === "auth/user-not-found") return
    throw new Error("요청을 처리하지 못했습니다. 잠시 후 다시 시도하세요.")
  }
}
```

`auth/user-not-found`를 성공과 똑같이 조용히 넘기는 것이 핵심이다(호출부가 항상 같은 "메일을 보냈습니다" 문구를 보이게 한다). 다른 에러만 실제로 던진다.

### `src/components/auth/AuthExperience.tsx`

`AuthDialog` 안, 로그인 모드(`mode === "login"`)일 때만 비밀번호 입력 칸 아래에 작은 링크 "Forgot password?"를 추가한다.

- 누르면 폼 자리가 "비밀번호 재설정" 미니 폼으로 바뀐다(로그인 폼을 감추고 대체하거나, 같은 `DialogBody` 안에서 상태 전환). 이메일 입력 칸 하나(로그인 폼에 입력해 둔 이메일이 있으면 미리 채운다) + "재설정 메일 보내기" 버튼 + "로그인으로 돌아가기" 링크.
- 버튼을 누르면 `requestPasswordReset(email)`을 호출하고, 성공/실패와 무관하게(위 함수가 이미 user-not-found를 삼킨다) 안내를 보인다: "입력하신 이메일로 비밀번호 재설정 메일을 보냈습니다. 메일함을 확인하세요(가입되지 않은 이메일이면 메일이 오지 않습니다)." 에러가 실제로 던져진 경우(형식 오류 등)만 오류 메시지를 보인다.
- 로그인 폼 영역 어딘가(이메일 입력 칸 근처)에 옅은 안내 한 줄을 추가한다: "아이디를 잊으셨나요? 로그인 아이디는 가입할 때 쓴 이메일입니다. 확인이 어려우면 관리자(박향근)에게 문의하세요." 별도 화면 전환 없이 고정 문구로만 둔다(클릭 동작 없음).
- 두 안내 모두 영어 UI 톤(`AuthDialog`의 다른 문구는 영어)과 맞추고 싶으면 영어로 써도 되지만, 두 번째(아이디 찾기 대체 문구)는 국문으로 둬도 된다(관리자 이름이 한글이라 자연스럽다). 기존 프로젝트는 영/국문이 섞여 있다(`AuthDialog`는 영어, 나머지 대부분은 국문) — 일관성보다 명확성을 우선한다.

## 2. 담당자 이름 필수화

### `src/data/auth.ts`: 이름 변경 함수

```ts
/** 로그인한 사용자가 자신의 표시 이름(담당자 이름)을 바꾼다. Firebase Auth displayName과 Firestore users/{uid}.name을 함께 갱신한다. */
export async function changeOwnName(name: string): Promise<void> {
  const trimmed = name.trim()
  if (!trimmed) throw new Error("이름을 입력하세요.")
  const user = auth.currentUser
  if (!user) throw new Error("로그인이 필요합니다.")
  try {
    await updateProfile(user, { displayName: trimmed })
    await setDoc(doc(db, "users", user.uid), { name: trimmed }, { merge: true })
    // Zustand는 setState를 부르면 구독자를 다시 평가한다(참조가 같아도 무방). 이게 빠지면
    // defaultOwner류 값이 다음 로그인 전까지 화면에 반영되지 않는다.
    useAuthStore.setState({ user: auth.currentUser })
  } catch (error) {
    const code = (error as { code?: string }).code
    throw new Error(code ? accountActionError(code) : (error as Error).message)
  }
}
```

`updateProfile`은 이미 import되어 있다(`signUp`에서 쓴다). `setDoc`, `doc`도 이미 import되어 있다.

### `firestore.rules`: 본인 이름만 스스로 고칠 수 있게

지금 `users/{uid}` 규칙(25~32행)은 `update, delete`를 소유자만 허용한다. **`name` 필드 하나만** 본인이 고칠 수 있게 좁게 연다:

```
allow update: if isOwner()
  || (isSignedIn() && request.auth.uid == uid
      && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['name']));
```

`status`, `access`, `department`, `screenPermissions`, `email` 등 다른 필드는 여전히 소유자만 바꿀 수 있다(`hasOnly(['name'])`가 그 필드들의 변경을 막는다). `isSignedIn()` 헬퍼는 이미 파일 위쪽에 정의되어 있을 것이다(다른 규칙에서 쓰는 것과 같은 이름 사용).

### `src/components/auth/AccountSettingsDialog.tsx`: "이름" 탭 추가

- `type AccountTab = "password" | "email"` → `"password" | "email" | "name"`.
- 탭 버튼 목록에 `tabButton("name", "이름 변경", <UserRound className="size-3.5" />)`를 추가한다(`lucide-react`에서 `UserRound` import, `AuthExperience.tsx`가 이미 쓰는 아이콘과 같은 것).
- 이름 탭은 소유자도 쓸 수 있다(이메일 탭과 달리 잠그지 않는다).
- 폼: 현재 이름(placeholder로 `user?.displayName` 표시) + 새 이름 입력 칸 하나. 현재 비밀번호 재확인은 요구하지 않는다(비밀번호·이메일 변경과 달리 민감한 보안 동작이 아니다).
- 제출 시 `changeOwnName(newName)` 호출. 성공하면 "이름을 바꿨습니다."를 보이고 입력 칸을 `user?.displayName`(갱신된 값)으로 되돌린다.
- `submit()` 함수의 `tab` 분기에 `"name"` 케이스를 추가한다(기존 `if (tab === "password") ... else` 구조를 `if/else if/else`로 확장).

## 3. 이름 없는 사용자를 막는 화면

### `src/data/auth.ts`: 게이트에서 쓸 헬퍼

새 export 필요 없음. `useAuthStore((state) => state.user?.displayName)`을 게이트에서 직접 읽으면 된다.

### `src/components/auth/AuthExperience.tsx`: `LoginGate` 수정

지금:

```ts
if (isOwner || approval === "approved") return <>{children}</>
```

이 줄을 아래로 바꾼다:

```ts
if (isOwner || approval === "approved") {
  if (!isOwner && !user?.displayName?.trim()) return <NameRequiredScreen />
  return <>{children}</>
}
```

`user`는 `useAuthStore((state) => state.user)`로 `LoginGate` 컴포넌트 상단에서 이미 꺼내 쓰고 있거나 새로 꺼낸다(`isOwner`, `approval`과 같은 자리).

**소유자는 이 화면 대상에서 뺀다**(소유자 계정이 이름 없이 만들어졌더라도 잠기면 안 된다. 소유자는 계정 설정에서 스스로 언제든 채울 수 있다).

새 컴포넌트 `NameRequiredScreen`을 `StatusScreen`과 같은 파일(`AuthExperience.tsx`)에 추가한다. `StatusScreen`의 레이아웃(카드, `LandingBackdrop`)을 참고하되 내용은 입력 폼이다:

- 제목: "담당자 이름을 입력하세요" / 설명: "화면에 표시되는 담당자 이름을 아직 넣지 않았습니다. 계속하려면 이름을 입력하세요."
- 이름 입력 칸 하나 + "저장하고 계속" 버튼.
- 제출 시 `changeOwnName(name)` 호출. 성공하면 `useAuthStore`의 `user`가 갱신되어(`changeOwnName` 안에서 이미 `setState` 한다) `LoginGate`가 다시 평가되고 자동으로 `children`이 보인다(별도 네비게이션 불필요, 조건이 바뀌면 리렌더된다).
- 실패 시 오류 메시지를 폼 아래에 보인다.
- 로그아웃 링크도 하나 둔다("다른 계정으로 로그인" 버튼, `StatusScreen`의 `signOutUser` 패턴 재사용 — 이름을 잘못된 계정으로 넣게 된 경우 빠져나갈 방법이 있어야 한다).

## 하지 말 것

- "아이디 찾기"를 위해 `firestore.rules`의 `users` 읽기 권한을 풀지 마라(로그인 전 읽기 금지 유지). 이번 건의 `firestore.rules` 변경은 **본인 문서의 `name` 필드 쓰기 하나만** 추가한다.
- `status`, `access`, `department`, `email` 필드를 본인이 고칠 수 있게 규칙을 열지 마라.
- 소유자 계정을 이름 필수 화면 대상에 넣지 마라.
- 비밀번호 재설정에서 `auth/user-not-found`를 사용자에게 노출하지 마라(계정 존재 유출).
- 기존 `changeOwnPassword`, `requestLoginEmailChange`, `signUp`, `signIn` 동작을 바꾸지 마라.
- 실명, 메일 주소를 코드나 문서에 넣지 마라.

## 검증

- `npm run build` 통과.
- `git status --short`가 아래 범위 안.

| 파일 | 조치 |
|---|---|
| `src/data/auth.ts` | `requestPasswordReset`, `changeOwnName` 추가 |
| `firestore.rules` | `users/{uid}` update 규칙에 본인 `name` 필드 쓰기 추가 |
| `src/components/auth/AuthExperience.tsx` | 비밀번호 찾기 미니 폼, 아이디 찾기 안내 문구, `NameRequiredScreen`, `LoginGate` 분기 |
| `src/components/auth/AccountSettingsDialog.tsx` | "이름 변경" 탭 추가 |

- 실제 동작 확인(메일이 실제로 오는지, 이름 없는 계정으로 로그인했을 때 화면이 막히는지)은 박향근이 로그인해서 직접 확인한다.
