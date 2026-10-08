"""Validate and optionally upload the reference index to Firestore."""

from __future__ import annotations

import argparse
import getpass
import json
import os
import re
import sys
from collections import Counter
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


API_KEY = "AIzaSyAIJ4hx0Ox809R2lfLvmRHwJbyNnlOfDC0"
PROJECT_ID = "fabric-rnd-20a6b"
AUTH_URL = f"https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key={API_KEY}"
# 쓰기의 문서 name 은 URL 이 아니라 리소스 이름이다. URL 을 넣으면 commit 이 전부 거부된다.
DOCUMENTS_PATH = f"projects/{PROJECT_ID}/databases/(default)/documents"
FIRESTORE_BASE = f"https://firestore.googleapis.com/v1/{DOCUMENTS_PATH}"
CATEGORY_IDS = (
    "fundamentals",
    "study",
    "functional",
    "sustainable",
    "external",
)
ID_RE = re.compile(r"^ref-[0-9a-f]{16}$")
INDEX_FIELDS = (
    "title",
    "category",
    "format",
    "sizeBytes",
    "documentDate",
    "modifiedAt",
    "owner",
    "webUrl",
)
UPDATE_FIELDS = (
    "title",
    "format",
    "sizeBytes",
    "documentDate",
    "modifiedAt",
    "owner",
    "webUrl",
)


class ApiError(Exception):
    def __init__(self, status: int, message: str) -> None:
        super().__init__(message)
        self.status = status
        self.message = message


def parse_args() -> argparse.Namespace:
    default_config = Path(os.environ.get("USERPROFILE", Path.home())) / "fabric-references" / "config.json"
    parser = argparse.ArgumentParser(description="자료 라이브러리 색인을 점검하고 Firestore에 올립니다.")
    parser.add_argument("--config", type=Path, default=default_config, help="설정 JSON 경로")
    parser.add_argument("--upload", action="store_true", help="점검 후 Firestore에 실제 업로드")
    return parser.parse_args()


