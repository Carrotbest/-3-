# R440 — 창고 Rack No. 창고팀 전용, DD MASTER 전체 미리보기 안내와 완료 제외 기본값

2026-11-23 박향근 지시. 화면별 편집 권한 정리의 첫 묶음이다.

손대는 파일은 둘이다. 서로 무관하니 순서는 상관없다.

- `src/data/warehouse-policy.ts`
- `src/routes/DevelopmentMasterSheet.tsx`

**다른 파일은 열지 말 것.** 특히 `src/store/useAppStore.ts`와 `src/routes/Warehouse.tsx`는 고칠 것이 없다. 이미 올바른 함수를 부르고 있다.

---

## 1. Rack No.는 창고팀만 입력하고 고친다

### 지시 원문

> warehouse : 입고 확인 버튼과 Rack no.는 관리자를 제외하고 정산관리팀만 작성과 편집 권한을 가진다.
> rack no. 항목은 두지만 해당 칸의 편집 권한은 정산관리팀만 할 수 있다. (1팀이 직접 꽂지 않는다.)

열은 그대로 두고 편집만 막는다. 입고 확인은 이미 창고팀 전용이라 고칠 것이 없다.

### 고칠 곳

`src/data/warehouse-policy.ts`의 `warehouseDenial` 안, `case "yds": case "rack":` 로 묶여 있는 분기다.

**지금 코드**

```ts
    case "yds":
    case "rack": {
      const label = rule === "yds" ? "보유 재고" : "Rack No."
      if (settlement) return null
      if (rule === "yds" ? item.locks.yds : item.locks.rackNo) return `${label}는 창고팀이 입력한 값이라 창고팀만 고칠 수 있습니다.`
      if (sameEmail(item.intakeByEmail, actor.email)) return null
      return `${label}는 입고를 등록한 사람과 창고팀만 고칠 수 있습니다.`
    }
```

**바꿀 코드**

```ts
    // Rack No.는 창고팀만 입력하고 고친다(2026-11-23 박향근 지시).
    // 선반에 실물을 꽂는 쪽이 창고팀 하나뿐이라 입고 등록자에게도 열어 두지 않는다.
    // `confirm`과 같은 모양이다. `locks.rackNo`를 볼 필요가 없어졌다(창고팀만 쓰니 늘 창고팀 값이다).
    case "rack":
      return settlement ? null : "Rack No.는 창고팀만 입력하고 고칠 수 있습니다."
    case "yds": {
      if (settlement) return null
      if (item.locks.yds) return "보유 재고는 창고팀이 입력한 값이라 창고팀만 고칠 수 있습니다."
      if (sameEmail(item.intakeByEmail, actor.email)) return null
      return "보유 재고는 입고를 등록한 사람과 창고팀만 고칠 수 있습니다."
    }
```

`yds`(보유 재고)는 지시에 없다. **동작을 그대로 지킬 것.** 묶여 있던 분기를 갈라 쓰는 것뿐이다.

`rule === "yds" ? ... : ...` 삼항을 쓰던 `label` 지역 변수는 `rack` 쪽이 떨어져 나가면서 쓸모가 없어진다. 위 코드처럼 문구를 그대로 적는다.

### 왜 이 한 곳만 고치면 되는가

저장 경로 둘이 전부 이 함수를 지난다.

- `useAppStore.ts`의 `saveFabricRackNo` (한 건)
- `useAppStore.ts`의 `saveFabricRackNos` (여러 건)

그래서 아래가 함께 막힌다. 각각 따로 고치지 말 것.

- 창고보관 탭 Rack No. 칸 더블클릭 편집
- Rack No. 칸 선택 후 Delete, Backspace로 지우기
- 1팀 창고보관 탭의 「Rack No. 정리 N」 버튼 (R324)
- 화면 쪽 `denialFor("rack", ...)` 가 셀 더블클릭에서 미리 막는 자리 (`Warehouse.tsx:1959`)

### 건드리지 말 것

- **창고팀 「실물 입고 확인」 창의 Rack No. 입력칸.** 창고팀이 쓰는 자리라 그대로다.
- **1팀 「신규 입고」 팝업.** 거기에는 Rack No. 입력칸이 없다. 안내 문구 하나만 있다("Rack No.는 창고팀이 입고 확인 때 입력합니다"). 맞는 문구다.
- **`addFabric1Intake`의 `input.rackNo`.** 호출부가 값을 넘기지 않는 죽은 인자다. 지우지도 말고 고치지도 말 것. override를 만드는 자리마다 rackNo를 물려줘야 한다는 규칙(R228, R324)이 걸려 있다.
- **`FabricLedgerOverride.rackNo`를 물려주는 자리 전부.** `applyFabricAction`, `saveFabricFields` 등이다. 권한과 무관하다.
- **`normalizeRackNo`와 형식 검사.** 2026-09-22에 형식 비강제로 정했다.

### 확인

창고팀이 아닌 계정(3팀, 1팀)으로 창고보관 탭에서 Rack No. 칸을 더블클릭하면 편집기가 열리지 않고 안내 문구가 뜬다. 창고팀 계정과 관리자는 그대로 열린다.

---

