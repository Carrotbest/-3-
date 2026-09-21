# R224 창고 입출고 Teams 알림

## 상태

미착수. 사람이 손으로 붙일 Teams 워크플로는 이미 만들어 두었고 연결도 실측으로 확인했다. 이 문서는 대시보드 쪽 코드만 다룬다.

## 배경

창고 입고 등록과 출고 요청을 확정할 때 창고팀에 자동으로 알린다.

회사 메일 자동 발송은 사내 보안 정책으로 막혀 있다. 대신 Teams 채널 알림을 쓴다. 메일은 지금처럼 `.eml` 초안을 사람이 Outlook에서 보낸다. **메일 관련 코드는 건드리지 않는다.**

## 이미 확인한 것

브라우저에서 워크플로 주소로 직접 POST가 된다. `https://carrotbest.github.io` 출처에서 보낸 요청이 CORS를 통과했고 `202`를 받았으며 채널에 카드가 떴다.

**그러므로 Firebase Functions나 어떤 서버도 만들지 마라.** 브라우저에서 바로 `fetch` 한다. 이 판단은 실측으로 끝났으니 다시 검토하지 마라.

## 전송 계약

워크플로 쪽은 이미 이 형태로 맞춰져 있다. 바꿀 수 없다.

- 메서드 `POST`, 헤더 `Content-Type: application/json`
- 본문 `{ "card": <Adaptive Card 객체> }`
- 성공은 `202`이고 응답 본문은 비어 있다
- 워크플로가 `triggerBody()?['card']`로 카드를 꺼내 채널에 게시한다

주소는 사람이 설정 화면에서 입력한다. **주소를 코드나 문서에 넣지 마라. 이 저장소는 공개다.**

## 파일별 조치

| 파일 | 조치 |
|---|---|
| `src/data/teams-notify.ts` | 신규 |
| `src/routes/Warehouse.tsx` | 입고 등록 처리 뒤에 알림 |
| `src/components/warehouse/OutboundRequestMailDialog.tsx` | 체크박스와 알림 |
| `src/routes/Setting.tsx` | 알림 탭에 주소 입력 카드 |

---

## 1. `src/data/teams-notify.ts` 신규

`src/data/mail-recipients.ts`와 같은 방식으로 만든다. 그 파일을 열어 형태를 그대로 따라라. 문서는 `state/teamsWebhook` 하나다.

**`CACHE_KEYS`에 `teamsWebhook`을 넣지 마라.** `mail-recipients.ts` 주석에 이유가 적혀 있다. 동기화 구독이 `CACHE_KEYS`에 없는 문서를 건너뛰어야 화면 데이터와 섞이지 않는다.

### 내보낼 것

```
loadTeamsWebhook(): Promise<string>
saveTeamsWebhook(url: string): Promise<string>
notifyTeams(card: unknown): Promise<"sent" | "skipped">
buildInboundCard(input: InboundCardInput): unknown
buildOutboundCard(input: OutboundCardInput): unknown
```

`saveTeamsWebhook`은 `https://`로 시작하지 않는 값을 저장하지 않고 빈 문자열로 만든다. 빈 문자열은 알림 끄기로 쓴다.

`notifyTeams`는 저장된 주소가 비어 있으면 아무것도 하지 않고 `"skipped"`를 돌려준다. 주소가 있으면 POST 하고, 응답이 `ok`가 아니면 `throw` 한다. 주소는 호출할 때마다 `loadTeamsWebhook`으로 읽는다. 캐시하지 마라. 호출 빈도가 하루 몇 번이다.

### 카드 만들기

두 카드는 같은 틀을 쓴다. 공용 헬퍼 하나를 두고 `buildInboundCard`와 `buildOutboundCard`가 그것을 부른다.

