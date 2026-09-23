# R250 — 창고 입고·출고 요청 메일을 Outlook 새 창 방식으로 전환, 공용 고정 수신자

상태: 미착수

## 배경

창고 입고 요청과 출고 요청은 지금 `.eml` 파일을 내려받는다. 사람이 다운로드 목록에서 파일을 열어야 Outlook 새 메일 창이 뜨고, `.eml`은 본문이 이미 완성돼 있어서 **Outlook 서명이 붙지 않는다.**

FABRIC ANALYSIS의 분석 의뢰·완료 메일은 이미 다른 방식이다(`src/data/analysis-mail.ts`의 `copyAndOpen`). 본문과 표를 클립보드에 담고 `mailto:`로 Outlook 새 메일 창을 바로 연다. 서명이 붙은 빈 본문이 뜨고 사람이 Ctrl+V 한 번으로 본문을 채운다.

창고 두 화면도 같은 방식으로 통일한다. 수신자는 입고·출고가 **같은 목록 한 벌**을 쓴다(2026-09-23 사용자 확정).

## 확정 사항

- 입고·출고 둘 다 `mailto:` 새 창 방식으로 바꾼다. `.eml`은 **클립보드가 막혔을 때의 자동 대체 경로로만** 남는다. 화면에 `.eml` 버튼을 새로 만들지 않는다.
- 수신자는 입고·출고 공용 한 벌. Firestore 문서 `state/mailRecipients`의 **필드 이름 `inbound`를 그대로 쓴다.** 이미 등록된 목록이 있을 수 있어 옮기지 않는다. 함수 이름만 `warehouse`로 바꾼다.
- 수신자 편집은 지금처럼 소유자(`isOwner`)에게만 보인다.
- 메일 주소는 코드에 넣지 않는다. 공개 저장소다. 3명 등록은 사용자가 화면에서 한다.

## 파일별 조치

| 파일 | 조치 |
|---|---|
| `src/data/mail-draft.ts` | `openMailto`, `composeMail`, `ComposeDraft` 추가 |
| `src/data/analysis-mail.ts` | 자체 `addressValue`/`openMailto`/`copyAndOpen`을 공용 `composeMail`로 교체 |
| `src/data/mail-recipients.ts` | `loadInboundRecipients`/`saveInboundRecipients` → `loadWarehouseRecipients`/`saveWarehouseRecipients` |
| `src/data/inbound-request-mail.ts` | `inboundRequestLines` 분리 export |
| `src/data/outbound-request-mail.ts` | `outboundRequestLines` 분리 export |
| `src/components/warehouse/MailRecipientsField.tsx` | 신규. 수신자 패널(불러오기·칩 표시·소유자 편집) |
| `src/components/warehouse/InboundRequestMailDialog.tsx` | 수신자 JSX를 새 컴포넌트로 교체, `composeMail` 사용, 안내 문구 수정 |
| `src/components/warehouse/OutboundRequestMailDialog.tsx` | 수신자 패널 추가, `composeMail` 사용, 안내 문구 수정 |

## 1. `src/data/mail-draft.ts`

파일 맨 위 주석(1~7행)의 두 번째 문단을 아래로 바꾼다.

```
 * 기본은 `composeMail`이다. 본문과 표를 클립보드에 담고 `mailto:`로 Outlook 새 메일 창을 연다.
 * 서명이 붙은 빈 본문이 뜨고 사람이 붙여넣는다. 클립보드가 막히면 본문이 완성된 `.eml`로 떨어지는데,
 * 이때는 `X-Unsent: 1`이 붙어 보내기 전 새 메일로 열리는 대신 서명이 붙지 않는다.
 * 어느 쪽도 자동 발송이 아니다. 사람이 확인하고 보낸다.
```

`downloadEml`(104~114행) **바로 아래**에 추가한다.

