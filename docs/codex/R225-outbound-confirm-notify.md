# R225 출고 요청 버튼 분리, 출고 확정 다건 처리와 알림

## 상태

미착수. R224(창고 입출고 Teams 알림)가 워킹트리에 구현되어 있고 빌드까지 통과했다. 이 문서는 그 위에 이어 붙인다. **R224를 되돌리거나 다시 만들지 마라.**

## 배경

출고는 두 단계다.

1. 통합원단부 1팀이나 2팀이 출고를 요청한다. 창고팀이 Teams 알림을 받는다
2. 창고팀이 원단을 컷팅한다
3. 창고팀이 출고 확정을 누른다. 요청한 팀이 Teams 알림을 받는다

요청 상태는 저장하지 않는다. 창고팀은 알림 카드에 적힌 R&D No.를 보고 화면에서 찾는다. 사용자가 이 방식으로 먼저 써 보기로 정했다. **출고 요청 상태나 새 탭, 새 저장 키를 만들지 마라.**

알림은 채널 하나로 모두 보낸다. R224가 만든 `state/teamsWebhook` 주소 하나를 그대로 쓴다. **주소나 채널을 늘리지 마라.**

## 이번에 하는 것

1. 출고 요청 창의 체크박스를 버튼 두 개로 나눈다
2. 출고 확정을 여러 건 한 번에 처리한다
3. 출고 확정에 알림을 붙이고 버튼 이름을 고친다
4. 2팀에 출고 요청 권한을 연다

## 파일별 조치

| 파일 | 조치 |
|---|---|
| `src/components/warehouse/OutboundRequestMailDialog.tsx` | 체크박스를 버튼 두 개로 |
| `src/data/teams-notify.ts` | 출고 확정 카드 추가, 출고 요청 카드 색 변경 |
| `src/routes/Warehouse.tsx` | 출고 확정 다건화, 알림, 버튼 이름 |
| `src/data/departments.ts` | 2팀 출고 요청 권한 |

---

## 1. `src/components/warehouse/OutboundRequestMailDialog.tsx`

R224가 `창고팀에 Teams 알림 보내기` 체크박스를 넣었다. **그 체크박스를 없애고 버튼 두 개로 바꾼다.** 사람이 상황에 따라 하나만 누르거나 둘 다 누른다.

| 버튼 | 하는 일 |
|---|---|
| `메일로 작성` | 지금의 `makeMail`. `.eml`을 내려받는다. 알림은 보내지 않는다 |
| `Teams 알림 보내기` | 알림만 보낸다. `.eml`은 만들지 않는다 |

두 버튼 모두 누르기 전에 수량 검증(`invalid`)을 거친다. 지금 `makeMail`이 하는 것과 같다.

`sendTeams` 상태와 `Checkbox` import는 지운다. `teamsNotice`는 남겨서 알림 버튼의 결과를 보인다. 창을 열 때 초기화하는 자리에서 `setSendTeams(true)`도 지운다.

버튼은 둘 다 창을 닫지 않는다. 지금 동작 그대로다.

알림 전송이 실패하면 `teamsNotice`를 오류로 적고 창은 그대로 둔다.

---

## 2. `src/data/teams-notify.ts`

### 카드 색을 다시 나눈다

지금 출고 요청이 `Good`이다. 요청은 조치가 필요한 것이고 확정이 끝난 것이라 뜻이 뒤집혀 있다.

| 카드 | 색 |
|---|---|
| 입고 등록 | `Accent` (그대로) |
| 출고 요청 | `Warning` |
| 출고 확정 | `Good` |

`CardOptions`의 `color` 타입에 `"Warning"`을 더한다.

### `buildOutboundConfirmCard`를 더한다

기존 `buildCard` 헬퍼를 그대로 쓴다. 새 틀을 만들지 마라. **여러 건을 한 카드에 담는다.**

