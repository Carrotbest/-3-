# R382 — 이력 탭에 상태 열을 두고, 소진 완료는 잔량을 0으로 센다

상태: 미착수. 원인 규명이 끝났고 바꿀 코드가 아래에 그대로 있다. R381의 후속이다.

2026-11-02 박향근 확정. 요구는 둘이다.

1. **이력 탭에는 소진 완료와 폐기가 섞여 있다.** 둘을 그 자리에서 가를 수 있어야 한다.
2. **이력에 있는 원단의 Stock 칸에 `1/1`이 뜬다.** 이력에 간 원단은 재고가 0이어야 한다.

조사 결과 `1/1`이 나오는 경로는 둘이다. `DISPOSE`와 수동 `EXHAUST` 둘 다 `yds`를 건드리지 않고
출고 기록도 만들지 않아 `balance = yds - 0 = yds`가 그대로 남는다. 레거시 대장 이관분도 같다.

- **소진 완료는 잔량이 0인 것이 맞다.** 다 써서 나갔다는 뜻이다. 고친다.
- **폐기는 잔량이 곧 폐기 수량이다. 0으로 만들면 안 된다.** `warehouse-export.ts` 134행의
  창고팀 보고서 「폐기 yds」가 `status === "DISPOSED"`인 건의 `balance`를 더한다.
  폐기 잔량을 0으로 만들면 그 숫자가 통째로 0이 된다.

그래서 **소진 완료만 0으로 세고, 폐기는 그대로 두되 상태 열로 왜 숫자가 남아 있는지 읽히게 한다.**

---

## A. `src/data/fabric-ledger.ts` — 소진 완료는 잔량이 없다

### A-1. 752행

현재

```ts
    const stocked = { ...patched, yds, outbound, outboundTotal, balance, intakeAt, intakeByEmail: intakeByMap.get(item.key) ?? "", confirmedAt, lastMovedAt, lastOutbound }
```

교체

```ts
    // 소진 완료는 정의상 잔량이 없다(R382, 2026-11-02 박향근 확정). 수동 소진(EXHAUST)과
    // 대장 이관분은 출고 기록 없이 상태만 바뀌어서 `yds - 0` 이 그대로 남아 이력 탭 Stock 칸에
    // `1/1` 로 떴다. 다 써서 나간 원단이 재고를 들고 있는 것처럼 보인다.
    // **폐기(DISPOSED)에는 걸지 말 것.** 폐기는 잔량이 곧 버린 수량이고
    // `warehouse-export.ts` 의 창고팀 보고서 「폐기 yds」가 그 값을 더한다. 0으로 만들면 집계가 0이 된다.
    // 저장값은 건드리지 않는다. 원장이 내는 값만 0이다. 복구하면 상태가 바뀌므로 잔량이 저절로 돌아온다.
    const shownBalance = patched.status === "EXHAUSTED" && balance !== null ? 0 : balance
    const stocked = { ...patched, yds, outbound, outboundTotal, balance: shownBalance, intakeAt, intakeByEmail: intakeByMap.get(item.key) ?? "", confirmedAt, lastMovedAt, lastOutbound }
```

**`balance` 를 계산하는 733행은 손대지 말 것.** 거기를 고치면 `outboundTotal` 과 짝이 안 맞는다.

### 이 변경이 안전한 이유(확인 끝남, 다시 조사하지 말 것)

`item.balance` 를 읽는 자리를 전부 봤고 소진 완료 건을 세는 곳이 없다.

| 자리 | 범위 |
|---|---|
| `warehouseFingerprint`(784행) | `status !== "WAREHOUSE"` 면 건너뛴다 |
| `warehouse-export.ts` 134행 | `status === "DISPOSED"` 만 |
| `Warehouse.tsx` 828행 KPI | `status === "WAREHOUSE"` 만 |
| `RackMap.tsx` 37행 | 창고보관 전용이고 소진 건은 `rackNo` 가 비어 있다 |
| `outbound-request-mail.ts` 27행 | 창고보관에서 고른 건만 |
| 출고 등록 검사(1117~1120행) | 창고보관 건만 |