```ts
const addressValue = (addresses: readonly MailAddress[]): string =>
  addresses.map((item) => item.email.trim()).filter(Boolean).join(",")

export interface ComposeDraft {
  /** 클립보드가 막혔을 때 떨구는 .eml 파일 이름 */
  fileName: string
  subject: string
  to: readonly MailAddress[]
  cc?: readonly MailAddress[]
  /** 본문 글 줄. `{table}` 자리에 표가 들어간다 */
  lines: readonly string[]
  columns: readonly string[]
  rows: readonly (readonly string[])[]
}

/** 받는 사람·참조·제목만 담아 Outlook 새 메일 창을 연다. 본문은 비어 있고 서명이 붙는다. */
export function openMailto(draft: Pick<ComposeDraft, "to" | "cc" | "subject">): void {
  const cc = addressValue(draft.cc ?? [])
  // 주소는 EMAIL_PATTERN을 통과한 값이라 인코딩하지 않는다. %40, %2C로 바꾸면 Outlook 버전에 따라 주소를 못 읽는다.
  const query = [...(cc ? [`cc=${cc}`] : []), `subject=${encodeURIComponent(draft.subject)}`]
  window.location.href = `mailto:${addressValue(draft.to)}?${query.join("&")}`
}

/**
 * 본문과 표를 클립보드에 담고 Outlook 새 메일 창을 연다. 사람이 본문 첫 줄에 붙여넣는다.
 * 클립보드가 막히면 본문이 완성된 .eml을 내려받는다(서명은 안 붙는다).
 *
 * 호출부는 클릭 핸들러에서 **첫 await 없이 바로** 불러야 한다. 클립보드 쓰기는 사용자 제스처
 * 안에서만 허용되고, 앞에 다른 await이 끼면 제스처가 끊겨 복사가 조용히 실패한다.
 */
export async function composeMail(draft: ComposeDraft): Promise<"mailto" | "eml"> {
  try {
    await copyMailBody(draft.lines, draft.columns, draft.rows)
    openMailto(draft)
    return "mailto"
  } catch {
    const html = mailBodyHtml(draft.lines, mailTableHtml(draft.columns, draft.rows))
    downloadEml(draft.fileName, buildEml({ to: draft.to, cc: draft.cc, subject: draft.subject, html }))
    return "eml"
  }
}
```

## 2. `src/data/analysis-mail.ts`

동작은 그대로 두고 중복만 없앤다.

- 2행 import에 `composeMail`과 `type ComposeDraft`를 넣고 더 이상 안 쓰는 것을 뺀다.
- 10~18행 `interface AnalysisMailDraft`를 지우고 `type AnalysisMailDraft = ComposeDraft`로 바꾼다. 필드 구성이 같다.
- 39행 `addressValue`, 41~46행 `openMailto`를 지운다. 공용으로 옮겼다.
- 53~62행 `copyAndOpen`을 지우고, `openAnalysisRequestMail`/`openAnalysisFinishedMail`이 `composeMail(requestDraft(...))` / `composeMail(finishedDraft(...))`를 그대로 반환하게 한다.
- 48~51행 `downloadDraft`는 남긴다. `.eml로 받기` 버튼이 쓴다.

## 3. `src/data/mail-recipients.ts`

6~11행 주석을 아래로 바꾼다.

```
/**
 * 창고 입고·출고 요청 메일의 공용 고정 수신자. 두 화면이 같은 목록 한 벌을 쓴다(2026-09-23).
 * 공개 저장소라 주소와 이름을 코드에 넣지 않고 Firestore에 둔다.
 *
 * 문서는 `state/mailRecipients` 하나다. 동기화 구독은 `CACHE_KEYS`에 없는 문서를 건너뛰므로
 * 화면 데이터와 섞이지 않는다. 규칙상 승인 사용자는 쓸 수 있지만 편집 화면은 소유자에게만 보인다.
 *
 * **필드 이름 `inbound`는 그대로 둔다.** 입고 전용이던 시절에 등록한 목록을 옮기지 않기 위해서다.
 * 이름만 warehouse로 바뀌었고 저장 위치는 같다.
 */
```