```ts
export interface OutboundConfirmCardItem {
  item: FabricLedgerItem
  qty: number
  balanceAfter: number | null
}

export interface OutboundConfirmCardInput {
  to: string
  division: string
  date: string
  items: readonly OutboundConfirmCardItem[]
}
```

- 종류 `출고 확정`, 색 `Good`
- 설명 `요청하신 원단 N건 출고가 완료되었습니다.`
- 항목 `출고일`, `받는 곳`, `사업부`, `건수`
- 사업부가 비면 그 항목을 뺀다
- 목록 한 줄 `{R&D No.}  FL {FL#}  출고 {qty} yds  잔량 {balanceAfter} yds`
- `balanceAfter`가 `null`이면 잔량 부분을 빼고, `0`이면 `잔량 없음`을 적는다
- 맺음말 `원단을 수령하시면 확인 부탁드립니다.`

목록 15건 제한과 `외 N건` 처리는 R224가 만든 것을 그대로 탄다.

---

## 3. `src/routes/Warehouse.tsx`

### 3-1. 출고 수량을 원단마다 받는다

600행 `const [outboundQty, setOutboundQty] = useState("")`를 지우고, 558행 `receiveYds`와 같은 모양으로 바꾼다.

```tsx
const [outboundQtys, setOutboundQtys] = useState<Record<string, string>>({})
```

창을 닫거나 초기화하는 자리(820행 근처 `setRecipient("")`가 있는 곳)에서 `setOutboundQtys({})`도 함께 비운다.

### 3-2. 입력 화면을 다건으로

1724행이 지금의 OUTBOUND 입력부다. 수령자, 사업부, 출고 날짜, 소진 체크는 **공통이라 그대로 하나만 둔다.** 수량 칸 하나와 `현재 잔량` 문구만 걷어내고, 그 자리에 원단마다 줄을 그린다.

**1657행의 `RECEIVE` 입력부를 그대로 본떠라.** 원단마다 테두리 상자를 하나 두고 왼쪽에 R&D No.와 스타일과 FL No.를, 오른쪽에 수량 칸을 둔다. 같은 클래스와 같은 짜임을 쓴다. 새 모양을 만들지 마라.

각 줄에 그 원단의 현재 잔량을 작게 적는다. 잔량이 `null`이면 `잔량 미기입`이라고 적는다.

수량 칸의 `max`는 그 원단의 `balance`다.

### 3-3. 저장을 다건으로

923행부터 929행까지가 지금의 검증과 저장이다. 현재 코드는 이렇다.

```tsx
const qty = Number(outboundQty)
if (item.balance === null) throw new Error("먼저 보유 재고를 입력하세요.")
if (!recipient.trim()) throw new Error("수령자를 입력하세요.")
if (!Number.isFinite(qty) || qty <= 0) throw new Error("출고 수량을 0보다 큰 숫자로 입력하세요.")
if (qty > item.balance) throw new Error(`현재 잔량 ${formatYds(item.balance)} yds를 초과할 수 없습니다.`)
if (!outboundDate) throw new Error("출고 날짜를 선택하세요.")
await applyFabricAction({ fabricKey: item.key, action: "OUTBOUND", fromStatus: "WAREHOUSE", toStatus: "WAREHOUSE", storageNo: item.storageNo, qty, to: recipient, division, date: outboundDate, note: "출고 등록", autoExhaust: exhaustOnZero })
```

이렇게 바꾼다.

공통 검증을 먼저 한다. 수령자가 비면 막고, 출고 날짜가 비면 막는다.

그다음 `actionItems`를 돌며 원단마다 검증한다. 잔량이 `null`이면 막고, 수량이 숫자가 아니거나 0 이하면 막고, 잔량을 넘으면 막는다. **오류 문구에 어느 원단인지 적어라.** 한 건씩 보던 때와 달리 여러 건이라 누구 때문에 막혔는지 알아야 한다. R&D No.를 앞에 붙인다.

