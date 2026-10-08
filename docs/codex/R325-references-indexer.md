# R325 자료 라이브러리 로컬 색인 스크립트 (dry-run)

상태: **미착수.**

## 목적

Teams(SharePoint) 자료 폴더를 로컬 동기화본에서 훑어 **메타데이터만** 뽑아 JSON으로 떨어뜨린다. 이번 단계는 **dry-run**이다. Firestore에 쓰지 않는다. 파일 내용도 읽지 않는다.

먼저 돌려 보고 ID 충돌, 미동기화 파일, 긴 경로, 분류 결과를 눈으로 확인한 뒤에 저장 구조를 확정한다. 요약 추출은 다음 단계다.

## 공개 저장소 제약 (제일 중요)

이 저장소는 공개다(`Carrotbest/-3-`).

- **사내 폴더 경로, 폴더 이름, 파일 이름을 코드나 예시나 README에 쓰지 마라.** 전부 설정 파일로 뺀다.
- 설정 파일 실물과 색인 결과 JSON은 **저장소 밖**에 둔다. `tools/backup`과 같은 방식이다.
- 저장소에는 `config.example.json`만 넣고 값은 전부 `<...>` 자리표시자로 둔다.

## 하지 말 것과 그 이유

- **파일을 열지 마라.** 이번 단계는 메타데이터만이다. OneDrive 온디맨드 파일을 열면 **1.9GB 전체가 내려받아진다.** 크기와 수정일은 `os.stat`으로 충분하다.
- **Firestore나 네트워크를 쓰지 마라.** 인증도 없다. 순수 로컬 스크립트다.
- **결과 JSON을 `public/data` 아래에 쓰지 마라.** 거기 두면 빌드에 섞여 공개 배포된다. TREND가 그 경로를 쓰지만 그건 공개 RSS 자료라 사정이 다르다.
- **절대 경로를 JSON에 저장하지 마라.** 동기화 루트 기준 상대 경로만 넣는다. 사용자 홈 경로가 결과물에 남으면 안 된다.
- **심볼릭 링크와 junction을 따라가지 마라.** `os.walk(followlinks=False)`가 기본이다. 바꾸지 마라.
- **기존 `tools/trend`와 `tools/backup`을 건드리지 마라.**
- **저장소의 다른 소스를 건드리지 마라.** 이 작업은 `tools/references/` 안에서만 끝난다.
- **워킹트리에 R321 미커밋 작업이 있다. 건드리지 마라.** `src/routes/TechnicalReferences.tsx`, `src/data/reference-schema.ts`, `src/data/reference-demo.ts`, `src/App.tsx`, 삭제된 `src/routes/Study.tsx`다.

## 파일별 조치

| 파일 | 조치 |
|---|---|
| `tools/references/index_references.py` | 신규 |
| `tools/references/config.example.json` | 신규 |
| `tools/references/README.md` | 신규 |
| `tools/references/requirements.txt` | 신규. 표준 라이브러리만 쓰면 빈 파일 대신 주석 한 줄 |

## 1. `config.example.json`

값은 전부 자리표시자다. 실제 경로와 폴더 이름을 쓰지 마라.

```json
{
  "source_dir": "C:\\Users\\<사용자>\\<동기화 루트>\\<라이브러리 폴더>",
  "sharepoint_site": "https://<테넌트>.sharepoint.com/sites/<사이트>",
  "library_path": "Shared Documents/<라이브러리 경로>",
  "output_dir": "C:\\Users\\<사용자>\\fabric-references",
  "category_map": {
    "<최상위 폴더 이름 1>": "fundamentals",
    "<최상위 폴더 이름 2>": "process",
    "<최상위 폴더 이름 3>": "quality",
    "<최상위 폴더 이름 4>": "materials",
    "<최상위 폴더 이름 5>": "market"
  },
  "default_category": "fundamentals",
  "skip_dirs": ["<썸네일을 만들지 않을 대용량 폴더 이름>"]
}
```

