# R135 주간 로컬 백업 스크립트 (PC 작업 스케줄러 + Python + Outlook)

상태: 미착수

## 요구
웹에서 직접 입력하고 관리하는 데이터를 매주 관리자 PC에 내려받는다. DD MASTER, 창고, TROUBLE SHOOTING 등이 대상이다. 관리자에게 메일도 보낸다. AI 호출은 없다. Windows 작업 스케줄러가 Python 스크립트를 돌린다.

## 확인된 사실
- Firestore 컬렉션 `state`. 키마다 메타 문서 `state/{key}` = `{ n, updatedAt, updatedBy, ts }`가 있다. 조각은 `state/{key}__{i}` = `{ c }`이고 i는 0부터 n-1까지다. 조각 문자열을 순서대로 이으면 `JSON.stringify(value)`가 된다(`src/data/firestore-sync.ts` 18~102행).
- 동기화 제외 키는 없다(`SKIP_SYNC_KEYS`가 빈 Set). 대상 키는 `src/data/cache.ts` 7행 `CACHE_KEYS` 19개 전부다: `records, completed, meta, study, studyFiles, events, rdda, fabricAnalysis, ts, orgMembers, materials, materialsManual, materialDiagnostics, fabricOverrides, fabricEvents, chemical, chemicalManual, chemicalLinks, requests`.
- Firebase 프로젝트 id `fabric-rnd-20a6b`.
- 이 PC: Python 3.11.9, `openpyxl` 3.1.5, `pywin32` 311 설치됨. `google-cloud-firestore` 미설치(설치는 사람이 한다). Outlook COM 사용 가능.
- 웹 SETTING의 JSON 백업 형식은 `{ app: "fabric-rnd", version: 1, exportedAt, data: { [key]: value } }`(`src/data/backup-export.ts`)다. 같은 형식을 쓴다.
- 저장소는 공개다. 키 파일, 실제 설정, 결과물, 메일 주소는 저장소 밖에 둔다.

## 만들 파일 (전부 신규)
| 파일 | 내용 |
|---|---|
| `tools/backup/weekly_backup.py` | 본체. 아래 "동작" |
| `tools/backup/requirements.txt` | `google-cloud-firestore>=2.16`, `openpyxl>=3.1`, `pywin32>=306` |
| `tools/backup/config.example.json` | 아래 "설정" 예시. 실제 주소 대신 `admin@example.com` |
| `tools/backup/register_task.ps1` | 작업 스케줄러 등록. 아래 "등록" |
| `tools/backup/README.md` | 설치, 서비스 계정 발급, 수동 실행, 등록, 문제 해결 |
| `CLAUDE.md` | "## TREND REPORT" 절 뒤에 "## 주간 백업 (`tools/backup`)" 절 3줄: PC 작업 스케줄러가 매주 Firestore `state`를 읽기 전용 서비스 계정으로 읽어 저장소 밖 폴더에 JSON·엑셀·zip을 남기고 Outlook으로 메일을 보낸다. `KEYS`는 `src/data/cache.ts`의 `CACHE_KEYS`와 같이 고친다. 운영 상세는 `tools/backup/README.md`. |

## 설정 (`%USERPROFILE%\fabric-backup\config.json`, 저장소 밖)
```json
{
  "project_id": "fabric-rnd-20a6b",
  "key_path": "C:\\Users\\<사용자>\\fabric-backup\\service-account.json",
  "output_dir": "C:\\Users\\<사용자>\\OneDrive\\FabricRnD_백업",
  "mail_to": "admin@example.com",
  "keep_weeks": 12,
  "attach_limit_mb": 20
}
```
- 인자 `--config PATH`, 기본값 `Path.home() / "fabric-backup" / "config.json"`.
- 인자 `--no-mail`이면 메일을 보내지 않는다(수동 시험용).