저장은 `applyFabricActions`(복수형) 한 번으로 한다. 이 함수는 이미 있고 입고 등록이 쓰고 있다. **store를 고치지 마라.** 각 항목은 지금 넘기던 것과 같고 `fabricKey`, `storageNo`, `qty`만 원단마다 달라진다.

저장이 끝난 뒤 알림을 보낸다. R224가 입고 등록에 붙인 것과 똑같은 모양이다. `try`와 `catch`로 감싸고 실패하면 `setSelectionNotice`로 `출고는 확정했지만 Teams 알림을 보내지 못했습니다.`를 적고 넘어간다.

**저장이 먼저다. 알림을 앞에 두지 마라.**

`balanceAfter`는 그 원단의 `balance - qty`다.

### 3-4. 버튼

1515행이 출고 버튼이고 지금 한 건만 고를 수 있게 막혀 있다.

```tsx
disabled={selectedRows.length !== 1} title={selectedRows.length === 1 ? undefined : "출고는 한 건씩 등록합니다."}
```

여러 건을 받도록 푼다. `disabled`는 `!selectedRows.length`로 하고 `title`은 고르지 않았을 때만 `출고할 원단을 먼저 선택하세요.`를 보인다.

라벨 두 개를 고친다. 조건과 권한은 그대로 둔다.

| 위치 | 지금 | 바꿀 것 |
|---|---|---|
| 1515행 | `출고` | `출고 확정` |
| 1516행 | `출고 요청 메일` | `출고 요청` |

1516행 버튼의 `title`도 고친다. 지금은 `선택한 원단의 컷팅·출고 요청 메일 초안을 만듭니다`인데 가운뎃점을 쓰면 안 되고 알림도 함께 나가므로 `선택한 원단의 출고를 창고팀에 요청합니다`로 바꾼다. 고르지 않았을 때 문구는 그대로 둔다.

---

## 4. `src/data/departments.ts`

20행 `fabric2`(통합원단부 2팀)다. 지금 `warehouseOutbound: "none"`이라 2팀이 출고 요청을 할 수 없다. `"edit"`으로 바꾼다.

같은 줄 `hint` 문구에도 출고 요청이 된다는 것을 더한다. 지금은 `요청 편집, HOME 블러, 나머지 읽기`다.

**다른 부서는 건드리지 마라.** 1팀과 창고팀은 이미 열려 있다.

이 값은 새 사용자의 기본값이다. 이미 승인된 2팀 사용자의 권한은 바뀌지 않는다. 그 사람들은 설정 화면에서 손으로 열어야 한다. **이 점을 마지막 보고에 적어라.**

---

## 하지 말 것

- 출고 요청 상태, 새 탭, 새 저장 키를 만들지 마라
- 웹훅 주소를 늘리지 마라. 채널 하나다
- 웹훅 주소를 코드, 주석, 문서에 넣지 마라. 공개 저장소다
- R224가 만든 파일과 코드를 되돌리거나 다시 쓰지 마라
- `useAppStore`와 `applyFabricActions` 본체를 고치지 마라. 호출만 바꾼다
- 메일 초안 코드(`mail-draft.ts`, `outbound-request-mail.ts`)를 고치지 마라
- 입고 확인, 소진, 폐기, 입고 취소에 알림을 붙이지 마라
- 알림 이력 저장이나 재시도를 넣지 마라
- 화살표(`→`)와 가운뎃점(`·`)을 화면 문구에 쓰지 마라. 쉼표로 나눈다

## 검증

수정을 모두 마친 뒤 한 번만 돌린다.

```
npm run build
git status --short
```

빌드가 통과하고 위에 적은 파일 네 개 외에 바뀐 것이 없으면 된다. `src/data/teams-notify.ts`는 R224가 만든 파일이고 이번에도 고치므로 목록에 있는 것이 맞다.

## 마지막 보고

수정한 파일, 빌드 결과, 판단이 필요한 지점만 적어라. 바꾼 코드를 다시 붙이지 마라. 이미 승인된 2팀 사용자 권한 건은 반드시 적어라.
