# R443 — 원가계산서 주인과 덮어쓰기 권한

2026-11-23 박향근 지시. 화면별 편집 권한 정리의 마지막 묶음이다.

> cost sheet : 각 원가계산서는 관리자를 제외하고 작성자 본인만 편집 권한을 갖는다.
> 원가계산서는 최초 작성이 주인이지만 후에 원사값 변경에 의해 다른 통원부3팀 인원이 다음 버전을 만들 수 있다.

두 문장이 화면의 **버튼 둘**에 그대로 맞아떨어진다.

| 버튼 | 함수 | 하는 일 | 권한 |
|---|---|---|---|
| 이 버전 고치기 | `overwrite` → `updateCostSheet` | 선택한 버전 문서를 **덮어쓴다** | 그 버전을 만든 사람과 관리자 |
| 새 버전으로 저장 | `saveNew` → `saveCostSheet` | 새 문서를 하나 더 만든다 | 편집 권한자 누구나. 남의 그룹이면 확인 한 번 |

**덮어쓰기가 "작성자 본인만 편집"이고, 새 버전이 "원사값 바뀌면 다른 사람이 만드는 다음 버전"이다.**

손대는 파일은 넷이다.

- `src/data/cost-sheets.ts`
- `src/components/dd/CostSheetDialog.tsx`
- `src/routes/CostSheets.tsx`
- `firestore.rules`

---

## 1. 판정 함수 둘

`src/data/cost-sheets.ts`의 `latestByGroup` 아래에 더한다.

```ts
/**
 * 그룹의 주인. 버전 1을 만든 사람이다(2026-11-23 박향근 확정).
 * 최신 버전의 `by`로 보면 관리자가 한 번 고친 순간 주인이 바뀐다.
 * 버전 번호가 같으면 먼저 저장된 쪽이다. 목록이 비면 빈 문자열이다.
 */
export function costSheetOwnerEmail(versions: readonly CostSheetDoc[]): string {
  const first = [...versions].sort((left, right) => left.version - right.version || left.at - right.at)[0]
  return first?.by ?? ""
}

/**
 * 이 버전을 덮어쓸 수 있는가. 그 버전을 만든 사람과 관리자다.
 * 새 버전을 더하는 것은 이 판정과 무관하다. 그쪽은 편집 권한자 누구나 한다.
 */
export function canOverwriteCostSheet(doc: CostSheetDoc | null, email: string | null | undefined, isOwner: boolean): boolean {
  if (isOwner) return true
  if (!doc) return false
  const mine = (email ?? "").trim().toLowerCase()
  return Boolean(mine) && doc.by.trim().toLowerCase() === mine
}
```

**`by`를 소문자로 맞춰 비교한다.** 저장은 `auth.currentUser?.email`을 그대로 넣어서 대소문자가 섞일 수 있다.

---

## 2. 계산서 팝업

`src/components/dd/CostSheetDialog.tsx`.

### 값 세 개를 만든다

컴포넌트 안, `versions` 상태 근처다.

```ts
  const authEmail = useAuthStore((state) => state.user?.email ?? "")
  const isAdmin = useAuthStore((state) => state.isOwner)
  const groupOwner = useMemo(() => costSheetOwnerEmail(versions), [versions])
  const canOverwrite = canOverwriteCostSheet(current, authEmail, isAdmin)
  // 남의 계산서에 새 버전을 올리는가. 새 그룹(버전 0건)이면 주인이 없다.
  const otherOwner = Boolean(groupOwner) && !isAdmin && groupOwner.toLowerCase() !== authEmail.trim().toLowerCase()
```

`useAuthStore` import를 더한다(`@/data/auth`).

### 「이 버전 고치기」를 막는다

326행 푸터의 그 버튼이다.

**지금**

```tsx
{current ? <Button type="button" size="sm" variant="outline" disabled={!canEdit || saving || !ratioValid} onClick={() => void overwrite()}><Save className="size-4" />이 버전 고치기</Button> : null}
```