```
{
  type: "AdaptiveCard",
  $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
  version: "1.4",
  body: [
    { type: "TextBlock", text: <종류>, weight: "Bolder", size: "Medium", color: <색>, spacing: "None" },
    { type: "TextBlock", text: <한 줄 설명>, wrap: true, spacing: "Small" },
    { type: "FactSet", facts: <항목 배열>, spacing: "Medium" },
    { type: "TextBlock", text: "대상", weight: "Bolder", size: "Small", spacing: "Medium" },
    { type: "TextBlock", text: <목록을 빈 줄 두 개로 이은 문자열>, wrap: true, size: "Small", spacing: "Small" },
    { type: "TextBlock", text: <맺음말>, wrap: true, size: "Small", isSubtle: true, spacing: "Medium" }
  ],
  actions: [ { type: "Action.OpenUrl", title: "창고 화면 열기", url: <창고 주소> } ]
}
```

창고 주소는 하드코딩하지 말고 `${window.location.origin}${import.meta.env.BASE_URL}#/warehouse`로 만든다. 해시 라우터이고 base는 `/-3-/`다.

**목록은 15건까지만 적고 넘으면 마지막 줄에 `외 N건`을 붙인다.** 카드가 길어지면 채널에서 읽기 어렵다.

### 입고 등록 카드

- 종류 `입고 등록`, 색 `Accent`
- 설명 `원단 N건이 입고 등록되었습니다. 실물 확인 부탁드립니다.`
- 항목 `등록자`, `등록일`, `건수`, `R&D No.`
- `R&D No.`는 `src/data/mail-draft.ts`의 `storageNoSummary`를 쓴다
- 목록 한 줄 `{R&D No.}  FL {FL#}  Rack {Rack No.}  {수량} yds`
- Rack No.가 비면 `Rack 미지정`, 수량이 없으면 수량 부분을 통째로 뺀다
- 맺음말 `실물을 받으시면 창고 화면에서 입고 확인을 눌러 주십시오.`

### 출고 요청 카드

- 종류 `출고 요청`, 색 `Good`
- 설명 `원단 N건 출고를 요청합니다.`
- 항목 `요청자`, `사업부`, `희망 컷팅일`, `건수`
- 사업부가 비면 그 항목을 뺀다
- 목록 한 줄 `{R&D No.}  FL {FL#}  요청 {요청수량} yds  잔량 {재고} yds`
- 재고는 `outbound-request-mail.ts`의 `stockYds`를 쓴다. `null`이면 잔량 부분을 뺀다
- 맺음말 `상세 요청서는 메일로 따로 보내 드립니다.`

---

## 2. `src/routes/Warehouse.tsx`

870행 근처, 입고 등록 처리다. 현재 코드는 이렇다.

```tsx
await applyFabricActions(actionItems.map((item, index) => ({ fabricKey: item.key, action: "RECEIVE" as const, fromStatus: "READY" as const, toStatus: "WAREHOUSE" as const, storageNo: assigned[index], yds: parsedYds[index], note: "웹 입고 등록", recordIdentity: fabricRecordIdentity(item.record) })))
setReceiveNos({})
setChecked(new Set())
setTab("WAREHOUSE")
if (withInboundMail) setInboundMailKeys(actionItems.map((item) => item.key))
```

`applyFabricActions`가 끝난 뒤에 알림을 보낸다. 순서를 지켜라. 저장이 먼저다.

**알림 실패가 입고 등록을 무르게 만들면 안 된다.** `try`와 `catch`로 감싸고, 실패하면 화면에 한 줄 알리기만 하고 넘어간다. 이 파일이 오류를 알리는 방식이 이미 있으니 같은 것을 써라. 새로 만들지 마라.

카드에 넣을 값은 이 자리에 다 있다. `actionItems`, `assigned`, `parsedYds`, 그리고 447행의 `defaultRequester`가 등록자다. 등록일은 오늘 날짜다.

**`applyFabricActions` 안에 알림을 넣지 마라.** 그 함수는 store의 저수준 함수라 모든 상태 변경이 지나간다. 입고 취소나 폐기에도 알림이 붙어 버린다.

다른 분기(`UNRECEIVE`, `CONFIRM`, `UNCONFIRM`, `DISPOSE`, `OUTBOUND`, `EXHAUST`, `RESTORE`, `REMOVE`)에는 알림을 붙이지 마라. 이번 범위는 입고 등록 하나뿐이다.

---

