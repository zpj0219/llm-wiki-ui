"""知识库文件系统读写 — 挂载 hermes-data knowledge-base"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

from config import KNOWLEDGE_BASE_ROOT

ORIGINALS_PREFIX = "raw/originals"

SKIP_NAMES = {".git", ".DS_Store", "Thumbs.db"}
SKIP_SUFFIXES = {".db", ".sqlite"}


def kb_root() -> Path:
    return KNOWLEDGE_BASE_ROOT


def resolve_rel(rel_path: str) -> Path:
    rel = rel_path.replace("\\", "/").strip().lstrip("/")
    if not rel or ".." in rel.split("/"):
        raise ValueError("非法路径")
    full = (KNOWLEDGE_BASE_ROOT / rel).resolve()
    root = KNOWLEDGE_BASE_ROOT.resolve()
    if not str(full).startswith(str(root)):
        raise ValueError("路径越界")
    return full


def ensure_kb_root() -> None:
    KNOWLEDGE_BASE_ROOT.mkdir(parents=True, exist_ok=True)
    for sub in (
        "raw/inbox",
        "raw/originals/maintenance/manuals",
        "raw/originals/maintenance/procedures",
        "raw/originals/maintenance/records",
        "raw/originals/maintenance/faults",
        "raw/fulltext/maintenance",
        "wiki/entities",
        "wiki/topics",
        "wiki/sources",
    ):
        (KNOWLEDGE_BASE_ROOT / sub).mkdir(parents=True, exist_ok=True)


def _should_skip(name: str) -> bool:
    if name in SKIP_NAMES or name.startswith("."):
        return name not in {".wiki-schema.md"}
    return any(name.endswith(s) for s in SKIP_SUFFIXES)


def _iter_files() -> list[str]:
    ensure_kb_root()
    paths: list[str] = []
    root = KNOWLEDGE_BASE_ROOT
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if not _should_skip(d)]
        rel_dir = Path(dirpath).relative_to(root).as_posix()
        for fn in filenames:
            if _should_skip(fn):
                continue
            rel = f"{rel_dir}/{fn}" if rel_dir != "." else fn
            paths.append(rel.replace("\\", "/"))
    return sorted(paths)


def get_all_pages() -> dict[str, str]:
    pages: dict[str, str] = {}
    for rel in _iter_files():
        if not rel.endswith(".md"):
            continue
        try:
            pages[rel] = resolve_rel(rel).read_text(encoding="utf-8")
        except OSError:
            continue
    return pages


def get_page(rel_path: str) -> str | None:
    try:
        path = resolve_rel(rel_path)
    except ValueError:
        return None
    if not path.is_file():
        return None
    try:
        return path.read_text(encoding="utf-8")
    except OSError:
        return None


def save_page(rel_path: str, content: str) -> None:
    rel = rel_path.replace("\\", "/")
    if not rel.startswith("wiki/") or not rel.endswith(".md"):
        raise ValueError("仅允许保存 wiki/*.md 页面")
    path = resolve_rel(rel)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def delete_entry(rel_path: str) -> None:
    """删除文件或目录（需在 raw/ 或 wiki/ 下，不允许删除顶级分类目录）"""
    rel = rel_path.replace("\\", "/").strip("/")
    if not (rel.startswith("raw/") or rel.startswith("wiki/")):
        raise ValueError("仅允许删除 raw/ 或 wiki/ 下的条目")

    # 禁止删除顶级分类目录
    top_categories = {
        "raw/originals", "raw/fulltext", "raw/inbox",
        "wiki/entities", "wiki/topics", "wiki/sources",
        "raw", "wiki",
    }
    if rel in top_categories:
        raise ValueError("不允许删除系统分类目录")

    path = resolve_rel(rel)
    if not path.exists():
        raise ValueError("路径不存在")

    import shutil

    if path.is_dir():
        shutil.rmtree(path)
    else:
        path.unlink()


def list_entries() -> list[dict[str, Any]]:
    ensure_kb_root()
    entries: list[dict[str, Any]] = []
    dirs_seen: set[str] = set()
    root = KNOWLEDGE_BASE_ROOT

    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = sorted(d for d in dirnames if not _should_skip(d))
        rel_dir = Path(dirpath).relative_to(root).as_posix()
        if rel_dir != "." and rel_dir not in dirs_seen:
            dirs_seen.add(rel_dir)
            entries.append({"relPath": rel_dir, "isDirectory": True})

        for fn in sorted(filenames):
            if _should_skip(fn):
                continue
            rel = f"{rel_dir}/{fn}" if rel_dir != "." else fn
            rel = rel.replace("\\", "/")
            parts = rel.split("/")
            for i in range(len(parts) - 1):
                d = "/".join(parts[: i + 1])
                if d not in dirs_seen:
                    dirs_seen.add(d)
                    entries.append({"relPath": d, "isDirectory": True})
            entries.append({"relPath": rel, "isDirectory": False})

    entries.sort(key=lambda e: (not e["isDirectory"], e["relPath"]))
    return entries


def get_stats() -> dict[str, int]:
    all_files = _iter_files()
    originals = [
        p
        for p in all_files
        if p.startswith("raw/originals/") and not p.endswith("/")
    ]
    fulltext_md = [
        p for p in all_files if p.startswith("raw/fulltext/") and p.endswith(".md")
    ]
    wiki_flat = [
        p
        for p in all_files
        if p.startswith("wiki/") and p.count("/") == 1 and p.endswith(".md")
    ]
    sources = [p for p in all_files if p.startswith("wiki/sources/") and p.endswith(".md")]
    entities = [p for p in all_files if p.startswith("wiki/entities/") and p.endswith(".md")]
    topics = [p for p in all_files if p.startswith("wiki/topics/") and p.endswith(".md")]
    return {
        "rawFiles": len(originals),
        "wikiFlatMd": len(wiki_flat),
        "sources": len(sources),
        "entities": len(entities),
        "topics": len(topics),
        "fulltextMd": len(fulltext_md),
        "originalsPending": len(originals),
    }


def list_originals_directories() -> list[dict[str, Any]]:
    """列出 raw/originals 下所有目录（含自身）。"""
    ensure_kb_root()
    base_path = resolve_rel(ORIGINALS_PREFIX)
    base_path.mkdir(parents=True, exist_ok=True)

    dirs: list[dict[str, Any]] = []
    root = KNOWLEDGE_BASE_ROOT.resolve()

    for dirpath, dirnames, _ in os.walk(base_path):
        dirnames[:] = sorted(d for d in dirnames if not _should_skip(d))
        rel_dir = Path(dirpath).relative_to(root).as_posix()
        name = Path(dirpath).name if rel_dir != ORIGINALS_PREFIX else "originals"
        dirs.append({"relPath": rel_dir, "name": name})

    dirs.sort(key=lambda d: d["relPath"])
    return dirs


def save_original(
    filename: str,
    data: bytes,
    *,
    target_dir: str | None = None,
    to_inbox: bool = False,
) -> str:
    ensure_kb_root()
    safe_name = Path(filename).name
    if not safe_name or safe_name in {".", ".."}:
        raise ValueError("无效文件名")

    ext = Path(safe_name).suffix.lower()
    from config import ALLOWED_UPLOAD_EXTENSIONS

    if ext not in ALLOWED_UPLOAD_EXTENSIONS:
        raise ValueError(f"不支持的文件类型: {ext}")

    if to_inbox:
        rel = f"raw/inbox/{safe_name}"
    else:
        dir_rel = (target_dir or f"{ORIGINALS_PREFIX}/maintenance/manuals").replace("\\", "/").strip("/")
        if not dir_rel.startswith(ORIGINALS_PREFIX):
            raise ValueError(f"目标目录必须在 {ORIGINALS_PREFIX}/ 下")
        resolve_rel(dir_rel)
        dest_dir = resolve_rel(dir_rel)
        if not dest_dir.is_dir():
            dest_dir.mkdir(parents=True, exist_ok=True)
        rel = f"{dir_rel}/{safe_name}"

    dest = resolve_rel(rel)
    if dest.exists():
        stem, suffix = dest.stem, dest.suffix
        n = 1
        while dest.exists():
            dest = dest.with_name(f"{stem}-{n}{suffix}")
            n += 1
        rel = dest.relative_to(KNOWLEDGE_BASE_ROOT.resolve()).as_posix()

    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(data)
    return rel


def get_all_originals_status() -> dict[str, dict[str, Any]]:
    """返回 raw/originals/ 下每个文件的处理阶段状态。

    阶段判定：
    - uploaded:  文件存在于 originals/
    - fulltext:  raw/fulltext/maintenance/{cat}/{stem}.md 存在
    - wiki:      wiki/ 页面引用了该文件（source_file frontmatter 或文件名匹配）
    """
    from wiki_index import build_index  # 避免循环导入

    ensure_kb_root()
    result: dict[str, dict[str, Any]] = {}
    root = KNOWLEDGE_BASE_ROOT.resolve()

    # 收集 originals 下所有文件
    originals_path = resolve_rel(ORIGINALS_PREFIX)
    originals_files: list[Path] = []
    for dirpath, _dirnames, filenames in os.walk(originals_path):
        for fn in filenames:
            if _should_skip(fn):
                continue
            originals_files.append(Path(dirpath) / fn)

    if not originals_files:
        return result

    # 构建 wiki 索引，获取倒排索引表用于阶段三快速判定
    try:
        wiki_index = build_index()
        stem_to_pages: dict[str, set[str]] = wiki_index.get("stemToPages", {})
        wiki_pages = wiki_index.get("pages", [])
    except Exception:
        stem_to_pages = {}
        wiki_pages = []

    for fpath in originals_files:
        try:
            rel = fpath.relative_to(root).as_posix()
        except ValueError:
            continue

        status: dict[str, Any] = {
            "relPath": rel,
            "filename": fpath.name,
            "stage": "uploaded",
        }

        # 阶段二：检查 fulltext 是否存在
        # raw/originals/maintenance/{cat}/{name}.ext → raw/fulltext/maintenance/{cat}/{name}.md
        rel_norm = rel.replace("\\", "/")
        if rel_norm.startswith("raw/originals/maintenance/"):
            parts = rel_norm.split("/")
            if len(parts) >= 6:
                cat = parts[3]  # maintenance 下的子类
                stem = Path(fpath.stem).name
                fulltext_rel = f"raw/fulltext/maintenance/{cat}/{stem}.md"
                try:
                    ft_path = resolve_rel(fulltext_rel)
                    if ft_path.is_file():
                        status["stage"] = "fulltext"
                except ValueError:
                    pass

        # 阶段三：通过倒排索引查找 wiki 页面引用（O(1)）
        stem_name = fpath.stem
        orig_basename = fpath.name
        matching_pages: set[str] = set()

        # 主路径：倒排索引哈希查找
        for term in (stem_name, orig_basename, rel_norm):
            if term in stem_to_pages:
                matching_pages |= stem_to_pages[term]
                break  # 任一项命中即可

        # 回退路径：结构化索引未命中时，兜底全量子串搜索
        if not matching_pages and wiki_pages:
            for page in wiki_pages:
                content = page.get("content", "")
                if orig_basename in content or stem_name in content or rel_norm in content:
                    matching_pages.add(page["relPath"])
                    # 补充写入倒排索引，下次即可命中快速路径
                    if stem_name not in stem_to_pages:
                        stem_to_pages[stem_name] = set()
                    stem_to_pages[stem_name].add(page["relPath"])
                    break

        if matching_pages:
            status["stage"] = "wiki"
            status["wikiPage"] = next(iter(matching_pages))

        result[rel] = status

    return result
