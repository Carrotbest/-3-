# R102 — FABRIC REQUEST 데이터 모델과 Firebase Storage 기반

상태: 미착수. 이 지시서는 데이터 계약과 저장 기반만 만든다. 화면은 R103, DD 연결은 R104에서 한다.

## 배경

통합원단부 1팀(유관부서)이 스타일별 소싱 차트를 엑셀로 만들어 원단 R&D팀에 의뢰한다.
담당마다 양식이 달라 웹하드 링크로 흩어져 있다. 이 차트를 웹 원장으로 옮긴다.

흐름은 이렇다. 1팀이 차트 작성 → R&D가 fabric detail 작성 → 작지 작성(여기서 DD MASTER 행 생성)
→ 샘플 진행 → FL# 기재. **차트가 DD MASTER보다 먼저다.** DD 레코드에 필드를 얹는 방식은 성립하지 않는다.

원본 엑셀은 27열 4밴드 구성이다(original / 분석 / 의뢰 / 진행). 웹에서는 스타일 1건에
옵션 라인 N개가 달리는 부모-자식 구조로 푼다. 옵션 라인 하나가 DD 행 하나와 1대1로 대응한다.

## 하지 말 것

- 라우트, 화면 컴포넌트, 사이드바 항목을 만들지 마라. R103에서 한다.
- `src/data/zaji.ts`의 `intakeSource`를 건드리지 마라. R104에서 확장한다.
- `src/data/attachments.ts`를 건드리지 마라. 화학 첨부 전용이고 IndexedDB 저장을 그대로 둔다.
- `src/data/sample.ts`에 데모 request 데이터를 넣지 마라. 초기값은 빈 배열이다.
- `src/data/screen-permissions.ts`를 건드리지 마라. R103에서 키를 추가한다.
- Firebase 콘솔 작업이나 `firebase deploy`를 시도하지 마라. 사용자가 한다.

## 파일별 조치

| 파일 | 조치 |
|---|---|
| `src/data/schema.ts` | `RequestStyle`, `RequestOption` 타입 추가 |
| `src/data/cache.ts` | `CACHE_KEYS`(7행)에 `"requests"` 추가 |
| `src/store/useAppStore.ts` | `AppState`(54행)에 `requests` 추가, `createInitialAppState`에 빈 배열 |
| `src/data/firestore-sync.ts` | `MERGE_IDS`(24행)에 `requests` 항목 추가 |
| `src/data/firebase.ts` | `getStorage` 초기화와 export 추가 |
| `src/data/request-image.ts` | 신규. 이미지 리사이즈, 업로드, URL 조회, 삭제 |
| `storage.rules` | 신규. `firestore.rules`와 같은 승인자 기준 |
| `firebase.json` | 신규. firestore와 storage 규칙 경로 등록 |

## 1. `src/data/schema.ts`

`FabricAnalysisRow` 인터페이스 바로 앞에 추가한다.