**바꿀 것**

```tsx
{current ? <Button type="button" size="sm" variant="outline" disabled={!canEdit || !canOverwrite || saving || !ratioValid} title={!canOverwrite ? `v${current.version}은 ${current.by || "다른 사람"}이 만든 버전이라 고칠 수 없습니다. 새 버전으로 저장하십시오.` : undefined} onClick={() => void overwrite()}><Save className="size-4" />이 버전 고치기</Button> : null}
```

**버튼을 감추지 말 것.** 왜 못 고치는지 말해 주고 대신 할 일(새 버전으로 저장)을 알려 주는 자리다.

`overwrite` 함수 첫 줄의 가드도 더한다. 버튼만 막고 함수를 열어 두지 말 것.

```ts
  const overwrite = async () => {
    if (!current || !ratioValid) return
    if (!canOverwrite) { setError(`v${current.version}은 ${current.by || "다른 사람"}이 만든 버전이라 고칠 수 없습니다. 새 버전으로 저장하십시오.`); return }
    ...그대로...
```

### 「새 버전으로 저장」에 확인 한 번

남의 그룹일 때만이다. 두 단계로 받는다. **`window.confirm`을 쓰지 말 것.** 팝업 위에 브라우저 모달이 또 뜬다.

상태 하나를 더한다.

```ts
  const [confirmNewVersion, setConfirmNewVersion] = useState(false)
```

`saveNew` 첫머리에 끼운다.

```ts
  const saveNew = async () => {
    if (!ratioValid) return
    // 남의 계산서에 새 버전을 올리면 DD 행의 원가 표시가 그 값으로 바뀐다. 한 번 되묻는다.
    if (otherOwner && !confirmNewVersion) { setConfirmNewVersion(true); return }
    setSaving(true); setError("")
    ...그대로...
```

저장이 끝나면(`finally` 안이든 성공 직후든) `setConfirmNewVersion(false)`로 되돌린다.

버튼 라벨과 안내를 바꾼다.

```tsx
<Button type="button" size="sm" disabled={!canEdit || saving || !ratioValid} onClick={() => void saveNew()}><Save className="size-4" />{confirmNewVersion ? "확인, 새 버전 저장" : current ? "새 버전으로 저장" : "저장"}</Button>
```

푸터 왼쪽 `error` 자리 옆에 안내를 한 줄 띄운다. `error`를 덮어쓰지 말 것. 오류와 확인은 다른 말이다.

```tsx
{confirmNewVersion ? <span className="mr-auto text-xs text-[var(--warning)]">{groupOwner}이(가) 만든 계산서입니다. 새 버전을 올리면 DD 행의 원가 표시가 바뀝니다. 한 번 더 누르면 저장합니다.</span> : null}
```

**팝업을 닫거나 버전을 바꾸면 `confirmNewVersion`을 끈다.** 켜 둔 채로 다른 버전을 고르면 묻지도 않고 저장된다. `loadVersion`과 `onOpenChange`의 닫기 분기 둘 다에 넣는다.

### 머리에 주인을 보인다

`DialogTitle` 줄에 이미 R&D No.를 작은 글자로 붙이고 있다. 그 옆이다.

```tsx
{groupOwner ? <span className="text-xs font-normal text-[var(--muted-foreground)]">주인 {groupOwner}</span> : null}
```

---

## 3. 자료실

`src/routes/CostSheets.tsx`.

**자료실 위 표는 손대지 말 것.** 그 표는 그룹마다 최신 버전 한 줄만 들고 있어서(`latestByGroup`) 버전 1의 작성자를 모른다. 열을 더하려면 전 버전을 다 불러와야 한다.

**아래 「버전 상세」 카드에만 더한다.** 그 카드는 고른 그룹의 전 버전(`versions`)을 들고 있다.

217행 근처

```tsx
<CardHeader className="py-2.5"><CardTitle className="text-sm font-medium">버전 상세 · {versions[0].flNo || versions[0].styleNo}</CardTitle></CardHeader>
```

