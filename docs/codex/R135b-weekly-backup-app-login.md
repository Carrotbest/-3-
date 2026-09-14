# R135b 주간 백업 인증을 앱 로그인(Firebase Auth REST)으로 교체

상태: 미착수. R135(`docs/codex/R135-weekly-local-backup.md`)로 만든 `tools/backup/`을 고친다. 저장, 엑셀, zip, 메일, 보관 정리 동작은 그대로 둔다. **인증과 Firestore 읽기만 바꾼다.**

## 틀렸던 가설 (다시 시도하지 말 것)
- 읽기 전용 서비스 계정 키(JSON) 방식은 쓸 수 없다. 조직 정책 `iam.disableServiceAccountKeyCreation`이 키 발급을 막는다(2026-09-14 콘솔에서 확인). 정책을 푸는 것은 조직 보안을 낮추므로 하지 않는다. `google-cloud-firestore`, `google.oauth2.service_account` 경로를 되살리지 마라.

## 확인된 사실
- `firestore.rules` 34~36행: `match /state/{docId} { allow read: if isApproved(); ... }`. 승인된 앱 사용자(Firebase Auth)의 ID 토큰으로 읽을 수 있다.
- 앱 공개 API 키(`src/data/firebase.ts`의 `apiKey`)로 PC에서 `identitytoolkit` 로그인을 호출하면 제한 없이 응답한다. 가짜 계정 시험 결과는 `400 INVALID_LOGIN_CREDENTIALS`였다. HTTP referrer 제한이 없다는 뜻이다.
- `pywin32` 311 설치됨(`win32cred` 사용 가능). 표준 라이브러리 `urllib`로 REST를 호출한다. **새 패키지를 쓰지 않는다.**

## 설정 변경 (`config.example.json`)
```json
{
  "project_id": "fabric-rnd-20a6b",
  "api_key": "<src/data/firebase.ts의 apiKey>",
  "login_email": "admin@example.com",
  "output_dir": "C:\\Users\\<사용자>\\OneDrive\\FabricRnD_백업",
  "mail_to": "admin@example.com",
  "keep_weeks": 12,
  "attach_limit_mb": 20
}
```
- `key_path`를 없앤다. 필수 항목 검사(`load_config`)도 위 7개로 바꾼다.

## `weekly_backup.py` 변경
1. import에서 `google.cloud.firestore`, `google.oauth2.service_account`를 지운다. `urllib.request`, `urllib.error`, `getpass`를 쓴다. `win32cred`는 필요한 함수 안에서 import 한다.
2. 상수 `CREDENTIAL_TARGET = "FabricRnD-weekly-backup"`.
3. 인자 `--save-login`: `login_email`을 보여 주고 `getpass.getpass("앱 비밀번호: ")`로 받는다. 실제로 로그인을 한 번 시도해 성공할 때만 `win32cred.CredWrite({"Type": win32cred.CRED_TYPE_GENERIC, "TargetName": CREDENTIAL_TARGET, "UserName": login_email, "CredentialBlob": password, "Persist": win32cred.CRED_PERSIST_LOCAL_MACHINE}, 0)`로 저장하고 "저장했습니다"를 출력한 뒤 종료 코드 0. 로그인이 실패하면 저장하지 않고 종료 코드 1. 메일은 보내지 않는다.
4. `load_password()`: `win32cred.CredRead(CREDENTIAL_TARGET, win32cred.CRED_TYPE_GENERIC)`의 `CredentialBlob`을 문자열로 돌린다. bytes면 `utf-16-le`로 디코드한다. 없으면 `RuntimeError("저장된 로그인이 없습니다. --save-login을 먼저 실행하세요.")`.
5. `sign_in(api_key, email, password) -> str`: `POST https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key={api_key}`, 본문 `{"email", "password", "returnSecureToken": true}`. 응답의 `idToken`을 돌린다. HTTP 오류면 응답 JSON의 `error.message`만 담아 `RuntimeError(f"로그인 실패: {message}")`. **비밀번호, 토큰, API 키를 예외 메시지·로그·출력에 넣지 않는다.**
6. `FirestoreRest` 작은 클래스(생성자 `project_id, id_token`):
   - 기준 경로 `projects/{project_id}/databases/(default)/documents`.
   - `get(doc_path) -> dict | None`: `GET https://firestore.googleapis.com/v1/{기준}/{doc_path}`, 헤더 `Authorization: Bearer {id_token}`. 404면 None. 그 밖의 HTTP 오류는 `RuntimeError(f"Firestore 읽기 실패 {status}: {doc_path}")`. 403이면 메시지에 "앱 계정 승인 여부를 확인하세요"를 덧붙인다.
   - `batch_get(doc_paths) -> dict[str, dict | None]`: `POST https://firestore.googleapis.com/v1/{기준}:batchGet`, 본문 `{"documents": ["{기준}/{path}", ...]}`. 응답은 JSON 배열이다. 각 항목의 `found.name` 끝 경로를 키로 `found`를 넣고, `missing`이면 None. 100개씩 나눠 호출한다.
   - 필드 값 변환 `field(fields, name)`: `integerValue`는 int, `stringValue`는 str, `timestampValue`는 str, `doubleValue`는 float, `nullValue`는 None, 그 밖은 None.
