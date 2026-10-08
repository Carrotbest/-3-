# 자료 라이브러리 로컬 색인

로컬에 동기화된 자료 폴더에서 파일 메타데이터만 모아 JSON 색인과 점검 리포트를 만듭니다. Firestore와 네트워크는 사용하지 않습니다.

## 1. 설치

Python 표준 라이브러리만 사용하므로 별도 패키지를 설치하지 않습니다.

## 2. 설정

`tools/references/config.example.json`을 `%USERPROFILE%\fabric-references\config.json`으로 복사한 뒤 로컬 환경에 맞게 고칩니다. 설정 파일과 출력 결과는 반드시 저장소 밖에 둡니다.

`category_map`에는 자료 폴더의 최상위 폴더 이름과 다음 카테고리 ID를 연결합니다: `fundamentals`, `process`, `quality`, `materials`, `market`, `testing`. 연결하지 않은 최상위 폴더는 `default_category`로 분류되고 리포트에 미매핑으로 표시됩니다.

`owner_names`는 선택 항목입니다. 명단을 넣으면 파일명 끝의 `(이름)`, `-이름`, `_이름` 중 명단에 있는 값만 담당자로 추출하고, 명단 밖 후보는 리포트에 표시합니다. 항목을 생략하거나 빈 배열로 두면 기존 방식대로 파일명 끝의 괄호와 하이픈에 있는 한글 2~4자만 추출하며 언더스코어 형식은 사용하지 않습니다. 담당자 실명은 공개 저장소에 넣지 말고 저장소 밖의 실제 설정 파일에만 기록합니다.

## 3. 실행

기본 설정 파일을 사용할 때:

```powershell
python tools/references/index_references.py
```

다른 설정 파일을 사용할 때:

```powershell
python tools/references/index_references.py --config <설정 파일 경로>
```

## 4. 결과물 위치

설정의 `output_dir`에 다음 두 파일을 만듭니다.

- `references-index.json`: 자료별 메타데이터 색인
- `references-report.txt`: 분류, 추출, 온디맨드 상태, 오류와 ID 충돌 점검 결과

같은 리포트를 실행 화면에도 출력합니다.

## 5. 주의사항

- 설정 파일과 결과물은 공개 저장소 밖에 둡니다.
- 이번 단계는 파일명, 경로, 크기, 수정일 등의 메타데이터만 수집하며 파일 내용을 읽지 않습니다.
- 색인 결과에는 동기화 루트 기준 상대 경로만 저장하고 로컬 절대 경로는 저장하지 않습니다.
- 온디맨드 파일이 많으면 다음 단계인 요약 추출 전에 OneDrive에서 해당 폴더를 **항상 이 장치에 유지**로 바꿔야 합니다.
- `skip_dirs`는 다음 단계의 썸네일·요약 제외 설정을 위한 예약 항목이며, 이번 메타데이터 색인에서는 폴더를 제외하지 않습니다.

## 6. Firestore 업로드

색인 결과를 먼저 점검합니다. 이 명령은 네트워크를 사용하지 않습니다.

```powershell
python -I tools/references/upload_references.py
```

점검을 통과한 색인을 실제로 올리려면 다음 명령을 실행합니다.

```powershell
python -I tools/references/upload_references.py --upload
```

다른 설정 파일은 두 명령 모두 `--config <설정 파일 경로>`로 지정합니다. 업로드는 `owner_email`을 사용하며 비밀번호는 실행할 때마다 화면에서 입력합니다. 비밀번호와 로그인 토큰은 파일에 저장하지 않습니다.

재색인 때는 제목, 형식, 크기, 문서일, 수정일, 담당자, 링크만 갱신합니다. 사람이 고친 카테고리, 태그, 요약과 검토 상태는 덮지 않습니다. 색인에서 사라진 기존 Firestore 문서는 삭제하지 않고 ID와 건수만 보고합니다.