자동 소진 판정 `isFabricBalanceExhausted(yds, outboundTotal)` 는 `balance` 를 보지 않는다. 영향 없다.

---

## B. `src/routes/Warehouse.tsx` — 이력 탭 「상태」 열

**열을 늘리지 않는다.** 이력 탭에서 「입고확인」 칸은 `status !== "WAREHOUSE"` 라 언제나 빈칸이다.
그 자리를 「상태」가 받는다(R377의 "표에 열이 느는 것은 싫다"와 같은 방침).

### B-1. 72~79행 `WarehouseColumnId`

현재 첫 줄

```ts
type WarehouseColumnId = "storageNo" | "styleNo" | "flNo" | "millRef" | "owner" | "stock" | "confirm" | "rackNo"
```

교체

```ts
type WarehouseColumnId = "storageNo" | "styleNo" | "flNo" | "millRef" | "owner" | "stock" | "confirm" | "lifecycle" | "rackNo"
```

### B-2. 100행 (고정 열 묶음)

현재

```ts
    { id: "confirm", label: "입고확인", width: 76 },
```

교체

```ts
    { id: "confirm", label: "입고확인", width: 76 },
    // 이력 탭에서만 보인다(R382). 입고확인 칸이 그 탭에서 늘 빈칸이라 자리를 넘겨받았다.
    { id: "lifecycle", label: "상태", width: 112 },
```

`TEAM1_COLUMN_GROUPS` 는 `COLUMN_GROUPS[0]` 을 그대로 참조하므로 1팀 이력 탭도 같이 받는다. 맞는 동작이다.

### B-3. 394행 `cellValue`

현재

```ts
    case "confirm": return item.status !== "WAREHOUSE" ? "" : item.confirmedAt ? "확인" : "미확인"
```

교체

```ts
    case "confirm": return item.status !== "WAREHOUSE" ? "" : item.confirmedAt ? "확인" : "미확인"
    // 열 머리 ▼ 필터가 이 값을 쓴다. 폐기 사유를 여기 붙이면 필터 값이 사유마다 갈라지므로 붙이지 않는다.
    // 사유는 화면 render 에만 보인다.
    case "lifecycle": return item.status === "EXHAUSTED" ? "소진 완료" : item.status === "DISPOSED" ? "폐기" : ""
```

### B-4. 1196~1212행 `cellRawValue` 의 `default` 바로 위

`default: return ""` 바로 앞 줄에 다음을 더한다. 복사와 창고팀 엑셀에 글자가 실리게 하는 것이다.

```ts
      case "lifecycle": return item.status === "EXHAUSTED" ? "소진 완료" : item.status === "DISPOSED" ? "폐기" : ""
```

### B-5. 754행 `historyEnteredAt` memo **바로 뒤**에 사유 memo 를 더한다

`historyEnteredAt` memo 가 끝나는 `}, [fabricEvents])` 다음 줄에 붙인다. 기존 memo 는 손대지 말 것.

```ts
  // 이력 탭 상태 열이 보일 폐기 사유(R382). 원단마다 가장 최근 폐기 기록의 사유 하나를 담는다.
  // 찾는 방법은 historyEnteredAt 과 같다. DD 값이 바뀌면 원장 key 가 달라질 수 있어 R&D No. 로도 찾는다.
  const historyReason = useMemo(() => {
    const map = new Map<string, { at: string; reason: string }>()
    for (const event of fabricEvents) {
      if (event.toStatus !== "DISPOSED") continue
      const reason = (event.reason ?? "").trim()
      if (!reason) continue
      const at = event.recordedAt ?? event.occurredAt ?? ""
      for (const id of [event.fabricKey, event.storageNo ? `no:${event.storageNo.trim()}` : ""]) {
        if (!id) continue
        const previous = map.get(id)
        if (!previous || at > previous.at) map.set(id, { at, reason })
      }
    }
    return { get: (item: FabricLedgerItem) => (map.get(item.key) ?? (item.storageNo.trim() ? map.get(`no:${item.storageNo.trim()}`) : undefined))?.reason ?? "" }
  }, [fabricEvents])
```

