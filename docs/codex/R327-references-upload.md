# R327 자료 라이브러리 색인을 Firestore referenceItems에 올리는 스크립트

상태: 미착수.

## 목적
R325 색인 스크립트가 저장소 밖에 만든 `references-index.json`(459건)을 Firestore `referenceItems` 컬렉션에 올린다. 웹 화면(R326)은 이미 이 컬렉션을 읽는다. 규칙은 게시됐다. 읽기는 승인 사용자, 쓰기는 소유자 계정만이다.

새 파일 `tools/references/upload_references.py` 하나를 만들고 README와 예시 설정을 갱신한다. **업로드 실행은 하지 않는다.** 비밀번호가 필요하고 사용자가 직접 돌린다.

## 확정된 설계. 다시 따지지 말 것
- **Python 표준 라이브러리만 쓴다.** `urllib.request`, `json`, `getpass`. `requests`, `firebase-admin`, `google-cloud-*` 금지. 서비스 계정 키를 쓰지 않는다.
- 인증은 Firebase Auth REST `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=<API_KEY>`. 이메일과 비밀번호로 로그인해 `idToken`을 받는다. Firestore REST 요청에 `Authorization: Bearer <idToken>`. 보안 규칙이 그대로 적용된다.
  - API 키와 프로젝트 ID는 `src/data/firebase.ts`에 이미 공개된 값을 상수로 쓴다. 프로젝트 `fabric-rnd-20a6b`, 키는 그 파일의 `apiKey`.
  - 이메일은 설정의 `owner_email`, 없으면 `input()`으로 묻는다. 비밀번호는 **반드시 `getpass.getpass()`**. 인자, 환경 변수, 파일로 받지 않는다. 화면과 로그에 찍지 않는다. 토큰을 파일에 저장하지 않는다.
- Firestore REST 기준 주소 `https://firestore.googleapis.com/v1/projects/fabric-rnd-20a6b/databases/(default)/documents`.
- **문서 ID는 색인의 `id` 그대로**(예: `ref-278bfe45fe45455a`).
- 기존 문서 ID 목록을 먼저 읽는다. `GET .../documents/referenceItems?pageSize=300&mask.fieldPaths=title`, `nextPageToken`으로 끝까지.
- 쓰기는 `POST .../documents:commit` 한 번에 최대 500건씩. 각 write는 `update` 문서와 `currentDocument` 전제 조건을 붙인다.
  - **새 문서**(기존 목록에 없음): 아래 "올리는 필드" 전부 + `tags: []` + `needsReview`(아래). `currentDocument: {"exists": false}`. `updateMask` 없음.
  - **기존 문서**: `updateMask.fieldPaths`를 색인 소유 필드 7개로 한정한다. `title`, `format`, `sizeBytes`, `documentDate`, `modifiedAt`, `owner`, `webUrl`. `currentDocument: {"exists": true}`. **`category`, `tags`, `curatedSummary`, `generatedSummary`, `excerpt`, `keywords`, `needsReview`는 마스크에 넣지 않는다.** 사람이 고친 분류와 요약을 재색인이 덮으면 안 된다.
  - 마스크에 있는데 색인 값이 비어 있는 필드(`documentDate`, `owner`)는 필드에서 빼고 보낸다. 그러면 Firestore가 그 필드를 지운다. 의도한 동작이다.
- **삭제하지 않는다.** Firestore에는 있는데 색인에 없는 문서는 개수와 ID만 보고한다.
- `needsReview`: 새 문서의 `sourceFolder`가 설정 `review_folders` 목록에 있으면 `true`, 아니면 필드를 넣지 않는다. 설정에 키가 없으면 빈 목록.

## 올리는 필드
색인 항목 키는 `category, documentDate, fileName, format, id, modifiedAt, owner, relativePath, sizeBytes, sourceFolder, subFolder, syncState, title, webUrl`이다.
- 올린다: `title`, `category`, `format`, `sizeBytes`(integerValue, 문자열로 인코딩), `documentDate`, `modifiedAt`, `owner`, `webUrl`. 모두 문자열은 stringValue.
- **올리지 않는다: `fileName`, `relativePath`, `sourceFolder`, `subFolder`, `syncState`, `id`(문서 ID로만 쓴다).** 이 PC의 로컬 경로 정보다.
- 빈 배열은 `{"arrayValue": {}}`, 불리언은 `booleanValue`.

## 실행 형태
```
python -I tools/references/upload_references.py            # 점검만. 네트워크 안 씀
python -I tools/references/upload_references.py --upload   # 로그인 후 실제 쓰기
```
`--config`는 `index_references.py`와 같은 기본값(`%USERPROFILE%\fabric-references\config.json`)과 같은 방식. 색인 파일은 `config["output_dir"]/references-index.json`.

**점검(기본)**: 네트워크를 쓰지 않는다. 다음을 검사해 출력하고, 하나라도 걸리면 exit 1.
- 항목 수, ID 중복 0, ID 형식 `^ref-[0-9a-f]{16}$`, `category`가 6개 ID 중 하나, `title`, `modifiedAt`, `format` 비어 있지 않음, `sizeBytes` 정수.
- 카테고리별 건수, `needsReview` 대상 건수, 문서 1건 크기 최댓값(바이트). 1건 예시는 **출력하지 않는다**(실데이터).

**업로드(`--upload`)**: 점검을 먼저 하고 통과해야 진행. 로그인, 기존 ID 조회, "신규 N건, 갱신 M건, 색인에 없는 기존 K건"을 출력하고 `계속하려면 yes 입력:`으로 확인받는다. `yes`가 아니면 쓰지 않고 끝낸다. commit 후 기존 ID를 다시 조회해 최종 문서 수를 출력한다.

HTTP 오류는 상태 코드와 응답 JSON의 `error.message`만 출력하고 exit 1. 로그인 실패 메시지(`INVALID_LOGIN_CREDENTIALS` 등)도 그대로 보여 준다. 토큰은 찍지 않는다.

## 파일별 조치
| 파일 | 조치 |
|---|---|
| `tools/references/upload_references.py` | 신규. `index_references.py`의 `parse_args`, `load_config` 형태를 따른다(복사해도 된다. import로 엮지 말 것. 서로 독립 실행). |
| `tools/references/config.example.json` | `"owner_email": "<소유자 계정 이메일>"`, `"review_folders": ["<사람이 분류를 다시 볼 최상위 폴더 이름>"]` 두 키 추가. |
| `tools/references/README.md` | "6. Firestore 업로드" 절 추가. 점검, 업로드 명령, 재색인 때 사람이 고친 필드는 덮지 않는다는 것, 삭제는 안 한다는 것, 비밀번호는 매번 입력한다는 것. |

## 하지 말 것
- `--upload`를 돌리지 말 것. 비밀번호를 만들거나 추측하지 말 것.
- 실제 설정 파일 `%USERPROFILE%\fabric-references\config.json`을 고치지 말 것. 저장소 밖이고 사용자가 관리한다.
- 색인 JSON 내용(제목, 경로, 이름)을 코드, 주석, README, 테스트에 넣지 말 것. 공개 저장소다.
- `src/` 아래를 고치지 말 것. 웹은 R326에서 끝났다.
- `npm run build`는 돌리지 않아도 된다. 파이썬만 바뀐다.

## 검증
- `python -I tools/references/upload_references.py` 가 exit 0이고 459건, 카테고리 materials 286 / fundamentals 119 / process 46 / market 8 / quality 0 / testing 0을 출력한다.
- `python -I -m py_compile tools/references/upload_references.py` 통과.
- `git status --short`에 위 표 3개 파일과 이 지시서만 새로 나온다.