def load_config(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        config = json.load(handle)

    if "output_dir" not in config:
        raise ValueError("설정에 필수 항목이 없습니다: output_dir")
    owner_email = config.get("owner_email")
    if owner_email is not None and (not isinstance(owner_email, str) or not owner_email.strip()):
        raise ValueError("owner_email은 비어 있지 않은 문자열이어야 합니다.")
    review_folders = config.get("review_folders", [])
    if not isinstance(review_folders, list) or not all(
        isinstance(folder, str) and folder for folder in review_folders
    ):
        raise ValueError("review_folders는 빈 문자열이 없는 문자열 배열이어야 합니다.")
    return config


def load_items(config: dict[str, Any]) -> list[dict[str, Any]]:
    output_dir = Path(os.path.expandvars(os.path.expanduser(config["output_dir"])))
    with (output_dir / "references-index.json").open("r", encoding="utf-8") as handle:
        payload = json.load(handle)
    items = payload.get("items") if isinstance(payload, dict) else None
    if not isinstance(items, list) or not all(isinstance(item, dict) for item in items):
        raise ValueError("references-index.json의 items가 객체 배열이 아닙니다.")
    # 사람이 라이브러리에서 뺀 자료는 다시 올리지 않는다. 빼지 않으면 재업로드가 신규로 되살린다.
    # 폴더 단위는 설정 exclude_folders, 파일 단위는 같은 폴더의 exclusions.json(exclude_ids)이다.
    exclude_folders = set(config.get("exclude_folders", []))
    exclude_ids: set[str] = set()
    exclusions_path = output_dir / "exclusions.json"
    if exclusions_path.exists():
        with exclusions_path.open("r", encoding="utf-8") as handle:
            exclude_ids = set(json.load(handle).get("exclude_ids", []))
    return [
        item for item in items
        if item.get("sourceFolder") not in exclude_folders and item.get("id") not in exclude_ids
    ]


def string_field(value: Any) -> dict[str, str]:
    return {"stringValue": value if isinstance(value, str) else ""}


def document_fields(item: dict[str, Any], review_folders: set[str], is_new: bool) -> dict[str, Any]:
    fields: dict[str, Any] = {}
    for key in INDEX_FIELDS:
        value = item.get(key)
        if key == "sizeBytes":
            fields[key] = {"integerValue": str(value)}
        elif key in {"documentDate", "owner"} and not value:
            continue
        else:
            fields[key] = string_field(value)
    if is_new:
        fields["tags"] = {"arrayValue": {}}
        if item.get("sourceFolder") in review_folders:
            fields["needsReview"] = {"booleanValue": True}
    return fields


def validate_items(items: list[dict[str, Any]], review_folders: set[str]) -> bool:
    ids = [item.get("id") for item in items]
    duplicate_count = sum(count - 1 for count in Counter(ids).values() if count > 1)
    invalid_ids = sum(not isinstance(item_id, str) or ID_RE.fullmatch(item_id) is None for item_id in ids)
    invalid_categories = sum(item.get("category") not in CATEGORY_IDS for item in items)
    empty_title = sum(not isinstance(item.get("title"), str) or not item["title"] for item in items)
    empty_modified = sum(
        not isinstance(item.get("modifiedAt"), str) or not item["modifiedAt"] for item in items
    )
    empty_format = sum(not isinstance(item.get("format"), str) or not item["format"] for item in items)
    invalid_size = sum(
        not isinstance(item.get("sizeBytes"), int) or isinstance(item.get("sizeBytes"), bool)
        for item in items
    )
    category_counts = Counter(item.get("category") for item in items)
    review_count = sum(item.get("sourceFolder") in review_folders for item in items)
    valid_for_size = [
        item
        for item in items
        if isinstance(item.get("sizeBytes"), int) and not isinstance(item.get("sizeBytes"), bool)
    ]
    max_document_bytes = max(
        (
            len(
                json.dumps(
                    {"fields": document_fields(item, review_folders, True)},
                    ensure_ascii=False,
                    separators=(",", ":"),
                ).encode("utf-8")
            )
            for item in valid_for_size
        ),
        default=0,
    )

    print(f"항목 수              {len(items)}건")
    print(f"ID 중복              {duplicate_count}건")
    print(f"ID 형식 오류         {invalid_ids}건")
    print(f"카테고리 오류        {invalid_categories}건")
    print(f"제목 누락            {empty_title}건")
    print(f"수정일 누락          {empty_modified}건")
    print(f"형식 누락            {empty_format}건")
    print(f"파일 크기 오류       {invalid_size}건")
    category_text = " / ".join(f"{category} {category_counts[category]}" for category in CATEGORY_IDS)
    print(f"카테고리별           {category_text}")
    print(f"needsReview 대상     {review_count}건")
    print(f"문서 최대 크기       {max_document_bytes}바이트")

    return not any(
        (
            duplicate_count,
            invalid_ids,
            invalid_categories,
            empty_title,
            empty_modified,
            empty_format,
            invalid_size,
        )
    )


def request_json(
    url: str,
    *,
    method: str = "GET",
    token: str | None = None,
    payload: dict[str, Any] | None = None,
) -> dict[str, Any]:
    data = None if payload is None else json.dumps(payload, separators=(",", ":")).encode("utf-8")
    headers = {"Accept": "application/json"}
    if data is not None:
        headers["Content-Type"] = "application/json"
    if token is not None:
        headers["Authorization"] = f"Bearer {token}"
    request = Request(url, data=data, headers=headers, method=method)
    try:
        with urlopen(request) as response:
            body = response.read()
    except HTTPError as error:
        try:
            error_payload = json.loads(error.read().decode("utf-8"))
            message = error_payload.get("error", {}).get("message") or "요청 실패"
        except (UnicodeDecodeError, json.JSONDecodeError, AttributeError):
            message = "요청 실패"
        raise ApiError(error.code, message) from None
    except URLError as error:
        raise RuntimeError(f"네트워크 요청 실패: {error.reason}") from None
    return json.loads(body.decode("utf-8")) if body else {}


def sign_in(email: str, password: str) -> str:
    response = request_json(
        AUTH_URL,
        method="POST",
        payload={"email": email, "password": password, "returnSecureToken": True},
    )
    token = response.get("idToken")
    if not isinstance(token, str) or not token:
        raise RuntimeError("로그인 응답에 idToken이 없습니다.")
    return token


def list_existing_ids(token: str) -> set[str]:
    existing_ids: set[str] = set()
    page_token: str | None = None
    while True:
        query = {"pageSize": "300", "mask.fieldPaths": "title"}
        if page_token:
            query["pageToken"] = page_token
        response = request_json(f"{FIRESTORE_BASE}/referenceItems?{urlencode(query)}", token=token)
        for document in response.get("documents", []):
            name = document.get("name", "")
            if name:
                existing_ids.add(name.rsplit("/", 1)[-1])
        page_token = response.get("nextPageToken")
        if not page_token:
            return existing_ids


def make_write(
    item: dict[str, Any], existing_ids: set[str], review_folders: set[str]
) -> dict[str, Any]:
    item_id = item["id"]
    is_new = item_id not in existing_ids
    write: dict[str, Any] = {
        "update": {
            "name": f"{DOCUMENTS_PATH}/referenceItems/{item_id}",
            "fields": document_fields(item, review_folders, is_new),
        },
        "currentDocument": {"exists": not is_new},
    }
    if not is_new:
        # 사람이 고친 분류는 재색인이 덮지 않는다. 마스크뿐 아니라 본문에서도 뺀다.
        fields = write["update"]["fields"]
        write["update"]["fields"] = {key: value for key, value in fields.items() if key in UPDATE_FIELDS}
        write["updateMask"] = {"fieldPaths": list(UPDATE_FIELDS)}
    return write


def commit_items(
    token: str,
    items: list[dict[str, Any]],
    existing_ids: set[str],
    review_folders: set[str],
) -> None:
    writes = [make_write(item, existing_ids, review_folders) for item in items]
    for start in range(0, len(writes), 500):
        request_json(
            f"{FIRESTORE_BASE}:commit",
            method="POST",
            token=token,
            payload={"writes": writes[start : start + 500]},
        )


def run_upload(config: dict[str, Any], items: list[dict[str, Any]]) -> None:
    owner_email = config.get("owner_email") or input("소유자 이메일: ").strip()
    if not owner_email:
        raise ValueError("소유자 이메일이 비어 있습니다.")
    password = getpass.getpass("비밀번호: ")
    token = sign_in(owner_email, password)
    existing_ids = list_existing_ids(token)
    index_ids = {item["id"] for item in items}
    missing_from_index = sorted(existing_ids - index_ids)
    new_count = len(index_ids - existing_ids)
    update_count = len(index_ids & existing_ids)
    print(f"신규 {new_count}건, 갱신 {update_count}건, 색인에 없는 기존 {len(missing_from_index)}건")
    if missing_from_index:
        print("색인에 없는 기존 ID: " + ", ".join(missing_from_index))
    if input("계속하려면 yes 입력: ").strip() != "yes":
        print("업로드를 취소했습니다.")
        return
    commit_items(token, items, existing_ids, set(config.get("review_folders", [])))
    final_ids = list_existing_ids(token)
    print(f"최종 문서 수          {len(final_ids)}건")


def main() -> int:
    args = parse_args()
    try:
        config = load_config(args.config)
        items = load_items(config)
        review_folders = set(config.get("review_folders", []))
        if not validate_items(items, review_folders):
            return 1
        if args.upload:
            run_upload(config, items)
        return 0
    except ApiError as error:
        print(f"HTTP {error.status}: {error.message}", file=sys.stderr)
        return 1
    except (OSError, ValueError, json.JSONDecodeError, RuntimeError) as error:
        print(str(error), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