7. `read_state(store: FirestoreRest)`: 기존 로직을 유지한다. 메타 `state/{key}`가 None이면 "없음". `n = field(meta.fields, "n")`이 int가 아니거나 음수면 예외. 조각 `state/{key}__{i}`를 `batch_get`으로 읽는다. 하나라도 None이거나 `c`가 str이 아니면 예외. `updatedAt`, `updatedBy`는 `field`로 읽는다.
8. `run_backup`: `load_password()`, `sign_in(...)`, `FirestoreRest(project_id, token)` 순서로 바꾼다. 나머지는 그대로다.
9. 요청 제한 시간은 `urllib.request.urlopen(..., timeout=60)`.

## `requirements.txt`
`openpyxl>=3.1`, `pywin32>=306` 두 줄로 줄인다.

## `README.md` 변경
- "2. 읽기 전용 서비스 계정" 절을 지우고 "2. 로그인 저장"으로 바꾼다. 내용은 네 가지다.
  - 백업은 앱에 로그인하는 계정(승인 사용자 또는 소유자)으로 읽는다.
  - `python tools/backup/weekly_backup.py --save-login`을 실행해 비밀번호를 한 번 입력한다.
  - 비밀번호는 Windows 자격 증명 관리자(`FabricRnD-weekly-backup`)에만 저장되고 파일에 남지 않는다.
  - 앱 비밀번호를 바꾸면 다시 실행한다.
- "왜 서비스 계정을 쓰지 않나" 한 줄: 조직 정책 `iam.disableServiceAccountKeyCreation`이 키 발급을 막는다.
- 설치 절: `openpyxl`, `pywin32`만 필요하다.
- 문제 해결에 두 줄을 더한다. `로그인 실패: INVALID_LOGIN_CREDENTIALS`면 `--save-login` 재실행이다. `403`이면 앱에서 계정 승인 상태를 확인한다.

## `CLAUDE.md` 변경
"## 주간 백업" 절에서 "읽기 전용 서비스 계정" 표현을 "앱 로그인 계정(Firebase Auth REST, 비밀번호는 Windows 자격 증명 관리자)"으로 바꾼다. 한 줄을 더한다: "서비스 계정 키 방식은 조직 정책 `iam.disableServiceAccountKeyCreation`으로 막혀 있다. 되살리지 말 것."

## 하지 말 것
- Firestore에 쓰는 요청(PATCH, DELETE, commit)을 넣지 마라. GET과 batchGet만 쓴다.
- API 키, 이메일, 비밀번호를 저장소 파일에 넣지 마라. 예시에는 자리표시자만 쓴다.
- 스크립트 실행, `--save-login` 실행, 네트워크 호출, pip install을 하지 마라.
- `src/` 아래를 고치지 마라.

## 검증
- `python -m py_compile tools/backup/weekly_backup.py` 성공.
- `Select-String -Path tools/backup/weekly_backup.py -Pattern "google.cloud|service_account"` 결과 없음.