```ts
/**
 * 1팀 소싱 차트의 스타일 1건. 엑셀 27열 중 스타일 단위로 공통인 값만 담는다.
 * 옵션별로 갈리는 값은 RequestOption이 갖는다.
 */
export interface RequestStyle {
  /** 내부 식별자. crypto.randomUUID 기반. 화면 표시는 chart + seq로 한다. */
  reqId: string
  /** 소속 차트명. 예: "26.FEB EU MARKET" */
  chart: string
  /** 진행 단계. 엑셀의 시트 두 개를 이 값 하나로 대신한다. */
  stage: "분석" | "개발"
  /** 차트 내 순번(엑셀 A열) */
  seq: number
  // ORIGINAL — 엑셀 B~G
  /** Storage 오브젝트 경로. 예: "requests/<reqId>/full.webp" */
  imagePath?: string
  /** 목록용 썸네일 경로 */
  imageThumbPath?: string
  /** 엑셀 C열. EU MARKET·SEASON 건은 DD의 Style No.와 같은 값을 쓰는 것이 관행이다. */
  garmentNo: string
  brand: string
  contents: string
  origConstruction: string
  origWeight: number | ""
  // 분석 — 엑셀 H~M
  yarnAnalysis: string
  devConstruction: string
  comment: string
  analyst: string
  // 의뢰 — 엑셀 N~Q
  urgent: boolean
  /** 1팀 의뢰 담당(엑셀 O열) */
  requester: string
  /** R&D 개발 담당(엑셀 P열) */
  developer: string
  /** 엑셀 Q열 "개발" */
  devPlan: string
  options: RequestOption[]
  createdAt: string
  updatedAt: string
}

/**
 * 스타일에서 파생된 옵션 라인 1건. DD MASTER 행과 1대1로 연결한다.
 * 개발처·Yarn ETA·READY DATE·FL#은 연결된 DD 행에서 읽어 표시하므로 여기 저장하지 않는다.
 */
export interface RequestOption {
  /** `${reqId}#${no}` */
  optId: string
  /** 옵션 번호. 1부터 */
  no: number
  /** 엑셀 S열 */
  yarnDetail: string
  /** 엑셀 T열 */
  color: string
  /** 엑셀 U열 */
  dyeingMethod: string
  /** 엑셀 Z열. 수기 유지 */
  remark: string
  /**
   * DD 행 연결. 값 기반 키라 DD 엑셀 재업로드 후에도 살아남는다.
   * R104에서 DD 쪽에도 optId를 심어 양방향으로 만든다.
   */
  ddLink?: { styleNo: string; opt: string }
}
```

## 2. `src/data/cache.ts`

7행을 통째로 바꾼다. 현재 값:

```ts
export const CACHE_KEYS = ["records", "completed", "meta", "study", "studyFiles", "events", "rdda", "fabricAnalysis", "ts", "orgMembers", "materials", "materialsManual", "materialDiagnostics", "fabricOverrides", "fabricEvents", "chemical", "chemicalManual", "chemicalLinks"] as const
```

배열 끝에 `"requests"`를 더한다. 순서를 바꾸지 마라.

## 3. `src/store/useAppStore.ts`

54행 `AppState`에서 `fabricEvents: FabricLedgerEvent[]` 다음 줄에 추가한다.

```ts
  requests: RequestStyle[]
```

`RequestStyle`을 schema.ts import 목록에 더한다.
`createInitialAppState`의 반환 객체에 `requests: []`를 넣는다. 샘플 데이터를 만들지 마라.

## 4. `src/data/firestore-sync.ts`

24행 `MERGE_IDS`에 항목을 더한다. 현재 값:

```ts
const MERGE_IDS: Record<string, (item: never) => string> = {
  records: (item: { _src: { sheet: string; row: number } }) => `${item._src.sheet}::${item._src.row}`,
  fabricOverrides: (item: { key: string }) => item.key,
  fabricEvents: (item: { id: string }) => item.id,
}
```

`fabricEvents` 줄 다음에 넣는다.

```ts
  requests: (item: { reqId: string }) => item.reqId,
```

여러 사람이 동시에 편집하는 원장이라 3-way 병합 대상이다. 빠뜨리면 마지막 저장이 남의 행을 덮는다.

## 5. `src/data/firebase.ts`

import에 `import { getStorage } from "firebase/storage"`를 더하고, 파일 끝에 추가한다.

```ts
export const storage = getStorage(firebaseApp)
```

`firebase` 패키지는 이미 설치되어 있다(`package.json` 의존성 `firebase ^12.18.0`). 새로 설치하지 마라.

## 6. `src/data/request-image.ts` (신규)

garment 사진 전용이다. 원본을 그대로 올리면 목록 로딩이 느려지므로 두 벌로 줄여 올린다.

- `full`: 긴 변 1200px, webp, 품질 0.82
- `thumb`: 긴 변 400px, webp, 품질 0.75

경로는 `requests/{reqId}/full.webp`, `requests/{reqId}/thumb.webp`로 고정한다.
스타일당 사진 1장이므로 같은 경로에 덮어쓴다.

내보낼 함수는 넷이다.

```ts
/** JPG·PNG·WEBP만 받는다. 3MB 초과는 거절한다. 통과하면 null을 돌려준다. */
export function validateRequestImage(file: File): string | null