카테고리 id 여섯은 `src/data/reference-schema.ts`의 `ReferenceCategoryId`와 같다. `fundamentals`, `process`, `quality`, `materials`, `market`, `testing`이다. **그 파일을 읽어 확인만 하고 고치지 마라.**

`category_map`에 없는 최상위 폴더는 `default_category`로 넣고 리포트에 "미매핑"으로 센다.

## 2. `index_references.py`

표준 라이브러리만 쓴다. 외부 패키지를 받지 마라.

### 실행

```
python tools/references/index_references.py --config <설정 파일 경로>
```

`--config`를 안 주면 `%USERPROFILE%\fabric-references\config.json`을 본다.

### 훑기

`os.walk(source_dir, followlinks=False)`로 전부 돈다. 건너뛸 것은 이것뿐이다.

- 이름이 `desktop.ini`이거나 `~$`로 시작하는 파일 (오피스 임시 파일)
- `.tmp`, `.lnk` 확장자

하위 폴더 깊이에 제한을 두지 마라. 자료가 2~3단계로 들어가 있다.

### 항목마다 뽑을 것

| 필드 | 방법 |
|---|---|
| `id` | 아래 "안정 식별자" 참조 |
| `title` | 확장자를 뗀 파일명. 앞의 날짜와 뒤의 `(담당자)`도 뗀다 |
| `fileName` | 원본 파일명 그대로 |
| `relativePath` | `source_dir` 기준 상대 경로. 구분자는 `/`로 통일 |
| `category` | 최상위 폴더를 `category_map`으로 바꾼 값 |
| `sourceFolder` | 최상위 폴더 이름 |
| `subFolder` | 최상위 아래 첫 하위 폴더 이름. 없으면 빈 문자열 |
| `format` | 확장자 소문자, 점 없이 |
| `sizeBytes` | `os.stat().st_size` |
| `modifiedAt` | `os.stat().st_mtime`을 ISO 8601 (`YYYY-MM-DDTHH:MM:SS`) |
| `documentDate` | 파일명에서 뽑은 날짜. 아래 참조 |
| `owner` | 파일명에서 뽑은 담당자. 아래 참조 |
| `webUrl` | `sharepoint_site` + `/` + `library_path` + `/` + 상대 경로. 각 구간을 `urllib.parse.quote`로 인코딩 |
| `syncState` | `local` 또는 `placeholder`. 아래 참조 |

### 안정 식별자

파일명이 바뀌어도 유지되는 것이 이상적이지만 로컬만으로는 불가능하다. 지금은 경로 기반으로 만들고, 나중에 SharePoint `driveItem.id`로 갈아끼운다.

```
id = "ref-" + sha256(f"{sharepoint_site}|{library_path}|{relativePath_nfc}").hexdigest()[:16]
```

`relativePath_nfc`는 `unicodedata.normalize("NFC", relative_path)`다. **한글 파일명은 자모가 분리된 NFD로 저장되는 경우가 있어 정규화하지 않으면 같은 파일이 다른 id를 받는다.** 비교와 id 생성에는 NFC를 쓰고, `fileName`과 `title`에는 원문을 그대로 넣는다.

id가 겹치면 리포트에 충돌로 적고 **둘 다 JSON에 넣는다.** 조용히 하나를 버리지 마라.

### 파일명에서 날짜와 담당자 뽑기

날짜는 파일명 맨 앞에 있다. 구분자가 섞여 있다.

```
^(\d{4})[.\-_](\d{1,2})[.\-_](\d{1,2})\s*
```

연도가 2000보다 작거나 2100보다 크면 버린다. 월이 1~12, 일이 1~31을 벗어나도 버린다. `documentDate`는 `YYYY-MM-DD`로 맞춰 넣고, 못 뽑으면 `null`이다.

담당자는 두 형태다.

```
(이름)      파일명 끝의 괄호
-이름       확장자 바로 앞의 하이픈 뒤
```

