# R446 — 성능 즉시 수정 3건: DD 검색, DD 정렬, 부팅 시 아카이브

상태: 미착수. 워킹트리는 깨끗하다(R444~R445는 커밋 `0ba6027`로 끝났다).

고치는 파일은 둘뿐이다.

| 파일 | 조치 |
|---|---|
| `src/routes/DevelopmentMasterSheet.tsx` | 검색의 로캘 소문자 변환을 없애고, 정렬 비교를 모듈 전역 `Intl.Collator` 재사용으로 바꾼다 |
| `src/App.tsx` | 샘플 아카이브를 받기 전에 씨앗이 필요한지 먼저 본다 |

다른 파일은 열지 마라. `src/routes/Warehouse.tsx`, `src/routes/FabricRequest.tsx`, `src/data/firestore-sync.ts`, `src/data/dd-workflow.ts`는 이번 범위가 아니다.

---

## 0. 배경

2026-11-25 성능 점검(`docs/PERF-2026-11-25.md`)에서 측정한 값이다. 이 PC의 Node 기준이고 브라우저는 보통 2배에서 4배 느리다.

| 항목 | 지금 | 바꾼 뒤 |
|---|---|---|
| 800행 곱하기 74열 검색 스캔 | 170.3ms | 6.6ms |
| 문자열 800개 정렬 | 95.1ms | 2.4ms |
| 첫 방문 때 받는 `archive.json` | 2.5MB를 늘 받음 | 씨앗이 필요할 때만 받음 |

세 가지 모두 **화면 동작을 바꾸지 않는다.** 검색 결과도, 정렬 순서도, 저장되는 값도 그대로여야 한다. 눈에 보이는 변화가 생기면 그건 실패다.

## 1. 결과가 같다는 근거

둘 다 측정으로 확인했다. 다시 의심하거나 다른 방법을 찾지 마라.

**`toLocaleLowerCase("ko-KR")`와 `toLowerCase()`는 결과가 같다.** 한글에는 대소문자가 없어서 `ko-KR` 로캘에 특별 매핑이 없다. U+0020부터 U+24FF까지 9,449자와 악센트, 합자, 터키어 I, 한글 표본 전부를 대조해 불일치가 0건이다. 로캘 인자는 결과를 안 바꾸고 ICU 로캘 조회 비용만 더한다. 이것이 26배 차이의 전부다.

**`localeCompare(b, "ko-KR", { numeric: true })`와 `new Intl.Collator("ko-KR", { numeric: true }).compare(a, b)`는 결과가 같다.** 명세상 같은 동작이고, 표본 121쌍 대조에서도 불일치가 0건이다. `localeCompare`는 호출할 때마다 Collator를 새로 만든다. 그래서 40배 차이가 난다. **Collator를 모듈 전역에 한 번만 만들어야 효과가 있다.** 컴포넌트 안이나 함수 안에서 만들면 아무 의미가 없다.

## 2. `DevelopmentMasterSheet.tsx`

**줄 번호는 지금 파일 기준이다. 2-1에서 상수를 더하면 그 아래가 전부 밀린다.** 인용한 현재 코드를 기준으로 찾아라.

### 2-1. 모듈 전역 Collator 둘 (40행 `const ALL = "__all__"` 바로 위)

```ts
/**
 * 정렬 비교용 Collator. localeCompare 는 부를 때마다 Collator 를 새로 만들어
 * 800행 정렬에 95ms 가 든다. 전역에서 한 번 만들어 쓰면 2.4ms 다.
 * 반드시 모듈 전역에 둔다. 컴포넌트 안에서 만들면 효과가 없다.
 */
const KO_COLLATOR_NUMERIC = new Intl.Collator("ko-KR", { numeric: true })
const KO_COLLATOR = new Intl.Collator("ko-KR")
```

### 2-2. `compareManualOrder` 의 세 군데 (530, 531, 533행) — 가장 뜨거운 자리

이 함수는 모든 정렬의 마지막 비교자라 비교 한 번마다 최대 세 번 불린다.

