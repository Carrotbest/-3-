# R208 · RDDA 갱신 버튼: 파일 없이 창 간 메시지로 집계 반영

상태: 구현 완료. 빌드 통과. 로그인 화면 확인 미완. 수집기는 v5(R210)부터 전 기간 데이터셋을 보낸다

## 무엇을 하는가

지금은 RDDA에서 수집 스크립트를 돌려 JSON을 내려받고, `/rdda`에서 그 파일을 업로드한다.
이를 다음 흐름으로 바꾼다.

1. `/rdda` 헤더의 **RDDA 갱신** 버튼 클릭. `window.open`으로 RDDA 창이 열린다.
2. 사용자가 그 창에서 북마크 **RDDA 수집**을 클릭한다. 수집기는 저장소 밖에 있고 이번 작업 범위가 아니다.
3. 수집기가 `window.opener.postMessage`로 진행 상황과 집계를 보낸다. 대시보드는 받은 집계를 기존 업로드와 같은 경로로 저장한다.

기존 **집계 JSON 업로드** 버튼은 예비용으로 그대로 둔다.

## 틀렸던 가설. 다시 시도하지 말 것

- 대시보드에서 `fetch("https://rdda.hansoll.com/...")`로 직접 가져오기. RDDA는 세션 쿠키 인증이고 CORS 허용이 없다. 연동 계정은 IT 협의 사항이라 포기했다.
- 수집 스크립트를 `public/`에 두고 북마클릿에서 불러오기. 스크립트에 팀원 사번이 들어 있어 공개 저장소에 올릴 수 없다.

## 메시지 계약 (수집기 쪽은 이미 이 형식으로 만든다)

RDDA 창에서 대시보드로 보낸다. `event.origin`은 반드시 `https://rdda.hansoll.com`이다.

```ts
{ source: "rdda-collector", type: "progress", message: string }
{ source: "rdda-collector", type: "report", report: unknown }   // RddaReportV2 형태, 약 25KB
{ source: "rdda-collector", type: "error", message: string }
```

대시보드에서 RDDA 창으로 답한다. targetOrigin은 `https://rdda.hansoll.com`이다.

```ts
{ source: "fabric-rnd", type: "ack", ok: boolean, message: string }
```

수집기는 `report`를 보낸 뒤 ack를 최대 15초 기다린다. `ok: true`면 창을 닫고, 아니면 message를 띄운다.

## 파일별 조치

| 파일 | 조치 |
|---|---|
| `src/data/upload.ts` | 아래 1 |
| `src/data/rdda-sync.ts` | 새 파일. 아래 2 |
| `src/routes/Rdda.tsx` | 아래 3 |

### 1. `src/data/upload.ts`

현재 코드는 152~166행이다.

```ts
export async function ingestRddaReport(files: File[]): Promise<void> {
  const jsonFiles = files.filter((file) => /\.json$/i.test(file.name))
  return run("rdda-report", ..., async () => {
    if (jsonFiles.length !== 1 || files.length !== 1) throw new Error("RDDA 집계 JSON 파일 한 개를 선택해 주세요.")
    setIngestState({ step: "parsing" })
    const parsed: unknown = JSON.parse(await jsonFiles[0].text())
    setIngestState({ step: "validating" })
    if (!isRddaReportV2(parsed)) throw new Error("RDDA 집계 JSON 형식이 올바르지 않습니다.")
    setAppState({ rdda: parsed })
    await saveCache("rdda", parsed)
    const snapshot = buildSnapshot(parsed)
    const existing = useAppStore.getState().rddaSnapshots
    saveRddaSnapshots(pruneSnapshots([...existing.filter((item) => item.weekId !== snapshot.weekId), snapshot]))
  })
}
```

- `setIngestState({ step: "validating" })`부터 끝까지를 `export async function applyRddaReport(value: unknown): Promise<void>`로 뽑는다. 형식이 틀리면 같은 오류를 던진다.
- `ingestRddaReport`는 파싱한 뒤 `await applyRddaReport(parsed)`만 부른다. 동작은 바꾸지 않는다.
- `export async function ingestRddaMessage(report: unknown): Promise<boolean>`를 추가한다. `run("rdda-report", "RDDA 자동 수집", () => applyRddaReport(report))`를 부르고, 끝난 뒤 `useAppStore.getState().ingest.step !== "error"`를 돌려준다. `run`의 기존 시그니처는 건드리지 않는다.

