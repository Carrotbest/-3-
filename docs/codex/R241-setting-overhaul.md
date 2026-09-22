# R241 SETTING 전면 개편: 엑셀 업로드 제거, 데이터 보호 탭 신설

상태: 미착수. R240(병합 키 트랜잭션 저장) 배포 완료.

## 배경 (2026-09-22 사용자 확정)

- 앞으로 기존 엑셀 업로드 프로세스는 쓰지 않는다. 웹이 원본이다. SETTING 파일 연결 센터 카드는 **하나도 남기지 않는다.**
- 지금 SETTING에는 동작하지 않는 카드가 섞여 있다. 기준값, 알림 규칙, 사용자 권한 드롭다운, 팀 계층, 변경 이력은 localStorage `fabric.settings`에만 저장되고 다른 어느 파일도 읽지 않는다(검색 확인).
- 위험 경로 세 개를 없앤다.
  1. DD 비상용 업로드(`ingestDevelopment`): 웹 DD 전체를 파일로 갈아치운다.
  2. 샘플대장 업로드(`ingestSamples`): `completed`를 통째 교체한다.
  3. "캐시 비우기"(`resetCache`): IndexedDB를 비우고 스토어를 예시 데이터로 바꾼 채 동기화를 켜 둔다. 이 상태에서 한 번 저장하면 R240 병합이 서버에만 있는 행을 삭제로 읽을 수 있다. 게다가 `clearCache()`는 **화학 첨부 저장소(`attachments`)까지 지운다.** 화학 첨부는 이 PC 브라우저에만 있어 영구 삭제다.

## 새 구성

탭 4개. 순서대로 `사용자와 권한`, `데이터 보호`, `작업 이력`, `연동`. 기본 탭은 `사용자와 권한`.

| 탭 | 내용 |
|---|---|
| 사용자와 권한 | `<UserApprovalPanel />`만 |
| 데이터 보호 | 새 `<DataProtectionPanel />` |
| 작업 이력 | `<AuditLogPanel />`만 |
| 연동 | 기존 Teams 알림 카드(소유자만). 소유자가 아니면 `연동 설정은 소유자만 바꿀 수 있습니다.` 한 줄 |

- `PageHeader` 제목 `SETTING`, 부제 `사용자 권한, 데이터 보호, 작업 이력, 연동을 관리합니다. 엑셀 업로드는 쓰지 않습니다.`. 헤더의 `저장` 버튼과 `saveMessage` 줄, 맨 아래 `설정은 이 브라우저에만 저장됩니다.` 줄은 없앤다(로컬 설정이 사라지므로).
- Teams 저장 결과 문구는 Teams 카드 안에 작게 보인다(기존 `saveMessage` 대신 카드 로컬 상태).

## 파일별 조치

### 1. `src/routes/Setting.tsx` 재작성

- 남길 것: Teams 웹훅 상태와 `loadTeamsWebhook`, `saveTeamsWebhook` 사용 코드, `UserApprovalPanel`, `AuditLogPanel`.
- 지울 것: `STORAGE_KEY`, `PERMISSIONS`, `StandardValue`, `SettingsUser`, `AlertRule`, `HistoryEntry`, `SettingsState`, `STANDARD_GROUPS`, `defaults`, `loadSettings`, `cloneSettings`, 파일 연결 탭 전체, 기준값 탭 전체, 팀 계층, 사용자 권한 카드, 알림 규칙 카드, 변경 이력 카드, `sampleAudit`, `deliverOne`, `exportLedgerArchive`, `resetCache`, `exportJsonBackup`(데이터 보호 패널로 옮김), `Sync` import와 데이터 탭.
- import는 실제로 쓰는 것만 남긴다.

### 2. 새 파일 `src/components/settings/DataProtectionPanel.tsx`

세 카드. `SectionCard`를 쓴다(표가 길지 않아 Reveal 문제 없음. 24행).

**카드 1. 저장 상태** (전원)
- 표 열: `데이터`, `저장 방식`, `항목 수`, `크기`, `한도 대비`, `서버 마지막 저장`, `저장한 사람`.
- 행은 `CACHE_KEYS` 전부. 라벨은 아래 표. 없는 키는 키 이름 그대로.
- `저장 방식`: `syncModeOf(key)`가 `merge`면 `병합 저장`, 아니면 `마지막 저장 우선`(회색 글씨). 셀 title에 `여러 명이 동시에 저장해도 항목이 빠지지 않습니다` / `여러 명이 동시에 저장하면 마지막 저장이 이깁니다`.
- `항목 수`: 스토어 값이 배열이면 길이, 아니면 `-`.
- `크기`: `new TextEncoder().encode(JSON.stringify(value ?? null)).length`를 MB 소수 2자리. 계산은 `useMemo`로 스토어 값이 바뀔 때만.
- `한도 대비`: 크기 / 10 MiB(10,485,760 바이트) 백분율 정수. 70% 이상 노란 글씨, 90% 이상 붉은 글씨.
- `서버 마지막 저장`, `저장한 사람`: `readStateMetas(CACHE_KEYS)` 결과의 `updatedAt`(형식 `yyyy-mm-dd HH:mm`, `fmtDateFull`+`fmtTime` 사용), `updatedBy`. 서버에 없으면 `-`.
- 카드 오른쪽 위 `새로 고침` 버튼이 `readStateMetas`를 다시 부른다. 처음 열 때 한 번 부른다. 실패하면 카드 안에 `서버 저장 상태를 읽지 못했습니다.`.
- 표 아래 작은 안내: `한 키의 크기가 10 MiB를 넘으면 서버에 저장할 수 없습니다. 샘플대장은 1팀 입고가 쌓일수록 커집니다.`

