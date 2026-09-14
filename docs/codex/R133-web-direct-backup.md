# R133 DD·창고 웹 직접 관리 전환: DD 업로드 정리와 백업

상태: 미착수

## 결정 (사용자, 2026-09-14)
- DD MASTER와 창고는 엑셀을 파싱하지 않는다. 웹에서 직접 작성하고 관리한다. 엑셀은 백업과 문서 내보내기에만 쓴다.
- DD 엑셀 업로드는 화면 버튼 3곳을 없앤다. SETTING의 DD 슬롯 하나만 관리자 비상용으로 남긴다. 이유: 업로드는 웹에서 고친 `records` 전체를 파일 내용으로 덮어쓴다(`src/data/upload.ts` `applyParsed`, 41행 `setAppState({ records, ... })`).
- 샘플관리대장 업로드(SETTING `samples` 슬롯, `samples-archive`)는 **유지**한다. 창고팀과 협의한 뒤 정한다. 손대지 않는다.
- JSON 백업: SETTING에 둔다. SETTING은 이미 소유자 전용이다(`route-config.ts` 109행).
- 엑셀 백업: 권한 항목 `엑셀 백업`으로 부여한다. 기존 사용자는 기본 허용이다. DD MASTER와 창고 화면에서 누구나 내려받는다.

## 확인된 사실
- 사용자 문서에 팀·부서 필드가 없다. 권한은 `src/data/screen-permissions.ts`의 `SCREEN_PERMISSION_OPTIONS` 토글뿐이다.
- `firestore.rules`는 `screenPermissions` 키를 검사하지 않는다. 키를 더해도 규칙 배포가 필요 없다.
- `normalizeScreenPermissions`는 없는 키를 `fallback = true`로 채운다. 새 키는 기존 승인 사용자에게 자동 허용된다.
- 기존 DD "엑셀 내보내기"(`DevelopmentMasterSheet.tsx` 2393행)는 64열 양식만 쓴다. 웹 전용 값(FDS·YDS 날짜, `sortOrder` 등)과 창고 상태·이력이 빠진다. 그래서 백업은 별도 기능이다. 기존 내보내기는 그대로 둔다.

## 파일별 조치
| 파일 | 조치 |
|---|---|
| `src/data/screen-permissions.ts` | 16행 `setting` 항목 바로 앞에 `{ key: "excelBackup", label: "엑셀 백업" }`을 더한다. `paths`, `prefixes`는 없다. `permissionKeyForPath`는 `"paths" in candidate` 검사라 그대로 동작해야 한다. 타입 오류가 나면 이 파일 안에서만 고친다. 항목 위에 "화면이 아니라 기능 권한이다. 경로가 없어 라우팅에는 영향이 없다." 주석을 단다. |
| `src/data/backup-export.ts` (신규) | 아래 "백업 모듈" 명세대로 만든다. |
| `src/routes/DevelopmentMasterSheet.tsx` | 2412~2414행 `DataUpload`를 감싼 `div`를 지운다. 12행 `DataUpload`, 21행 `ingestDevelopment` import가 더 안 쓰이면 지운다. 2393행 "엑셀 내보내기" 버튼 바로 뒤에 `엑셀 백업` 버튼을 더한다. 같은 모양(`size="sm" variant="outline"`), 아이콘 lucide `DatabaseBackup`, 진행 중이면 `Loader2` 회전. `title="DD 전체와 창고 상태·이력, 샘플대장을 필드 그대로 엑셀로 내려받습니다"`. 보이는 조건은 `isOwner \|\| screenPermissions.excelBackup`이다(`@/data/auth`의 `useAuthStore`). 실패하면 기존 `notify`로 "엑셀 백업에 실패했습니다."를 띄운다. |
| `src/routes/Warehouse.tsx` | 1222행 내보내기 버튼 바로 뒤에 같은 `엑셀 백업` 버튼과 같은 표시 조건을 더한다. 오류 문구는 이 화면의 기존 알림 방식을 따른다. |
| `src/routes/Development.tsx` | 714행과 1491행의 `actions={<DataUpload ... />}` 속성을 지운다. 40행 `DataUpload`, 97행 `ingestDevelopment` import가 더 안 쓰이면 지운다. |
| `src/routes/Setting.tsx` | 239행 `development` 슬롯에 `ownerOnly: true`를 더한다. 제목은 `개발 현황 (DD) · 비상용`, targets는 `평소에는 쓰지 않습니다. 올리면 웹에서 작성한 DD 전체가 파일 내용으로 바뀝니다.`로 바꾼다. `onFiles`는 먼저 `window.confirm("DD 엑셀을 올리면 웹에서 작성한 DD 전체가 파일 내용으로 바뀝니다. JSON 백업을 먼저 내려받으셨습니까? 계속할까요?")`을 묻고 확인일 때만 `deliverOne`을 부른다. 265~267행 `캐시 비우기` 버튼 앞에 `JSON 백업 내려받기` 버튼(`variant="outline"`, 아이콘 `DatabaseBackup`)과 설명 한 줄 "전체 데이터를 복원용 JSON 한 파일로 내려받습니다. 복원 기능은 아직 없습니다."를 더한다. |
| `CLAUDE.md` | 12행 방향 줄을 "DD MASTER = 현황 관리 중심. **DD MASTER와 창고는 엑셀을 파싱하지 않고 웹에서 직접 작성·관리한다(2026-09-14).** 엑셀은 백업과 문서 내보내기만. 샘플관리대장 업로드는 창고팀 협의 전까지 유지."로 바꾼다. "## 보기 설정" 앞에 "## 백업 (`src/data/backup-export.ts`)" 절을 더해 아래 규칙 4줄을 적는다: JSON은 SETTING(소유자) 전용이고 복원용 원본이다. 엑셀은 `excelBackup` 권한이고 사람이 읽는 용도라 복원에 쓰지 않는다. 엑셀은 셀 32,000자에서 자르지만 JSON은 자르지 않는다. DD 업로드 진입점은 SETTING 비상용 하나뿐이며 DD MASTER·DEVELOPMENT·창고에 되살리지 않는다. |