를

```tsx
<CardHeader className="py-2.5"><CardTitle className="text-sm font-medium">버전 상세 · {versions[0].flNo || versions[0].styleNo}{costSheetOwnerEmail(versions) ? <span className="ml-2 text-xs font-normal text-[var(--muted-foreground)]">주인 {costSheetOwnerEmail(versions)}</span> : null}</CardTitle></CardHeader>
```

`costSheetOwnerEmail` import를 더한다.

도구줄 「수정」 버튼(192행)은 **그대로 둔다.** 팝업을 여는 버튼일 뿐이고 막는 것은 팝업 안의 두 버튼이다.

---

## 4. Firestore 규칙

`firestore.rules`의 `costSheets`다. **여기는 규칙으로 진짜 막을 수 있다.** 문서 하나가 버전 하나라서 `resource.data.by`를 볼 수 있다. `state/{docId}`와 다르다.

**지금**

```
    match /costSheets/{docId} {
      allow read: if isApproved();
      allow create: if isApproved()
                    && request.resource.data.by == request.auth.token.email;
      allow update: if isApproved();
      allow delete: if isOwner();
    }
```

**바꿀 것**

```
    // 버전 하나가 문서 하나다. 덮어쓰기는 그 버전을 만든 사람과 관리자만(2026-11-23 박향근 확정).
    // 새 버전은 create 라 누구나 만들 수 있고, create 는 남의 이름으로 못 만든다.
    // by, version, groupId 를 못 바꾸게 묶어야 남의 버전을 제 것으로 돌려놓고 고치는 길이 막힌다.
    match /costSheets/{docId} {
      allow read: if isApproved();
      allow create: if isApproved()
                    && request.resource.data.by == request.auth.token.email;
      allow update: if isOwner()
                    || (isApproved()
                        && resource.data.by == request.auth.token.email
                        && request.resource.data.by == resource.data.by
                        && request.resource.data.version == resource.data.version
                        && request.resource.data.groupId == resource.data.groupId);
      allow delete: if isOwner();
    }
```

**`allow update: if isOwner()` 하나로 좁히지 말 것.** 그러면 본인 버전도 못 고친다. 「이 버전 고치기」가 쓰는 길이다.

**규칙 파일만 고치고 배포하지 말 것.** `firebase deploy --only firestore:rules`는 박향근이 정한다. 배포 전에는 규칙 파일과 돌아가는 규칙이 다르다.

---

## 5. 건드리지 말 것

- **`saveCostSheet`의 버전 매기기.** 기존 최대 버전 + 1 그대로다.
- **`deleteCostSheetGroup`과 삭제 권한.** 관리자 전용 그대로다(R348).
- **계산식(`fabric-cost.ts`), 혼용율(`yarn-blend.ts`), 회귀 기준값.** 손대지 말 것.
- **`tech.costRef` 포인터 구조.** 새 버전을 저장하면 DD 행의 포인터가 그 버전으로 바뀐다. 그게 확인을 받는 이유다. 구조는 그대로다.
- **`COST_STALE_DAYS`(180일) 경과 배지.**
- **`departments.ts`의 `costSheet` 권한.** 정산관리팀이 편집을 갖고 있는 건은 따로 정할 일이라 이번에 안 건드린다.
- **Firestore 저장 payload에 `undefined`를 넣지 말 것**(R340). 키를 아예 뺀다. COST SHEET가 그것 하나로 한 달 넘게 저장에 실패했다.

## 하지 말 것

- 커밋하지 말 것.
- `firebase deploy`를 돌리지 말 것.
- 실데이터를 바꾸지 말 것.

## 끝나고 확인

```
npm run build
```

그리고 `confirmNewVersion`을 끄는 자리 셋(저장 끝난 뒤, 버전 바꿀 때, 팝업 닫을 때)이 전부 있는지 눈으로 셀 것. 타입 검사로는 안 잡힌다.
