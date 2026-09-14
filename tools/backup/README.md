# Fabric R&D 주간 백업

Windows 작업 스케줄러에서 Firestore `state`를 읽어 JSON, 엑셀, zip으로 보관하고 Outlook으로 결과를 알립니다. 키 목록은 `src/data/cache.ts`의 `CACHE_KEYS`와 같게 유지해야 합니다.

## 1. 설치

```powershell
python -m pip install -r tools/backup/requirements.txt
```

필요한 외부 패키지는 `openpyxl`과 `pywin32`뿐입니다.

## 2. 로그인 저장

- 백업은 앱에 로그인하는 계정(승인 사용자 또는 소유자)으로 Firestore를 읽습니다.
- `python tools/backup/weekly_backup.py --save-login`을 실행해 앱 비밀번호를 한 번 입력합니다.
- 비밀번호는 Windows 자격 증명 관리자(`FabricRnD-weekly-backup`)에만 저장되고 파일에는 남지 않습니다.
- 앱 비밀번호를 바꾸면 위 명령을 다시 실행합니다.

서비스 계정을 쓰지 않는 이유: 조직 정책 `iam.disableServiceAccountKeyCreation`이 키 발급을 막습니다.

## 3. 설정

`tools/backup/config.example.json`을 `%USERPROFILE%\fabric-backup\config.json`으로 복사한 뒤 사용자 PC 환경과 수신 주소에 맞게 고칩니다. 설정과 백업 결과물은 저장소 밖에 둡니다.

## 4. 수동 시험

먼저 메일 없이 시험합니다.

```powershell
python tools/backup/weekly_backup.py --no-mail
```

성공하면 메일을 포함해 한 번 실행합니다.

```powershell
python tools/backup/weekly_backup.py
```

다른 설정 파일은 `--config PATH`로 지정할 수 있습니다.

## 5. 작업 스케줄러 등록

기본값은 매주 월요일 08:30이며, 현재 사용자가 로그온한 상태에서만 실행됩니다. Outlook COM을 사용하므로 사용자 세션이 필요합니다.

```powershell
powershell -ExecutionPolicy Bypass -File tools/backup/register_task.ps1
Get-ScheduledTask -TaskName "FabricRnD 주간 백업"
Start-ScheduledTask -TaskName "FabricRnD 주간 백업"
```

시간이나 Python, 설정 파일 위치는 각각 `-Time`, `-Python`, `-Config`로 바꿀 수 있습니다. 다시 등록하면 기존 작업을 덮어씁니다.

## 6. 문제 해결

- `로그인 실패: INVALID_LOGIN_CREDENTIALS`가 나오면 `--save-login`을 다시 실행합니다.
- Firestore 403 오류가 나면 앱에서 해당 계정의 승인 상태를 확인합니다.
- Outlook 오류가 나면 Outlook을 한 번 직접 실행한 뒤 다시 시도합니다.
- 실행 결과는 설정의 `output_dir` 아래 `backup.log`에서 확인합니다. 로그에는 데이터 내용이 기록되지 않습니다.