/** 리사이즈 후 full·thumb 두 벌을 올리고 저장할 경로 두 개를 돌려준다. */
export async function uploadRequestImage(reqId: string, file: File): Promise<{ imagePath: string; imageThumbPath: string }>

/** Storage 경로를 화면에서 쓸 다운로드 URL로 바꾼다. 실패하면 null. */
export async function requestImageUrl(path: string): Promise<string | null>

/** 스타일 삭제 시 full·thumb를 함께 지운다. 없는 파일은 조용히 넘어간다. */
export async function deleteRequestImage(reqId: string): Promise<void>
```

리사이즈는 `createImageBitmap` + `OffscreenCanvas`를 쓰되, 없으면 `<canvas>`로 떨어지게 한다.
`canvas.toBlob(blob => ..., "image/webp", quality)` 결과가 null이면 원본 파일을 그대로 올린다.
비율은 유지한다. 긴 변이 목표보다 작으면 확대하지 마라.

업로드는 `uploadBytes`, URL은 `getDownloadURL`, 삭제는 `deleteObject`를 쓴다.
`deleteObject`가 `storage/object-not-found`로 던지면 삼킨다. 다른 오류는 그대로 던진다.

`requestImageUrl`은 같은 경로를 반복 호출하므로 모듈 수준 `Map<string, string>` 캐시를 둔다.

## 7. `storage.rules` (신규)

`firestore.rules`와 같은 승인자 기준을 쓴다. 소유자 이메일도 같은 값이다.

```
rules_version = '2';

// Fabric R&D 이미지 접근 규칙
// - 승인된 사용자만 읽고 쓴다. 판정 기준은 firestore.rules와 같다.
// - 소유자를 바꾸려면 firestore.rules와 src/data/app-config.ts의 OWNER_EMAIL을 함께 고친다.
service firebase.storage {
  match /b/{bucket}/o {
    function isSignedIn() {
      return request.auth != null;
    }
    function isOwner() {
      return isSignedIn()
        && request.auth.token.email != null
        && request.auth.token.email.lower() == 'hkpark@hansoll.com';
    }
    function isApproved() {
      return isOwner()
        || (firestore.exists(/databases/(default)/documents/users/$(request.auth.uid))
            && firestore.get(/databases/(default)/documents/users/$(request.auth.uid)).data.status == 'approved');
    }

    match /requests/{reqId}/{file} {
      allow read: if isApproved();
      allow write: if isApproved()
                   && request.resource.size < 3 * 1024 * 1024
                   && request.resource.contentType.matches('image/.*');
    }

    match /{allPaths=**} {
      allow read, write: if false;
    }
  }
}
```

## 8. `firebase.json` (신규)

현재 이 파일이 없어 규칙을 콘솔에서 붙여넣고 있다. 배포 경로를 만든다.

```json
{
  "firestore": {
    "rules": "firestore.rules"
  },
  "storage": {
    "rules": "storage.rules"
  }
}
```

## 검증

```
npm run build
git status --short
```

성공 기준은 셋이다.

1. `npm run build`가 통과한다. `tsc --noEmit`이 포함되어 있다.
2. `git status --short`에 이 지시서에 적힌 8개 파일만 뜬다. `docs/manual/`은 원래 미추적이라 남아 있어도 된다.
3. `src/data/request-image.ts`가 `src/data/firebase.ts`의 `storage`만 import하고, `attachments.ts`나 `cache.ts`를 import하지 않는다.

화면 확인은 없다. 이 지시서는 화면을 만들지 않는다.

## 사용자 조치(코덱스 대상 아님)

Firebase 콘솔에서 Storage를 활성화해야 업로드가 동작한다. 버킷은 `fabric-rnd-20a6b.firebasestorage.app`이고
`src/data/firebase.ts`의 config에 이미 들어 있다. 규칙 배포는 콘솔 붙여넣기 또는 `firebase deploy --only storage`로 한다.