## 동작 (`weekly_backup.py`)
1. 설정을 읽는다. `google.oauth2.service_account.Credentials.from_service_account_file(key_path)`로 `firestore.Client(project=project_id, credentials=creds)`를 만든다.
2. 모듈 상단 `KEYS` 튜플에 위 19개 키를 적는다. 주석: "src/data/cache.ts CACHE_KEYS와 같게 유지". `LABELS` dict로 화면 이름을 붙인다: `records` DD MASTER, `fabricOverrides` 창고 상태, `fabricEvents` 창고 이력, `completed` 샘플대장, `ts` TROUBLE SHOOTING, `requests` FABRIC REQUEST. 나머지는 키 이름 그대로.
3. 키마다 메타를 읽는다. 메타가 없으면 값 `None`, 상태 "없음"으로 적고 계속한다. 있으면 `n`개 조각 참조를 `client.get_all(refs)`로 한 번에 읽어 id 순서대로 `c`를 잇고 `json.loads` 한다. **조각이 하나라도 없거나 JSON 파싱이 실패하면 예외를 던진다.** 반쪽 백업을 성공으로 남기지 않는다.
4. 날짜 `stamp = YYYYMMDD`(로컬 시각). 폴더 `output_dir / f"FabricRnD_주간백업_{stamp}"`를 만든다. 같은 날 다시 돌면 덮어쓴다.
5. `backup.json`: `{"app": "fabric-rnd", "version": 1, "exportedAt": UTC ISO, "source": "weekly-backup", "data": {...}}`, `ensure_ascii=False`, `indent=2`, UTF-8.
6. `summary.json`: 키별 `{count, updatedAt, updatedBy, status}`. count는 list면 길이, dict면 키 수, None이면 0, 그 밖은 1.
7. 엑셀 `FabricRnD_주간백업_{stamp}.xlsx`(openpyxl). 시트 순서는 `안내`, `DD`(records), `창고상태`(fabricOverrides), `창고이력`(fabricEvents), `샘플대장`(completed), `TS`(ts), `REQUEST`(requests)다. 값이 list가 아니면 그 시트는 헤더 없이 비워 둔다.
   - 행 펴기 규칙은 `src/data/backup-export.ts`의 `flattenRow`와 같다. 중첩 dict는 점 표기 키로 편다. list는 `json.dumps(ensure_ascii=False)` 한 칸이다. None은 빈 칸이다. 32,000자를 넘으면 앞 32,000자 + `…(생략)`이다.
   - **openpyxl은 제어 문자가 있으면 `IllegalCharacterError`로 죽는다.** 문자열은 `openpyxl.cell.cell.ILLEGAL_CHARACTERS_RE.sub("", s)`를 거친다.
   - 헤더는 모든 행 키의 합집합이고 처음 나온 순서를 따른다. 헤더 행은 굵게, 틀 고정 `A2`, 열 너비 `min(48, max(12, len(header)+2))`.
   - `안내` 시트: 내보낸 시각, "사람이 읽는 백업입니다. 복원에는 backup.json을 쓰세요.", 그리고 표(키, 이름, 건수, 마지막 수정 시각, 수정자).
8. zip: `output_dir / f"FabricRnD_주간백업_{stamp}.zip"`에 폴더 내용(`backup.json`, `summary.json`, xlsx)을 `ZIP_DEFLATED`로 담는다.
9. 지난주 비교: `output_dir`에서 이번 폴더를 뺀 가장 최근 `FabricRnD_주간백업_\d{8}` 폴더의 `summary.json`을 읽어 키별 증감을 만든다. 없으면 증감은 빈 칸이다.
10. 보관 정리: 이름이 정규식 `^FabricRnD_주간백업_(\d{8})(\.zip)?$`에 **정확히 맞는 폴더와 zip만** 본다. 이름의 날짜가 오늘에서 `keep_weeks * 7`일보다 오래되면 지운다. 다른 파일은 절대 건드리지 않는다.
11. 메일 (`--no-mail`이 아니면): `win32com.client.Dispatch("Outlook.Application")`, `CreateItem(0)`.
    - 성공: 제목 `[Fabric R&D] 주간 백업 완료 YYYY-MM-DD`. HTML 본문 표는 이름, 건수, 지난주, 증감, 마지막 수정 시각이고 아래에 저장 경로를 적는다. zip이 `attach_limit_mb` 이하면 첨부하고, 넘으면 "용량 초과로 첨부하지 않았습니다"와 경로를 적는다.
    - 실패: 1~10 어디서든 예외가 나면 제목 `[Fabric R&D] 주간 백업 실패 YYYY-MM-DD`, 본문에 예외 종류와 메시지, traceback 마지막 15줄. 그리고 종료 코드 1.
    - 메일 발송 자체가 실패하면 로그에만 남기고 종료 코드 2.