## 3. `src/components/warehouse/OutboundRequestMailDialog.tsx`

77행 `makeMail`이다. 현재 코드는 이렇다.

```tsx
const makeMail = () => {
  if (invalid) { setNotice({ kind: "error", text: "요청 수량을 모두 입력하세요." }); return }
  const eml = buildEml({ to: [], subject: outboundRequestSubject(meta, requestLines), html: outboundRequestHtml(meta, requestLines) })
  downloadEml(`원단출고요청_${fileDateStamp()}.eml`, eml)
  setNotice({ kind: "ok", text: "메일 파일을 내려받았습니다. 파일을 열면 표가 들어간 Outlook 새 메일 창이 뜹니다. 받는 사람을 입력하고 보내세요." })
}
```

**체크박스를 하나 더한다.** 이름은 `창고팀에 Teams 알림 보내기`이고 기본은 켜짐이다. 창을 열 때 다시 켜짐으로 돌아간다(`open` 의존 `useEffect`에서 초기화).

`makeMail`은 `.eml` 내려받기를 지금처럼 하고, 체크가 켜져 있을 때만 알림을 보낸다. 알림이 실패해도 `.eml`은 이미 내려받은 상태이므로 `notice`를 오류로 덮지 말고 별도 문구로 알린다.

체크박스가 필요한 이유는 이렇다. 이 화면은 초안만 만들고 실제 발송 여부를 저장하지 않는다. 초안만 확인하고 안 보내는 경우가 있는데 그때 알림이 나가면 창고팀이 오지 않을 메일을 기다린다.

`.eml` 만드는 코드와 메일 본문 함수는 그대로 둔다.

---

## 4. `src/routes/Setting.tsx`

`알림` 탭이다. `<TabsContent value="alerts">` 안, 기존 `SectionCard` 다음에 `SectionCard`를 하나 더한다.

- 제목 `Teams 알림`
- 부제 `창고 입고 등록과 출고 요청을 Teams 채널에 알립니다. 비우면 알림을 보내지 않습니다.`
- 주소 입력 칸 하나와 저장 버튼
- **소유자에게만 보인다.** 이 파일 94행에 `const isOwner = currentUserIsOwner()`가 이미 있다. 같은 파일 258행이 `ownerOnly`를 거르는 방식을 쓰고 있으니 참고해라
- 열 때 `loadTeamsWebhook`으로 채우고 저장은 `saveTeamsWebhook`이다
- 저장 성공과 실패를 화면에 알린다. 이 파일이 쓰는 방식을 그대로 따라라

**시험 발송 버튼을 만들지 마라.** 이번 범위가 아니다.

---

## 하지 말 것

- 서버, Firebase Functions, 프록시를 만들지 마라. 브라우저에서 바로 `fetch` 한다
- 웹훅 주소를 코드, 주석, 문서, 시험 파일 어디에도 넣지 마라. 공개 저장소다
- `CACHE_KEYS`에 `teamsWebhook`을 넣지 마라
- `applyFabricActions`나 `useAppStore`를 고치지 마라
- 메일 초안 코드(`mail-draft.ts`, `outbound-request-mail.ts`, `inbound-request-mail.ts`)를 고치지 마라
- 입고 등록과 출고 요청 외 다른 창고 동작에 알림을 붙이지 마라
- 알림 이력을 저장하거나 작업 이력(`logAction`)에 남기지 마라. 다음 라운드다
- 재시도를 넣지 마라. 한 번 보내고 실패하면 알리기만 한다
- 화살표(`→`)와 가운뎃점(`·`)을 화면 문구에 쓰지 마라. 쉼표로 나눈다

## 검증

수정을 모두 마친 뒤 한 번만 돌린다.

```
npm run build
git status --short
```

빌드가 통과하고 위에 적은 파일 네 개 외에 바뀐 것이 없으면 된다.

실제 전송 확인은 사람이 한다. 주소가 필요하므로 코덱스가 확인할 수 없다.

## 마지막 보고

수정한 파일, 빌드 결과, 판단이 필요한 지점만 적어라. 바꾼 코드를 다시 붙이지 마라.