라벨:
| key | 라벨 |
|---|---|
| records | DD MASTER |
| completed | 샘플대장(1팀 입고 포함) |
| fabricOverrides | 창고 상태 |
| fabricEvents | 창고 이력 |
| disposalRounds | 폐기 라운드 |
| requests | FABRIC REQUEST |
| requestBoards | REQUEST 보드 |
| requestArchive | REQUEST 보관함 |
| ts | TROUBLE SHOOTING |
| study | STUDY |
| studyFiles | STUDY 자료 |
| events | 캘린더 |
| rdda | RDDA 데이터셋 |
| rddaSnapshots | RDDA 주간 스냅샷 |
| rddaReports | RDDA 월 보고 |
| fabricAnalysis | FABRIC ANALYSIS |
| materials | 자료 목록 |
| materialsManual | 자료 목록(수기) |
| materialDiagnostics | 자료 목록 점검 |
| chemical | 기능성 개발 |
| chemicalManual | 기능성 개발(수기) |
| chemicalLinks | 기능성 연결 |
| orgMembers | 조직도 |
| meta | 데이터 메타 |

**카드 2. 저장 실패** (전원)
- `getFailingSyncKeys()`로 초기값, `fabric:sync-failed`, `fabric:sync-recovered` 이벤트로 갱신.
- 없으면 `서버에 반영되지 않은 저장이 없습니다.`(초록 점). 있으면 키 라벨 목록을 붉은 글씨로, 아래에 `창을 닫거나 새로 고치지 마세요. 자동으로 다시 보냅니다.`.

**카드 3. 백업과 캐시** (소유자만. 아니면 카드를 그리지 않는다)
- `JSON 백업 내려받기` 버튼: 기존 Setting의 `exportJsonBackup` 그대로(`buildJsonBackup`, `backupFileName("json")`, `downloadBlob`). 설명 `전체 데이터를 복원용 JSON 한 파일로 내려받습니다. 주간 자동 백업은 이 PC 작업 스케줄러가 따로 돌립니다.`
- `이 PC 캐시 비우고 새로 고침` 버튼: `window.confirm("이 브라우저에 저장된 동기화 캐시를 비우고 새로 고칩니다. 서버 데이터는 그대로이며 새로 고친 뒤 다시 내려받습니다. 진행할까요?")` 후 `await clearSyncedCache()` 그리고 `window.location.reload()`. **스토어를 예시 데이터로 바꾸지 않는다. `createInitialAppState`를 부르지 않는다.** 설명 `화학 첨부파일은 지우지 않습니다.`
- 결과 문구는 카드 안 작은 글씨.

### 3. `src/data/cache.ts`

`clearCache` 아래에 추가. 기존 `clearCache`는 지우지 말고 둔다(다른 호출처 확인 후 없으면 그대로 두어도 된다).

```ts
/**
 * 동기화 캐시(parsed)만 비운다. 화학 첨부(attachments)는 이 PC에만 있어 지우면 되살릴 수 없으므로 건드리지 않는다.
 * 비운 뒤에는 반드시 새로 고친다. 새로 고치면 첫 스냅샷이 서버 값을 다시 내려 준다.
 */
export async function clearSyncedCache(): Promise<void> {
  const database = await openCacheDatabase()
  const transaction = database.transaction(STORE_NAME, "readwrite")
  transaction.objectStore(STORE_NAME).clear()
  await transactionDone(transaction)
}
```

### 4. `src/data/firestore-sync.ts`

- import에 `getDoc` 추가.
- 추가 export 세 개:
```ts
/** 저장 방식. SETTING 데이터 보호 탭이 보여 준다. */
export function syncModeOf(key: string): "merge" | "replace" {
  return isMergeKey(key) ? "merge" : "replace"
}

/** 지금 서버 반영이 실패해 재시도 중이거나 끝내 실패한 키. */
export function getFailingSyncKeys(): string[] {
  return [...failingKeys]
}

/** 키별 서버 meta 문서(n, updatedAt, updatedBy)만 읽는다. 청크는 읽지 않는다. */
export async function readStateMetas(keys: readonly string[]): Promise<Record<string, { n: number; updatedAt: string; updatedBy: string } | null>> {
  const entries = await Promise.all(keys.map(async (key) => {
    const snap = await getDoc(metaRef(key))
    if (!snap.exists()) return [key, null] as const
    const data = snap.data()
    return [key, { n: Number(data.n ?? 0), updatedAt: String(data.updatedAt ?? ""), updatedBy: String(data.updatedBy ?? "") }] as const
  }))
  return Object.fromEntries(entries)
}
```
- `pushAllToFirestore` 함수를 지운다(유일한 호출처 `Sync.tsx`가 사라진다).
- 그 밖의 동기화 로직(`pushCache`, `pushMergedNow`, `applySnapshot` 등)은 **한 글자도 바꾸지 마라.**