20~33행의 `loadInboundRecipients`/`saveInboundRecipients`를 `loadWarehouseRecipients`/`saveWarehouseRecipients`로 이름만 바꾼다. **본문과 `inbound` 필드 이름은 건드리지 않는다.** `loadAnalysisRecipients`/`saveAnalysisRecipients`(35~48행)는 그대로 둔다.

## 4. `src/data/inbound-request-mail.ts`

34~47행 `inboundRequestHtml`을 둘로 나눈다. 문구와 순서는 지금 그대로다.

```ts
/** 메일 본문 글 줄. `{table}` 자리에 표가 들어간다. */
export function inboundRequestLines(meta: InboundRequestMeta, items: readonly FabricLedgerItem[]): string[] {
  const lines = [
    "정산관리팀 담당자님,",
    "",
    "안녕하세요.",
    `아래 원단 ${items.length}건 입고 요청 드립니다.`,
    "",
    "{table}",
    "",
  ]
  if (meta.deliveryDate) lines.push(`전달 예정일: ${shortDate(meta.deliveryDate)}`)
  if (meta.note.trim()) lines.push(`비고: ${meta.note.trim()}`)
  lines.push("", meta.requester.trim() ? `${meta.requester.trim()} 드림` : "감사합니다.")
  return lines
}

export function inboundRequestHtml(meta: InboundRequestMeta, items: readonly FabricLedgerItem[]): string {
  return mailBodyHtml(inboundRequestLines(meta, items), mailTableHtml(INBOUND_REQUEST_COLUMNS, inboundRequestRows(items)))
}
```

4~7행 주석의 "받는 사람은 `mail-recipients.ts`의 고정 목록이다"는 "받는 사람은 `mail-recipients.ts`의 창고 공용 고정 목록이다"로 고친다.

## 5. `src/data/outbound-request-mail.ts`

50~64행 `outboundRequestHtml`을 같은 방식으로 나눈다. 지역 변수 이름이 `rows`인데 인자 이름 `lines`와 겹치지 않게 아래처럼 쓴다.

```ts
/** 메일 본문 글 줄. `{table}` 자리에 표가 들어간다. */
export function outboundRequestLines(meta: OutboundRequestMeta, lines: readonly OutboundRequestLine[]): string[] {
  const body = [
    "정산관리팀 담당자님,",
    "",
    "안녕하세요.",
    `아래 원단 ${lines.length}건 컷팅 및 출고 요청 드립니다.`,
    "",
    "{table}",
    "",
  ]
  if (meta.division.trim()) body.push(`부서: ${meta.division.trim()}`)
  if (meta.requester.trim()) body.push(`요청자: ${meta.requester.trim()}`)
  if (meta.wantedDate) body.push(`희망 컷팅일: ${shortDate(meta.wantedDate)}`)
  body.push("", "컷팅 완료되면 픽업 가능 일정 회신 부탁드립니다.", "", "감사합니다.")
  return body
}

export function outboundRequestHtml(meta: OutboundRequestMeta, lines: readonly OutboundRequestLine[]): string {
  return mailBodyHtml(outboundRequestLines(meta, lines), mailTableHtml(OUTBOUND_REQUEST_COLUMNS, outboundRequestRows(lines)))
}
```

4~8행 주석 중 "받는 사람은 코드에 넣지 않는다(공개 저장소). 사람이 Outlook에서 입력한다."를 "받는 사람은 코드에 넣지 않는다(공개 저장소). `mail-recipients.ts`의 창고 공용 고정 목록을 쓴다."로 고친다.

## 6. 신규 `src/components/warehouse/MailRecipientsField.tsx`

지금 `InboundRequestMailDialog.tsx` 99~122행에 있는 수신자 패널을 그대로 옮긴다. 마크업·클래스·문구를 새로 짜지 말고 **현재 JSX를 복사**해 온다.

```tsx
interface MailRecipientsFieldProps {
  /** 대화상자 열림 상태. 열릴 때 한 번 불러온다 */
  open: boolean
  onRecipientsChange: (list: MailAddress[]) => void
  onEditingChange: (editing: boolean) => void
}
```