### 2. `src/data/rdda-sync.ts` (새 파일)

```ts
export const RDDA_ORIGIN = "https://rdda.hansoll.com"
export function startRddaSync(): void
```

동작:

- 이미 진행 중인 세션이 있으면 그 창에 `focus()`만 하고 끝낸다. 모듈 변수 하나로 관리한다.
- `const popup = window.open(`${RDDA_ORIGIN}/`, "rdda-sync")`. `noopener`를 주지 않는다. 주면 수집기가 opener를 못 찾는다.
- `popup`이 null이면 `setIngestState({ active: true, kind: "rdda-report", fileName: "RDDA 자동 수집", step: "error", message: "팝업이 차단되었습니다. 이 사이트의 팝업을 허용해 주세요." })` 후 종료.
- 열리면 `setIngestState({ active: true, kind: "rdda-report", fileName: "RDDA 자동 수집", step: "reading", message: "RDDA 창에서 북마크 'RDDA 수집'을 눌러 주세요." })`.
- `window.addEventListener("message", onMessage)`. 핸들러는 다음 순서로 거른다.
  - `event.origin !== RDDA_ORIGIN`이면 무시
  - `event.source !== popup`이면 무시
  - `event.data?.source !== "rdda-collector"`이면 무시
- `type === "progress"`: `setIngestState({ step: "parsing", message: String(event.data.message) })`
- `type === "error"`: `setIngestState({ step: "error", message: String(event.data.message) })`, 정리
- `type === "report"`: `const ok = await ingestRddaMessage(event.data.report)`. 그다음 `popup.postMessage({ source: "fabric-rnd", type: "ack", ok, message: ok ? "대시보드에 반영했습니다." : (useAppStore.getState().ingest.message ?? "반영에 실패했습니다.") }, RDDA_ORIGIN)`. 성공이면 `setIngestState({ message: "RDDA 집계를 반영했습니다." })`. 정리.
- 1초 간격으로 `popup.closed`를 본다. report를 받기 전에 닫히면 `setIngestState({ step: "error", message: "RDDA 창이 닫혀 갱신을 취소했습니다." })`, 정리.
- 15분이 지나도 report가 없으면 `step: "error"`, 메시지 "RDDA 갱신 시간이 초과되었습니다.", 정리.
- 정리 = 리스너 제거, 인터벌과 타임아웃 해제, 모듈 변수 초기화. 창은 닫지 않는다. 수집기가 닫는다.

`setIngestState`, `useAppStore` import는 `upload.ts` 11행과 같은 경로(`../store/useAppStore`)를 쓴다.

### 3. `src/routes/Rdda.tsx`

51행 현재 코드:

```tsx
        <DataUpload kind="rdda-report" label="집계 JSON 업로드" accept=".json,application/json" compact onFiles={(files) => void ingestRddaReport(files)} />
```

바꿀 코드:

```tsx
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" onClick={startRddaSync}><RefreshCw aria-hidden="true" />RDDA 갱신</Button>
          <DataUpload kind="rdda-report" label="집계 JSON 업로드" accept=".json,application/json" compact onFiles={(files) => void ingestRddaReport(files)} />
        </div>
```

- `RefreshCw`는 2행 lucide import에 더한다.
- `Button`은 `@/components/ui/button`, `startRddaSync`는 `@/data/rdda-sync`에서 import한다.
- 70행 footer는 이미 `ingest.kind === "rdda-report" && ingest.message`를 보여 준다. 고치지 않는다.

## 하지 말 것

- 수집 스크립트나 북마클릿을 저장소에 만들지 마라. 사번이 들어 있다. 저장소 밖에서 따로 관리한다.
- `message` 리스너에서 origin과 source 검사를 빼거나 완화하지 마라. 아무 창이나 팀 공유 데이터를 덮어쓸 수 있게 된다.
- `DataUpload`, `run`, `isRddaReportV2`의 기존 동작을 바꾸지 마라.
- 실데이터 JSON(바이어명, 업체명)을 코드, 샘플, 문서에 넣지 마라.

## 검증

- `npm run build` 통과
- `git status --short`에 위 세 파일과 이 문서 외 새 변경이 없을 것. 다른 작업의 미커밋 변경은 원래 있다
- 화면 확인은 박향근이 한다. `/rdda`에서 RDDA 갱신 클릭, RDDA 창에서 북마크 클릭, 1~2분 뒤 창이 닫히고 헤더 배지가 LIVE DATA로 바뀌면 성공