### 5. `src/routes/Sync.tsx` 삭제

유일한 사용처가 Setting이다. `src/App.tsx`의 `<Route path="/sync" element={<Navigate to="/setting" replace />} />`는 그대로 둔다(옛 주소 호환).

### 6. `src/data/upload.ts` 정리

지운다: `UploadResult`, `nextHistory`, `buildMeta`, `applyParsed`, `ingestDevelopment`, `ingestSamples`, `ingestStudyFiles`, `rddaMonth`, `ingestRdda`, `ingestMaterials`, `ingestChemical`, `ingestTs`, `TITLE_ORDER`, `fallbackMember`, `findString`, `ingestOrg`, `ingestHomeFiles`.
남긴다: `normalized`, `messageOf`, `workbookOf`, `run`, `ingestStudyWorkbook`(STUDY 화면), `isRddaReportV2`, `applyRddaReport`, `ingestRddaReport`(RDDA 화면), `ingestRddaMessage`(북마크 수집), `ingestFabric`(FABRIC ANALYSIS 화면).
import는 남은 코드가 쓰는 것만 남긴다. 지우기 전에 각 함수가 다른 파일에서 쓰이지 않는지 `rg`로 한 번 확인하고, 쓰이면 지우지 말고 보고해라(사전 확인 결과: 위 목록은 Setting 외 사용처 없음).

### 7. `CLAUDE.md`

- `## 방향`의 `샘플관리대장 업로드는 창고팀과 웹 이관 협의·교육 뒤 결정할 때까지 유지.`를 `엑셀 업로드는 쓰지 않는다(2026-09-22). SETTING 파일 연결 센터와 DD 비상용, 샘플대장 업로드 경로를 없앴다(R241). 새 업로드 경로를 만들지 않는다.`로 바꾼다.
- `## 백업` 절의 `DD 업로드 진입점은 SETTING 비상용 하나뿐이며 DD MASTER·DEVELOPMENT·창고에는 두지 않는다.`를 `DD 업로드 진입점은 없다(R241).`로 바꾼다. `JSON은 SETTING(소유자 전용)에서 내려받고` 문장은 `JSON은 SETTING 데이터 보호 탭(소유자 전용)에서 내려받고`로.
- 주의 절 끝에 한 줄: `- **캐시 비우기는 동기화 캐시(parsed)만 비우고 새로 고친다(R241, clearSyncedCache).** 스토어를 예시 데이터로 바꾼 채 동기화를 켜 두면 병합이 서버 행을 삭제로 읽을 수 있고, clearCache는 이 PC에만 있는 화학 첨부까지 지운다.`

## 하지 말 것

- 동기화 로직을 바꾸지 마라. `firestore-sync.ts`는 위 export 추가와 `pushAllToFirestore` 삭제만.
- STUDY, FABRIC ANALYSIS, RDDA 화면의 자체 업로드는 건드리지 마라(이번 범위 밖).
- `clearCache`로 새 버튼을 만들지 마라. 첨부가 지워진다.
- `createInitialAppState`로 스토어를 초기화하지 마라.
- `DataUpload` 컴포넌트, `ledger-archive.ts`는 지우지 마라(다른 화면과 App이 쓴다).
- 새 업로드 경로를 만들지 마라.

## 공통 제약

- 커밋하거나 푸시하지 마라. 워킹트리 변경까지만 한다.
- 사용자가 만든 기존 변경을 git reset이나 git checkout으로 되돌리지 마라.
- 공개 저장소다. 실데이터, 개인 메일을 코드나 문서에 넣지 마라.
- npm run build는 모든 수정을 마친 뒤 한 번만.
- public/data, legacy/, legacy-vanilla/, backup/은 열지 마라.
- 외부 자격증명이 필요한 명령은 돌리지 마라.
- 같은 오류를 두 번 고쳐 실패하면 멈추고 보고해라.
- 마지막 보고는 수정 파일, 검증 결과, 판단이 필요한 지점만.

## 성공 기준

- `npm run build` 통과.
- `git status --short`: `M CLAUDE.md`, `M src/routes/Setting.tsx`, `M src/data/cache.ts`, `M src/data/firestore-sync.ts`, `M src/data/upload.ts`, `D src/routes/Sync.tsx`, `?? src/components/settings/DataProtectionPanel.tsx`, `?? docs/codex/R241-setting-overhaul.md` 외 없음.
- `rg "ingestDevelopment|ingestSamples|pushAllToFirestore|fabric.settings" src` 결과 없음.