- 내부 상태: `recipients`, `loading`, `editing`, `draft`, `saving`, `notice`. 전부 지금 다이얼로그에 있던 것을 옮긴 것이다.
- `useEffect`는 `open`이 true가 될 때만 돈다. 지금과 같이 `cancelled` 플래그로 정리하고, 의존성 배열은 `[open]`이다.
- 불러오기 성공·저장 성공 때 `onRecipientsChange(list)`를 부른다. 실패하면 `onRecipientsChange([])`를 부른다.
- `editing`이 바뀔 때마다 `onEditingChange(editing)`을 부른다.
- 수신자 관련 알림(`불러오지 못했습니다`, `저장했습니다`, `메일 주소를 확인하세요`)은 이 컴포넌트가 패널 안에 직접 그린다. 부모의 `notice`로 올리지 않는다.
- `loadWarehouseRecipients`/`saveWarehouseRecipients`를 쓴다.
- 저장 성공 문구는 "수신자를 저장했습니다. 입고·출고 요청 메일에 같은 목록이 적용됩니다."
- 빈 목록 문구는 그대로 둔다.

## 7. `src/components/warehouse/InboundRequestMailDialog.tsx`

- import 정리: `Plus`, `Settings2`, `X`, `useAuthStore`, `loadInboundRecipients`, `saveInboundRecipients`, `EMAIL_PATTERN`, `buildEml`, `downloadEml`을 더 이상 안 쓰면 뺀다. `Input`과 `Label`은 요청자·전달 예정일·비고 칸이 계속 쓴다.
- 상태에서 `loading`, `draft`, `savingRecipients`를 빼고 `recipients`와 `editing`만 남긴다. 두 값은 `MailRecipientsField`의 콜백으로 채운다.
- 53~72행 `startEdit`, `saveDraft` 삭제. 38~51행 `useEffect`에서 수신자 로딩 부분을 빼고 `meta`·`notice` 초기화만 남긴다.
- 99~122행 수신자 패널 JSX를 `<MailRecipientsField open={open} onRecipientsChange={setRecipients} onEditingChange={setEditing} />`로 교체한다.
- `makeMail`을 아래로 바꾼다.

```tsx
  const makeMail = async () => {
    if (!recipients.length) { setNotice({ kind: "error", text: "수신자가 등록되어 있지 않습니다." }); return }
    const mode = await composeMail({
      fileName: `원단입고요청_${fileDateStamp()}.eml`,
      subject: inboundRequestSubject(items),
      to: recipients,
      lines: inboundRequestLines(meta, items),
      columns: INBOUND_REQUEST_COLUMNS,
      rows,
    })
    setNotice(mode === "mailto"
      ? { kind: "ok", text: "Outlook 새 메일 창을 열었습니다. 본문 첫 줄에 Ctrl+V로 붙여넣고 보내세요. 서명은 그대로 남습니다." }
      : { kind: "ok", text: "클립보드 복사에 실패해 .eml 파일을 내려받았습니다. 파일을 열면 표까지 채워진 새 메일이 뜹니다(서명 없음)." })
  }
```

- 푸터 버튼(160행)은 `onClick={() => void makeMail()}`로 바꾸고 라벨을 `메일로 작성`으로 맞춘다. `disabled` 조건은 지금 그대로 둔다.
- 96행 설명을 "입고 등록한 원단 {items.length}건의 입고 요청 메일을 만듭니다. 받는 사람과 제목이 채워진 Outlook 새 메일 창이 뜨고, 본문은 클립보드에 담아 둡니다."로 바꾼다.
- 152~154행 안내 문구를 "메일은 자동으로 보내지 않습니다. 메일로 작성을 누르면 받는 사람과 제목이 채워진 Outlook 새 메일 창이 뜹니다. 본문 첫 줄에 Ctrl+V로 붙여넣고 확인한 뒤 보내세요. Rack No. 열은 창고팀이 채워 회신하도록 비워 둡니다."로 바꾼다.
- `표 복사` 버튼(159행)은 남긴다.