## 2. DD MASTER 전체 미리보기에 안내를 3초 띄운다

### 지시 원문

> (첫 화면의 전체 미리보기에서는 화면 정 가운데 미리보기 전용이라는 팝업을 항상 3초간 띄우고 내려줘)

전체 미리보기가 읽기 전용이라는 것은 이미 코드에 있다(R310). 사람이 그걸 모르고 칸을 두드리는 일이 잦아 화면에 말로 알리자는 요구다.

### 고칠 곳

`src/routes/DevelopmentMasterSheet.tsx`.

담당 탭 값이 `ALL`(`const ALL = "__all__"`, 40행)이 될 때마다 화면 정가운데에 안내를 띄우고 3초 뒤 스스로 내린다.

**만들 것**

1. 상태 하나. `const [previewNotice, setPreviewNotice] = useState(false)`
2. `owner`가 `ALL`로 바뀔 때 켜는 effect. 3초 타이머로 끈다.

```tsx
  // 전체 미리보기는 읽기 전용이다(R310). 모르고 칸을 두드리는 일이 잦아
  // 탭을 고를 때마다 화면 가운데에 3초 알린다(2026-11-23 박향근 지시).
  useEffect(() => {
    if (owner !== ALL) { setPreviewNotice(false); return }
    setPreviewNotice(true)
    const timer = window.setTimeout(() => setPreviewNotice(false), 3000)
    return () => window.clearTimeout(timer)
  }, [owner])
```

3. 그리는 자리. 표 바깥, 라우트 최상위 반환 JSX 안에 둔다.

```tsx
  {previewNotice ? (
    <div className="pointer-events-none fixed inset-0 z-[95] flex items-center justify-center">
      <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-6 py-4 text-center shadow-lg">
        <p className="text-base font-semibold">미리보기 전용</p>
        <p className="mt-1 text-xs text-[var(--muted-foreground)]">담당을 선택하면 수정할 수 있습니다.</p>
      </div>
    </div>
  ) : null}
```

### 지켜야 할 것

- **`pointer-events-none`을 빼지 말 것.** 3초 동안 화면 전체를 덮는 자리라 클릭을 먹으면 그 사이 아무것도 못 누른다.
- **`z-[95]`다.** 오른쪽 아래 떠 있는 것 셋(메모 버튼, 선택 요약, 일정 알림 카드)보다 위이고 `UpdateBanner`(`z-[1000]`)보다 아래다. R429에서 정한 자리 규칙과 부딪히지 않는다.
- **`fixed inset-0`이라 오른쪽 아래 3단과 자리를 다투지 않는다.** 가운데에 뜨고 3초면 사라진다. R429의 단 배정을 바꾸지 말 것.
- **타이머 정리(`clearTimeout`)를 빠뜨리지 말 것.** 전체 탭과 담당 탭을 빠르게 오가면 타이머가 겹쳐 쌓인다.
- 색은 `var(--card)`와 `var(--border)`를 쓴다. `bg-background`는 매핑이 없다.

---

## 3. 담당 탭도 기본이 완료 제외다

### 지시 원문

> 각 담당 전요 화면에서는 항상 완료 제외로 보여줘.
> 기본값을 완료 제외로 보여주라는 것이다. 필요하면 토글을 켜서 완료된것을 보자.

**토글은 그대로 둔다. 기본값만 뒤집는다.**

### 고칠 곳

`src/routes/DevelopmentMasterSheet.tsx:1692`

```ts
  const [hideClosed, setHideClosed] = useState(false)
```

를

```ts
  // 담당 탭도 기본이 완료 제외다(2026-11-23 박향근 지시). 끄는 것은 도구줄 토글이다.
  const [hideClosed, setHideClosed] = useState(true)
```

로 바꾼다. **이 한 줄이 전부다.**

### 손대지 말 것

- **1859행의 거르기 조건.** `(owner === ALL || hideClosed) && status === ALL && isClosedRecord(record)` 그대로다. Status 필터로 「완료」를 고르면 완료 건이 보이는 길이 거기 있다.
- **1903행의 정렬 조건.** 담당 탭에서 끝난 건을 위로 모으는 동작이다. `hideClosed`가 켜져 있으면 건너뛴다. 그대로 맞다.
- **2425행의 `setHideClosed(false)`.** `?focus=rowId`로 들어올 때 거르기를 푸는 자리다. 기본값이 바뀌어도 이 줄이 있어야 완료된 행으로 이동할 수 있다. **지우지 말 것.**
- **도구줄 토글 버튼(3711행).** 모양과 문구 그대로다. 기본이 켜짐이라 처음부터 `default` 모양으로 보이게 되는데 그게 맞다.

---

## 하지 말 것

- 커밋하지 말 것. 박향근이 따로 요청한다.
- `firestore.rules`를 손대지 말 것. 이번 묶음에 없다.
- 권한 키(`screen-permissions.ts`)나 부서 기본값(`departments.ts`)을 손대지 말 것. 다음 묶음이다.
- 실데이터를 바꾸지 말 것. 코드만이다.

## 끝나고 확인

```
npm run build
```

`tsc --noEmit`과 `vite build`가 모두 통과해야 한다. 경고가 늘면 알릴 것.