### B-6. 1240행 `coreCell` 의 `confirm` 분기 **바로 뒤**

현재

```tsx
    if (id === "confirm") {
      if (item.status !== "WAREHOUSE") return <TextCell value="" />
      return item.confirmedAt
        ? <span className="text-[11px] font-medium text-[var(--muted-foreground)]" title={`창고 확인 ${fmtDateFull(item.confirmedAt)}`}>확인</span>
        : <span className="text-[11px] font-medium text-[var(--destructive)]">미확인</span>
    }
```

그 닫는 `}` 바로 다음 줄에 더한다.

```tsx
    // 소진 완료와 폐기를 그 자리에서 가른다(R382). 이력 탭에만 뜨는 열이다.
    if (id === "lifecycle") {
      if (item.status === "EXHAUSTED") return <span className="text-[11px] font-medium text-[var(--muted-foreground)]" title="다 써서 나간 원단입니다. 잔량은 0입니다.">소진 완료</span>
      if (item.status !== "DISPOSED") return <TextCell value="" />
      const reason = historyReason.get(item)
      return <span className="flex h-full w-full items-center gap-1 overflow-hidden whitespace-nowrap" title={reason ? `폐기 · ${reason}` : "폐기"}>
        <span className="shrink-0 text-[11px] font-medium text-[var(--destructive)]">폐기</span>
        {reason ? <span className="truncate text-[11px] text-[var(--muted-foreground)]">{reason}</span> : null}
      </span>
    }
```

### B-7. 1236~1239행 Stock 칸 — 폐기는 잔량이 아니라 폐기 수량이다

현재

```tsx
    if (id === "stock") {
      const balance = item.balance === null ? null : Math.max(0, item.balance)
      // 한 번 클릭은 셀 선택만 한다. 팝업이 바로 뜨면 더블클릭으로 여는 수정 창이 가려진다.
      return <span className={`flex h-full w-full items-center overflow-hidden whitespace-nowrap tabular-nums ${balance === 0 ? "text-[var(--muted-foreground)]" : ""}`} title={item.yds === null ? "더블클릭해서 재고 입력" : `${formatYds(balance ?? 0)}/${formatYds(item.yds)}yds · 더블클릭해서 수정`}>{item.yds === null ? "" : `${formatYds(balance ?? 0)}/${formatYds(item.yds)}yds`}</span>
    }
```

교체

```tsx
    if (id === "stock") {
      const balance = item.balance === null ? null : Math.max(0, item.balance)
      // 폐기 건의 앞 숫자는 남은 재고가 아니라 버린 수량이다(R382). 창고팀 보고서 「폐기 yds」가 그 값을 더한다.
      // 숫자를 0으로 바꾸지 말 것. 왜 숫자가 남아 있는지는 상태 열과 이 안내가 말한다.
      const stockTitle = item.yds === null ? "더블클릭해서 재고 입력"
        : item.status === "DISPOSED" ? `폐기 수량 ${formatYds(balance ?? 0)} yds · 입고 ${formatYds(item.yds)} yds`
        : `${formatYds(balance ?? 0)}/${formatYds(item.yds)}yds · 더블클릭해서 수정`
      // 한 번 클릭은 셀 선택만 한다. 팝업이 바로 뜨면 더블클릭으로 여는 수정 창이 가려진다.
      return <span className={`flex h-full w-full items-center overflow-hidden whitespace-nowrap tabular-nums ${balance === 0 ? "text-[var(--muted-foreground)]" : ""}`} title={stockTitle}>{item.yds === null ? "" : `${formatYds(balance ?? 0)}/${formatYds(item.yds)}yds`}</span>
    }
```

### B-8. 803행 — 탭별 고정 열 거르기

현재

```ts
    .map((group) => group.key !== "fixed" ? group : { ...group, columns: group.columns.filter((column) => tab !== "READY" && (column.id !== "rackNo" || tab === "WAREHOUSE")) })
```

교체

