"""Build a metadata-only index of a locally synced reference library."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import unicodedata
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path
from typing import Any
from urllib.parse import quote


CATEGORY_IDS = (
    "fundamentals",
    "study",
    "functional",
    "sustainable",
    "external",
)
DATE_RES = (
    (re.compile(r"^(\d{4})[.\-_](\d{1,2})[.\-_](\d{1,2})\s*"), False),
    (re.compile(r"^(\d{4})[.\-_](\d{2})(\d{2})\s*"), False),
    (re.compile(r"^(\d{2})[.\-_](\d{1,2})[.\-_](\d{1,2})\s*"), True),
)
PAREN_OWNER_RE = re.compile(r"\s*\(([가-힣]{2,4})\)\s*$")
HYPHEN_OWNER_RE = re.compile(r"\s*-\s*([가-힣]{2,4})\s*$")
OWNER_CANDIDATE_RES = (
    re.compile(r"\s*\(([^()]+)\)\s*$"),
    re.compile(r"\s*-\s*([^-_()]+)\s*$"),
    re.compile(r"\s*_\s*([^_()]+)\s*$"),
)
KOREAN_NAME_RE = re.compile(r"[가-힣]{2,4}")
SKIP_EXTENSIONS = {".tmp", ".lnk"}
RECALL_ON_OPEN = 0x00040000
RECALL_ON_DATA_ACCESS = 0x00400000
OFFLINE = 0x00001000
PLACEHOLDER_ATTRIBUTES = RECALL_ON_OPEN | RECALL_ON_DATA_ACCESS | OFFLINE


def parse_args() -> argparse.Namespace:
    default_config = Path(os.environ.get("USERPROFILE", Path.home())) / "fabric-references" / "config.json"
    parser = argparse.ArgumentParser(description="자료 라이브러리의 파일 메타데이터를 색인합니다.")
    parser.add_argument("--config", type=Path, default=default_config, help="설정 JSON 경로")
    return parser.parse_args()


def load_config(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        config = json.load(handle)

    required = ("source_dir", "sharepoint_site", "library_path", "output_dir", "category_map", "default_category")
    missing = [key for key in required if key not in config]
    if missing:
        raise ValueError(f"설정에 필수 항목이 없습니다: {', '.join(missing)}")

    invalid_categories = {
        value
        for value in [config["default_category"], *config["category_map"].values()]
        if value not in CATEGORY_IDS
    }
    if invalid_categories:
        raise ValueError(f"지원하지 않는 카테고리입니다: {', '.join(sorted(invalid_categories))}")
    owner_names = config.get("owner_names", [])
    if not isinstance(owner_names, list) or not all(isinstance(name, str) and name for name in owner_names):
        raise ValueError("owner_names는 빈 문자열이 없는 문자열 배열이어야 합니다.")
    return config


def windows_extended_path(path: str) -> str:
    if os.name != "nt" or path.startswith("\\\\?\\"):
        return path
    absolute = os.path.abspath(path)
    if absolute.startswith("\\\\"):
        return "\\\\?\\UNC\\" + absolute[2:]
    return "\\\\?\\" + absolute


def stat_metadata(path: str) -> os.stat_result:
    try:
        return os.stat(path, follow_symlinks=False)
    except OSError as first_error:
        extended = windows_extended_path(path)
        if extended == path:
            raise first_error
        return os.stat(extended, follow_symlinks=False)


def is_placeholder(file_stat: os.stat_result) -> bool:
    try:
        attributes = file_stat.st_file_attributes
    except AttributeError:
        return False
    return bool(attributes & PLACEHOLDER_ATTRIBUTES)


def extract_name_metadata(
    file_name: str, owner_names: list[str]
) -> tuple[str, str | None, str | None, str | None]:
    stem = os.path.splitext(file_name)[0]
    title = stem
    document_date: str | None = None

    for date_re, short_year in DATE_RES:
        date_match = date_re.match(title)
        if date_match is None:
            continue
        year, month, day = (int(value) for value in date_match.groups())
        if short_year:
            year += 2000
        if 2000 <= year <= 2100 and 1 <= month <= 12 and 1 <= day <= 31:
            document_date = f"{year:04d}-{month:02d}-{day:02d}"
            title = title[date_match.end() :]
        break

    owner: str | None = None
    rejected_owner_candidate: str | None = None
    if owner_names:
        allowed_owners = set(owner_names)
        for owner_re in OWNER_CANDIDATE_RES:
            owner_match = owner_re.search(title)
            if owner_match is None:
                continue
            candidate = owner_match.group(1).strip()
            if candidate in allowed_owners:
                owner = candidate
                title = title[: owner_match.start()]
                rejected_owner_candidate = None
                break
            # 리포트에 올리는 후보는 사람 이름처럼 생긴 것만이다. 벤더 문서의 괄호 꼬리가
            # (KOR), (2024), (FINAL), (210421) 처럼 많아 거르지 않으면 수백 건이 쌓여
            # "명단을 채우라"는 신호가 묻힌다. 2026-10-08 실측에서 459건 중 걸러내지 않으면
            # 280건, 걸러내면 24건이고 그 24건도 전부 사람 이름이 아니었다.
            if rejected_owner_candidate is None and KOREAN_NAME_RE.fullmatch(candidate):
                rejected_owner_candidate = candidate
    else:
        owner_match = PAREN_OWNER_RE.search(title)
        if owner_match is None:
            owner_match = HYPHEN_OWNER_RE.search(title)
        if owner_match:
            owner = owner_match.group(1)
            title = title[: owner_match.start()]

    title = title.strip(" _")
    return title or stem, document_date, owner, rejected_owner_candidate


def encoded_web_url(site: str, library_path: str, relative_path: str) -> str:
    segments = [
        *(segment for segment in library_path.replace("\\", "/").split("/") if segment),
        *(segment for segment in relative_path.split("/") if segment),
    ]
    return site.rstrip("/") + "/" + "/".join(quote(segment, safe="") for segment in segments)


def relative_display_path(source_dir: str, path: str) -> str:
    try:
        return os.path.relpath(path, source_dir).replace("\\", "/")
    except ValueError:
        return path.replace("\\", "/")


def build_report(
    items: list[dict[str, Any]],
    folder_counts: Counter[str],
    unmapped_folders: set[str],
    failures: list[tuple[str, int, str]],
    long_path_count: int,
    ids_to_paths: dict[str, list[str]],
    rejected_owner_candidates: Counter[str] | None,
) -> str:
    total = len(items)
    category_counts = Counter(item["category"] for item in items)
    format_counts = Counter(item["format"] or "(없음)" for item in items)
    dated = sum(item["documentDate"] is not None for item in items)
    owned = sum(item["owner"] is not None for item in items)
    placeholders = sum(item["syncState"] == "placeholder" for item in items)
    collisions = {item_id: paths for item_id, paths in ids_to_paths.items() if len(paths) > 1}
    collision_pairs = sum(len(paths) * (len(paths) - 1) // 2 for paths in collisions.values())

    percent = lambda count: (count / total * 100) if total else 0.0
    category_text = " / ".join(f"{category} {category_counts[category]}" for category in CATEGORY_IDS)
    folder_text = " / ".join(
        f"{folder or '(루트)'} {count}건" + (" 미매핑" if folder in unmapped_folders else "")
        for folder, count in sorted(folder_counts.items(), key=lambda pair: pair[0].casefold())
    ) or "-"
    format_text = " / ".join(
        f"{file_format} {count}" for file_format, count in sorted(format_counts.items())
    ) or "-"

    lines = [
        f"전체 파일            {total}건",
        f"카테고리별           {category_text}",
        f"최상위 폴더별        {folder_text}",
        f"형식별               {format_text}",
        f"날짜 추출            {dated}건 ({percent(dated):.1f}%)",
        f"담당자 추출          {owned}건 ({percent(owned):.1f}%)",
        f"온디맨드(미동기화)   {placeholders}건",
        f"읽기 실패            {len(failures)}건",
        f"경로 260자 초과      {long_path_count}건",
        f"ID 충돌              {collision_pairs}쌍",
    ]

    if rejected_owner_candidates is not None:
        rejected_total = sum(rejected_owner_candidates.values())
        lines.insert(6, f"명단 밖 담당자 후보   {rejected_total}건")
        if rejected_total:
            candidate_text = " / ".join(candidate for candidate, _count in rejected_owner_candidates.most_common(10))
            lines.insert(7, f"후보값(최대 10개)    {candidate_text}")

    if collisions:
        lines.append("")
        lines.append("ID 충돌 상세 (최대 10개)")
        collision_details = [f"{item_id}: {path}" for item_id, paths in collisions.items() for path in paths]
        lines.extend(collision_details[:10])
    if failures:
        lines.append("")
        lines.append("읽기 실패 상세 (최대 10개)")
        lines.extend(f"{path} (경로 길이 {length}): {error}" for path, length, error in failures[:10])
    return "\n".join(lines)


def main() -> int:
    args = parse_args()
    config = load_config(args.config)
    source_dir = os.path.abspath(os.path.expandvars(os.path.expanduser(config["source_dir"])))
    output_dir = Path(os.path.expandvars(os.path.expanduser(config["output_dir"])))
    if not os.path.isdir(source_dir):
        raise NotADirectoryError(f"자료 폴더를 찾을 수 없습니다: {source_dir}")

    items: list[dict[str, Any]] = []
    folder_counts: Counter[str] = Counter()
    unmapped_folders: set[str] = set()
    failures: list[tuple[str, int, str]] = []
    ids_to_paths: dict[str, list[str]] = defaultdict(list)
    owner_names = config.get("owner_names", [])
    rejected_owner_candidates: Counter[str] | None = Counter() if owner_names else None
    long_path_count = 0

    def walk_error(error: OSError) -> None:
        failed_path = error.filename or "(알 수 없는 경로)"
        display_path = relative_display_path(source_dir, failed_path)
        failures.append((display_path, len(failed_path), str(error)))

    for root, _dirs, files in os.walk(source_dir, followlinks=False, onerror=walk_error):
        for file_name in files:
            extension = os.path.splitext(file_name)[1].lower()
            if file_name.lower() == "desktop.ini" or file_name.startswith("~$") or extension in SKIP_EXTENSIONS:
                continue

            full_path = os.path.join(root, file_name)
            relative_path = os.path.relpath(full_path, source_dir).replace("\\", "/")
            path_length = len(full_path)
            if path_length > 260:
                long_path_count += 1

            try:
                file_stat = stat_metadata(full_path)
            except OSError as error:
                failures.append((relative_path, path_length, str(error)))
                continue

            parts = relative_path.split("/")
            source_folder = parts[0] if len(parts) > 1 else ""
            sub_folder = parts[1] if len(parts) > 2 else ""
            category = config["category_map"].get(source_folder, config["default_category"])
            if source_folder not in config["category_map"]:
                unmapped_folders.add(source_folder)
            folder_counts[source_folder] += 1

            normalized_path = unicodedata.normalize("NFC", relative_path)
            identity = f'{config["sharepoint_site"]}|{config["library_path"]}|{normalized_path}'
            item_id = "ref-" + hashlib.sha256(identity.encode("utf-8")).hexdigest()[:16]
            title, document_date, owner, rejected_owner_candidate = extract_name_metadata(file_name, owner_names)
            if rejected_owner_candidates is not None and rejected_owner_candidate is not None:
                rejected_owner_candidates[rejected_owner_candidate] += 1
            item = {
                "id": item_id,
                "title": title,
                "fileName": file_name,
                "relativePath": relative_path,
                "category": category,
                "sourceFolder": source_folder,
                "subFolder": sub_folder,
                "format": extension.lstrip("."),
                "sizeBytes": file_stat.st_size,
                "modifiedAt": datetime.fromtimestamp(file_stat.st_mtime).isoformat(timespec="seconds"),
                "documentDate": document_date,
                "owner": owner,
                "webUrl": encoded_web_url(config["sharepoint_site"], config["library_path"], relative_path),
                "syncState": "placeholder" if is_placeholder(file_stat) else "local",
            }
            items.append(item)
            ids_to_paths[item_id].append(relative_path)

    report = build_report(
        items,
        folder_counts,
        unmapped_folders,
        failures,
        long_path_count,
        ids_to_paths,
        rejected_owner_candidates,
    )
    output_dir.mkdir(parents=True, exist_ok=True)
    index_payload = {
        "generatedAt": datetime.now().astimezone().isoformat(timespec="seconds"),
        "sourceLabel": config["library_path"],
        "items": items,
    }
    with (output_dir / "references-index.json").open("w", encoding="utf-8") as handle:
        json.dump(index_payload, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
    with (output_dir / "references-report.txt").open("w", encoding="utf-8") as handle:
        handle.write(report + "\n")
    print(report)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