| 지금 | 바꿀 것 |
|---|---|
| `left.text.localeCompare(right.text, "ko-KR", { numeric: true })` | `KO_COLLATOR_NUMERIC.compare(left.text, right.text)` |
| `a.styleNo.localeCompare(b.styleNo, "ko-KR", { numeric: true })` | `KO_COLLATOR_NUMERIC.compare(a.styleNo, b.styleNo)` |
| `String(a.opt).localeCompare(String(b.opt), "ko-KR", { numeric: true })` | `KO_COLLATOR_NUMERIC.compare(String(a.opt), String(b.opt))` |

앞뒤의 `if`와 조기 반환은 그대로 둔다.

### 2-3. 나머지 비교자 다섯 군데

| 행 | 지금 | 바꿀 것 |
|---|---|---|
| 1805 | `a.localeCompare(b, "ko-KR")` | `KO_COLLATOR.compare(a, b)` |
| 1830 | `a.localeCompare(b, "ko-KR", { numeric: true })` | `KO_COLLATOR_NUMERIC.compare(a, b)` |
| 1872 | `String(leftValue).localeCompare(String(rightValue), "ko-KR", { numeric: true })` | `KO_COLLATOR_NUMERIC.compare(String(leftValue), String(rightValue))` |
| 3660 | `left.localeCompare(right, "ko-KR", { numeric: true })` | `KO_COLLATOR_NUMERIC.compare(left, right)` |
| 3667 | `a.localeCompare(b, "ko-KR")` | `KO_COLLATOR.compare(a, b)` |

**`numeric` 옵션이 있는 자리와 없는 자리를 섞지 마라.** 1805행과 3667행만 `KO_COLLATOR`이고 나머지는 전부 `KO_COLLATOR_NUMERIC`이다.

끝나면 `src/routes/DevelopmentMasterSheet.tsx`에 `localeCompare`가 **0건**이어야 한다.

### 2-4. 검색의 로캘 소문자 변환 (1880, 1882, 1883, 3647, 3653행)

다섯 군데의 `.toLocaleLowerCase("ko-KR")`를 `.toLowerCase()`로 바꾼다. 로캘 인자만 지우는 것이고 호출 위치와 구조는 그대로다.

1880행 `passesBaseFilters` 안:

```ts
    const query = search.trim().toLowerCase()
    const linked = ledgerByRecord.get(recordIdentity(record)) ?? null
    if (query && !allColumns.some((column) => String(column.value(record, linked) ?? "").toLowerCase().includes(query))
      && !String(record.tech?.development?.developer ?? "").toLowerCase().includes(query)) return false
```

3647행 `exportExcel` 안도 같은 방식으로 `query`와 3653행 스캔 둘 다 바꾼다.

**271행과 272행(`sourceKey`, `findKey`)은 건드리지 마라.** 찾아 바꾸기 기능이 쓰는 자리이고 뜨거운 경로가 아니다.

끝나면 이 파일의 `toLocaleLowerCase`는 **271행과 272행 두 건만** 남아야 한다.

## 3. `src/App.tsx`

### 지금 (146행 근처)

```ts
      const archive = await loadLedgerArchive()
      if (!current) return
      const existingCompleted = useAppStore.getState().completed
      const needsLedgerSeed = !Array.isArray(existingCompleted) || existingCompleted.length === 0
      if (archive && archive.length > 0 && needsLedgerSeed) {
        setAppState({ completed: archive })
        // 로컬에만 둔다. 씨앗을 Firestore로 올리면 팀이 공유하는 최신 값을 덮을 수 있다.
        await saveCacheLocal("completed", archive)
      }
```

쓸지 안 쓸지 정하기도 전에 2.5MB를 먼저 받는다. 대장에 값이 있는 평소에는 받아서 파싱한 뒤 그냥 버린다. 게다가 이 `await`가 끝나야 `setHydrated(true)`가 되고, Firestore 실시간 동기화는 `hydrated`를 기다린다(168행 `if (CAPTURE || !hydrated) return`). 안 쓸 파일이 팀 동기화 시작을 붙잡고 있다.

### 바꿀 것