```ts
    // 입고 대기는 고정 열이 아직 뜻이 없어 통째로 숨긴다. Rack No. 와 입고확인은 창고보관,
    // 상태는 이력에서만 보인다(R382). 이력 탭에서 입고확인 칸이 늘 빈칸이라 그 자리를 상태가 받는다.
    .map((group) => group.key !== "fixed" ? group : { ...group, columns: group.columns.filter((column) => tab !== "READY"
      && (column.id !== "rackNo" || tab === "WAREHOUSE")
      && (column.id !== "confirm" || tab === "WAREHOUSE")
      && (column.id !== "lifecycle" || tab === "HISTORY")) })
```

### B-9. 1597행 — 지우기 보호 목록

현재

```ts
                } else if (["storageNo", "stock", "confirm"].includes(column.id)) {
```

교체

```ts
                } else if (["storageNo", "stock", "confirm", "lifecycle"].includes(column.id)) {
```

### 하지 말 것

- **폐기 건의 `balance` 를 0으로 만들지 말 것.** 창고팀 보고서 폐기 수량이 0이 된다.
- **저장된 `yds` 를 깎지 말 것.** 창고팀 보고서 「입고 yds」가 그 값을 쓴다.
- `isFabricBalanceExhausted` 의 `<= 0` 을 건드리지 말 것.
- 「상태」 열을 편집 가능하게 만들지 말 것. `MANUAL_EDITABLE`, `FABRIC1_EDITABLE` 에 넣지 않는다.
  상태는 상단 버튼(폐기·소진·복구)으로만 바꾼다.
- 이력 탭을 둘로 가르지 말 것. 한 탭에 상태 열로 가르는 것이 2026-11-02 결정이다.
- `historyEnteredAt` memo 의 모양을 바꾸지 말 것. `visibleRows` 정렬이 그 문자열을 `localeCompare` 한다.
- `fabric-ledger.ts` 733행의 `balance` 계산식을 고치지 말 것.

---

## C. `CLAUDE.md`

「창고」 절의 R381 두 줄 바로 아래에 다음 두 줄을 더한다.

```
  - **이력 탭에 「상태」 열이 있다**(R382, 2026-11-02 박향근 확정). 소진 완료와 폐기를 그 자리에서 가르고 폐기는 사유까지 보인다. **새 열이 아니라 「입고확인」 자리를 넘겨받은 것이다.** 입고확인은 `status !== "WAREHOUSE"` 면 늘 빈칸이라 이력 탭에서 죽은 칸이었다. 탭별 거르기는 `visibleGroups` 한 줄에 있고 입고확인·Rack No.는 창고보관, 상태는 이력에서만 뜬다. 열 머리 ▼ 필터가 쓰는 `cellValue` 는 「소진 완료」와 「폐기」 두 값만 낸다. **사유를 그 값에 붙이지 말 것.** 필터 값이 사유마다 갈라진다. 사유는 화면 render 와 `historyReason` memo 에만 있다. 이력 탭을 둘로 가르는 안은 폐기했다.
  - **소진 완료는 원장이 잔량을 0으로 낸다**(R382). `buildFabricLedger` 가 `status === "EXHAUSTED"` 면 `balance` 를 0으로 바꿔 내보낸다. 수동 소진과 대장 이관분은 출고 기록 없이 상태만 바뀌어 `yds` 가 그대로 남았고 Stock 칸에 `1/1` 로 떴다. **폐기(DISPOSED)에는 걸지 말 것.** 폐기 잔량은 곧 버린 수량이고 `warehouse-export.ts` 의 창고팀 보고서 「폐기 yds」가 그 값을 더한다. 0으로 만들면 집계가 0이 된다. 그래서 폐기 건은 Stock 칸에 숫자가 남고 안내 문구가 「폐기 수량」이라고 말한다. **저장값은 건드리지 않는다.** 원장이 내는 값만 0이라 복구하면 저절로 돌아온다. `balance` 를 읽는 다른 자리(지문, KPI, Rack 배치도, 출고 메일, 출고 검사)는 전부 창고보관 전용이라 영향이 없다.
```

---

## 검증

`npm run build` 한 번. `git status --short` 로 `src/data/fabric-ledger.ts`, `src/routes/Warehouse.tsx`,
`CLAUDE.md` 셋만 바뀌었는지 본다. 화면 확인은 박향근이 한다.