## 8. `src/components/warehouse/OutboundRequestMailDialog.tsx`

- `recipients`, `recipientsEditing` 상태를 추가한다.
- 108행 `<div className="grid gap-3 sm:grid-cols-3">` **바로 위**에 `<MailRecipientsField open={open} onRecipientsChange={setRecipients} onEditingChange={setRecipientsEditing} />`를 넣는다.
- `makeMail`을 아래로 바꾼다.

```tsx
  const makeMail = async () => {
    setTeamsNotice(null)
    if (invalid) { setNotice({ kind: "error", text: "요청 수량을 모두 입력하세요." }); return }
    const mode = await composeMail({
      fileName: `원단출고요청_${fileDateStamp()}.eml`,
      subject: outboundRequestSubject(meta, requestLines),
      to: recipients,
      lines: outboundRequestLines(meta, requestLines),
      columns: OUTBOUND_REQUEST_COLUMNS,
      rows: outboundRequestRows(requestLines),
    })
    setNotice(mode === "mailto"
      ? { kind: "ok", text: "Outlook 새 메일 창을 열었습니다. 본문 첫 줄에 Ctrl+V로 붙여넣고 보내세요. 서명은 그대로 남습니다." }
      : { kind: "ok", text: "클립보드 복사에 실패해 .eml 파일을 내려받았습니다. 파일을 열면 표까지 채워진 새 메일이 뜹니다(서명 없음)." })
  }
```

- **수신자가 비어도 막지 않는다.** 지금까지 출고는 받는 사람 없이 보내던 화면이라 등록 전에도 쓸 수 있어야 한다. `to: []`면 받는 사람 칸이 빈 새 메일이 뜬다. `disabled` 조건에 `recipients.length`를 넣지 마라. 단 `recipientsEditing`일 때는 막는다.
- 105행 설명을 "선택한 원단 {items.length}건의 컷팅·출고 요청 메일을 만듭니다. 받는 사람과 제목이 채워진 Outlook 새 메일 창이 뜨고, 본문은 클립보드에 담아 둡니다."로 바꾼다.
- 153~155행 안내 문구를 "메일은 자동으로 보내지 않습니다. 메일로 작성을 누르면 받는 사람과 제목이 채워진 Outlook 새 메일 창이 뜹니다. 본문 첫 줄에 Ctrl+V로 붙여넣고 확인한 뒤 보내세요. 실제 출고 기록은 정산관리팀 컷팅 회신 뒤 기존 출고 버튼으로 남깁니다."로 바꾼다.
- `buildEml`, `downloadEml` import가 안 쓰이면 뺀다. `Teams 알림 보내기`와 `표 복사`는 건드리지 않는다.

## 하지 말 것

- 메일 주소, 사람 이름, 협력사명을 코드나 주석에 넣지 마라. 공개 저장소다.
- Firestore 필드 이름 `inbound`를 바꾸지 마라. 이미 등록된 수신자가 사라진다.
- `DialogContent`에 `relative`, `absolute`, `static`을 넘기지 마라. tailwind-merge가 기본 `fixed`를 지워 팝업이 문서 흐름으로 떨어진다.
- `.eml로 받기` 같은 보조 버튼을 창고 두 화면에 새로 만들지 마라. `.eml`은 자동 대체 경로로만 쓴다.
- `composeMail` 앞에 다른 `await`을 넣지 마라. 클립보드 쓰기가 사용자 제스처를 벗어나 실패한다.
- `firestore-sync.ts`, `CACHE_KEYS`, 동기화 경로를 건드리지 마라. 수신자 문서는 동기화 대상이 아니다.
- `teams-notify.ts`와 출고 기록 경로를 건드리지 마라.
- FABRIC ANALYSIS의 화면 동작을 바꾸지 마라. 2번은 중복 제거일 뿐 결과가 같아야 한다.

## 검증

`npm run build` 한 번. `tsc --noEmit`이 포함돼 있다. 성공 기준은 타입 오류 0, 빌드 성공.

빌드 외 확인은 하지 마라. 화면 확인은 사용자가 한다.