12. 로그: `output_dir / "backup.log"`에 한 줄씩 덧붙인다(시각, 성공/실패, 키별 건수 또는 오류 메시지). **데이터 내용은 로그와 표준 출력에 찍지 않는다.**
13. 표준 출력은 마지막 한 줄 요약만 찍는다.

## 등록 (`register_task.ps1`)
- 매개변수 `-Python`(기본 `(Get-Command python).Source`), `-Time`(기본 `08:30`), `-Config`(기본 `$env:USERPROFILE\fabric-backup\config.json`).
- `Register-ScheduledTask -TaskName "FabricRnD 주간 백업"`. 트리거 `New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday -At $Time`. 동작은 `$Python`에 인자 `"<저장소>\tools\backup\weekly_backup.py" --config "<Config>"`. 설정은 `New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 30)`. 사용자 로그온 상태에서만 실행한다(`-LogonType Interactive`). Outlook이 사용자 세션에서만 돌기 때문이다. 이미 있으면 `-Force`로 덮는다.
- 저장소 경로는 `$PSScriptRoot` 기준으로 만든다.

## README 필수 내용
1. 설치: `python -m pip install -r tools/backup/requirements.txt`
2. 읽기 전용 서비스 계정 발급(Google Cloud 콘솔, 프로젝트 `fabric-rnd-20a6b`): IAM 및 관리자 > 서비스 계정 > 만들기(`weekly-backup-reader`) > 역할 **Cloud Datastore 뷰어**(`roles/datastore.viewer`) > 키 > JSON 키 추가 > `%USERPROFILE%\fabric-backup\service-account.json`에 저장. **Firebase 콘솔의 "새 비공개 키 생성"은 관리자 권한 키라 쓰지 않는다.** 키 파일을 저장소, OneDrive, 메일에 두지 않는다.
3. `config.example.json`을 `%USERPROFILE%\fabric-backup\config.json`으로 복사해 고친다.
4. 시험: `python tools/backup/weekly_backup.py --no-mail`, 그다음 메일 포함 한 번.
5. 등록: `powershell -ExecutionPolicy Bypass -File tools/backup/register_task.ps1`. 확인: `Get-ScheduledTask -TaskName "FabricRnD 주간 백업"`, 즉시 실행: `Start-ScheduledTask -TaskName "FabricRnD 주간 백업"`.
6. 문제 해결: 권한 오류(403)면 역할 확인. Outlook 오류면 Outlook을 한 번 실행해 둔다. `backup.log` 위치.
7. 키 목록은 `src/data/cache.ts` `CACHE_KEYS`와 같게 유지한다.

## 하지 말 것
- `pip install`, 스크립트 실행, 작업 스케줄러 등록을 하지 마라. 자격증명이 없고 사람이 한다.
- `%USERPROFILE%` 아래에 파일을 만들지 마라.
- 실제 메일 주소, 사용자 이름이 들어간 경로, 실데이터를 저장소 파일에 넣지 마라.
- Firestore에 쓰는 코드(set, update, delete, batch)를 넣지 마라. 읽기 전용이다.
- `src/` 아래를 고치지 마라.

## 검증
- `python -m py_compile tools/backup/weekly_backup.py` 성공.
- `git status --short`에 `tools/backup/` 5개 파일, `CLAUDE.md`, 이 문서만 보인다.