## 백업 모듈 (`src/data/backup-export.ts`)
- `export async function buildJsonBackup(): Blob`
  - `useAppStore.getState()`에서 `CACHE_KEYS`(`src/data/cache.ts` 7행) 값만 뽑는다.
  - 내용: `{ app: "fabric-rnd", version: 1, exportedAt: new Date().toISOString(), data: { [key]: value } }`. `JSON.stringify(payload, null, 2)`, 타입 `application/json`.
- `export async function buildExcelBackup(): Promise<Blob>`
  - exceljs를 `fds-yds-request.ts`의 `buildFdsYdsWorkbook`과 같은 방식으로 동적 import한다.
  - 시트 순서: `안내`, `DD`(`records`), `창고상태`(`fabricOverrides`), `창고이력`(`fabricEvents`), `샘플대장`(`completed`).
  - `안내` 시트: 내보낸 시각, 시트별 행 수, 문장 "사람이 읽는 백업입니다. 복원에는 SETTING의 JSON 백업을 쓰세요."
  - 행 변환 `flattenRow(value)`: 중첩 객체는 점 표기 키(`tech.sampleDates.fds`)로 편다. 배열은 `JSON.stringify` 한 문자열 한 칸이다. `null`/`undefined`는 빈 칸이다.
  - 헤더는 모든 행 키의 합집합이고 처음 나온 순서를 따른다. 헤더 행은 굵게, 틀 고정(`views: [{ state: "frozen", ySplit: 1 }]`).
  - 문자열이 32,000자를 넘으면 앞 32,000자 + `…(잘림)`.
- `export function backupFileName(ext: "json" | "xlsx", date = new Date()): string` → `FabricRnD_백업_YYYYMMDD_HHmm.{ext}`.
- 내려받기는 `src/data/dd-export.ts`의 `downloadBlob`을 쓴다.

## 하지 말 것
- `src/data/upload.ts`의 `ingestDevelopment`, `ingestSamples`, `src/data/xlsx-parsers.ts`, `src/data/embedded-workbooks.ts`를 지우거나 고치지 않는다. SETTING 비상용과 다른 화면이 쓴다.
- SETTING `samples` 슬롯과 `samples-archive`는 손대지 않는다. 유지 결정이다.
- 작지 첨부(`DevelopmentMasterSheet.tsx` 2714행 `zajiInputRef`)는 입력 문서라 그대로 둔다.
- 복원 기능을 만들지 않는다. 동기화 덮어쓰기 위험 때문에 별도 설계한다.
- `firestore.rules`, 동기화 코드(`sync-merge.ts`, `firestore-sync.ts`, `cache.ts`)를 고치지 않는다.
- 기존 DD "엑셀 내보내기"와 창고팀 보고 내보내기를 바꾸지 않는다.

## 검증
- `npm run build` 성공.
- `git status --short`에 위 7개 파일과 이 문서만 보인다.