괄호 안이 사람 이름이 아닌 경우가 많으므로(`(KOTITI)`, `(생산팀)` 등) **한글 2~4자만** 담당자로 받는다. 그 밖은 `null`이다. 영문이나 숫자가 섞이면 버린다.

`title`은 날짜와 담당자를 떼고 남은 가운데 부분이다. 앞뒤 공백과 `_`를 정리한다. 떼고 나서 빈 문자열이면 확장자 뗀 원본 파일명을 쓴다.

### 온디맨드 파일 판정

OneDrive 온디맨드 파일은 크기가 보여도 내용이 로컬에 없다. 열면 내려받기가 시작된다.

```python
import stat
attrs = os.stat(path).st_file_attributes          # 윈도우 전용
RECALL_ON_OPEN = 0x00040000
RECALL_ON_DATA_ACCESS = 0x00400000
OFFLINE = 0x00001000
is_placeholder = bool(attrs & (RECALL_ON_OPEN | RECALL_ON_DATA_ACCESS | OFFLINE))
```

`st_file_attributes`가 없는 환경(비윈도우)에서는 `local`로 둔다. `AttributeError`를 잡아라.

**`FILE_ATTRIBUTE_REPARSE_POINT`만으로 판정하지 마라.** 온디맨드 파일이 reparse point라서 정상 파일까지 걸러낸다.

### 긴 경로

윈도우 기본 경로 한도는 260자다. 넘는 항목은 `os.stat`이 실패할 수 있다. 실패하면 그 항목을 **건너뛰지 말고** 리포트의 "읽기 실패"에 경로 길이와 함께 적는다. 경로 앞에 `\\?\`를 붙여 한 번 더 시도해도 된다.

### 출력

`output_dir`에 둘을 쓴다. 폴더가 없으면 만든다.

- `references-index.json` — `{"generatedAt": ISO, "sourceLabel": library_path, "items": [...]}`. UTF-8, `ensure_ascii=False`, 들여쓰기 2.
- `references-report.txt` — 아래 리포트를 그대로 적는다. 같은 내용을 화면에도 출력한다.

### dry-run 리포트

이 숫자들이 이번 단계의 산출물이다.

```
전체 파일            n건
카테고리별           fundamentals n / process n / quality n / materials n / market n / testing n
최상위 폴더별        <폴더> n건  (미매핑이면 뒤에 "미매핑" 표시)
형식별               pdf n / pptx n / xlsx n / ...
날짜 추출            n건 (n%)
담당자 추출          n건 (n%)
온디맨드(미동기화)   n건
읽기 실패            n건
경로 260자 초과      n건
ID 충돌              n쌍
```

ID 충돌과 읽기 실패가 있으면 해당 상대 경로를 최대 10개까지 같이 적는다. **파일명을 화면에 찍는 것은 괜찮다. 저장소에 쓰지만 않으면 된다.**

## 3. `README.md`

`tools/backup/README.md`의 결을 따른다. 설치, 설정, 실행, 결과물 위치, 주의사항 순이다.

주의사항에 반드시 넣을 것이다.
- 설정과 결과물은 저장소 밖에 둔다.
- 이번 단계는 메타데이터만이고 파일 내용을 읽지 않는다.
- 온디맨드 파일이 많으면 OneDrive에서 해당 폴더를 "항상 이 장치에 유지"로 바꿔야 다음 단계(요약 추출)가 된다.

## 검증

1. `python -m py_compile tools/references/index_references.py` 로 문법만 확인한다.
2. **스크립트를 실행하지 마라.** 설정 파일이 없고, 사용자 PC의 사내 폴더를 읽는 동작이다. 박향근이 직접 돌린다.
3. `npm run build`는 돌리지 마라. 이 작업은 프런트엔드를 건드리지 않는다.
4. `git status --short`로 `tools/references/` 아래 네 파일과 이 문서만 늘었는지 본다.