```ts
      // 대장에 값이 있으면 아카이브를 받을 이유가 없다. 2.5MB 라 받고 버리면 첫 화면이 그만큼 늦고,
      // 이 await 가 hydrated 를 붙잡아 Firestore 동기화 시작까지 밀린다. 판정을 먼저 한다.
      const existingCompleted = useAppStore.getState().completed
      const needsLedgerSeed = !Array.isArray(existingCompleted) || existingCompleted.length === 0
      if (needsLedgerSeed) {
        const archive = await loadLedgerArchive()
        if (!current) return
        if (archive && archive.length > 0) {
          setAppState({ completed: archive })
          // 로컬에만 둔다. 씨앗을 Firestore로 올리면 팀이 공유하는 최신 값을 덮을 수 있다.
          await saveCacheLocal("completed", archive)
        }
      }
```

바로 위의 세 줄짜리 주석(`샘플관리대장 아카이브는 "비었을 때만 채우는 씨앗"이다` 로 시작하는 블록)은 **지우지 말고 그대로 둔다.**

판정 결과는 같다. `existingCompleted`를 읽는 시점이 아카이브 `fetch` 앞으로 당겨질 뿐인데, 그 사이에 `completed`를 바꾸는 코드가 없다. 윗줄의 `setAppState`는 이미 끝났고, Firestore 동기화는 `hydrated`를 기다리느라 아직 시작도 안 했다.

`if (!current) return` 가드를 없애지 마라. `await` 뒤에 그대로 있어야 한다.

## 4. 하지 말 것

- **동작을 바꾸지 마라.** 검색 결과, 정렬 순서, 저장되는 값이 전과 같아야 한다.
- `Intl.Collator`를 컴포넌트 안이나 `useMemo` 안에서 만들지 마라. 모듈 전역이어야 뜻이 있다.
- `numeric: true` 가 붙은 자리와 안 붙은 자리를 뒤섞지 마라.
- 271행과 272행의 `toLocaleLowerCase`는 그대로 둔다.
- 검색에 디바운스를 넣지 마라. 이번 범위가 아니다.
- 가상 스크롤, `React.memo`, `useMemo` 를 새로 넣거나 떼지 마라.
- `recalculateDevelopmentRecords`, `applySnapshot`, 창고 대장 생성은 손대지 마라. 다음 차례다.
- `ledger-archive.ts` 의 `loadLedgerArchive` 본문은 고치지 마라. 부르는 자리만 옮긴다.
- 아카이브 `fetch` 의 `cache: "no-cache"` 를 바꾸지 마라.
- `src/App.tsx` 의 다른 `await` 순서(`ensureTsSeed`, `migrateLocalTsIntoSync`, `repairTsData`, `setHydrated`)를 바꾸지 마라.
- 커밋하거나 푸시하지 마라. 워킹트리 변경까지만 한다.
- 사용자가 만든 기존 변경을 `git reset`이나 `git checkout`으로 되돌리지 마라.
- 파일을 삭제하지 마라.
- 이 저장소는 공개 저장소다. 실데이터, 단가, 협력사명, 개인 메일을 코드나 문서에 넣지 마라.
- 외부 자격증명이 필요한 명령을 돌리지 마라.
- `npm run build` 는 모든 수정을 마친 뒤 한 번만 돌려라.
- `public/data` 아래 JSON 을 열지 마라. `archive.json` 은 2.5MB 다.
- 같은 오류를 두 번 고쳐 실패하면 멈추고 보고해라.

## 5. 성공 기준

- `npm run build` 가 통과한다(`tsc --noEmit` 포함).
- `git status --short` 에 `src/routes/DevelopmentMasterSheet.tsx` 와 `src/App.tsx` 두 줄만 뜬다(지시서 파일 제외).
- `grep -c localeCompare src/routes/DevelopmentMasterSheet.tsx` 가 0 이다.
- `grep -c toLocaleLowerCase src/routes/DevelopmentMasterSheet.tsx` 가 2 다(271, 272행).
- `grep -c "new Intl.Collator" src/routes/DevelopmentMasterSheet.tsx` 가 2 다.
- `src/App.tsx` 에서 `loadLedgerArchive()` 호출이 `needsLedgerSeed` 판정 **뒤**에 있다.

마지막 보고는 수정 파일, 빌드 결과, 판단이 필요한 지점만 적어라. 바꾼 코드를 다시 붙이지 마라.
