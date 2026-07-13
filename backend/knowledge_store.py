"""知识库文件系统读写 — 挂载 llm-wiki knowledge-base"""

from __future__ import annotations

import os
import hashlib
import sqlite3
import time
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
        "wiki/synthesis/sessions",
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
        "wiki/synthesis", "wiki/synthesis/sessions",
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
        # 清理 manifest 中该目录下的所有记录
        db = _manifest_db()
        db.execute(
            "DELETE FROM uploads WHERE rel_path = ? OR rel_path LIKE ?",
            (rel, rel + "/%"),
        )
        db.commit()
    else:
        path.unlink()
        _manifest_remove(rel)


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
            entry: dict[str, Any] = {"relPath": rel, "isDirectory": False}
            try:
                st = (root / rel).stat()
                entry["size"] = st.st_size
                entry["modifiedAt"] = st.st_mtime
            except OSError:
                pass
            entries.append(entry)

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
    # 利用上传清单的 MD5 来判断原始文件是否已有全文
    ORIGINALS_PFX = "raw/originals/"
    FULLTEXT_PFX = "raw/fulltext/"
    fulltext_stems: set[str] = set()           # 全路径 stem
    fulltext_name_stems: set[str] = set()      # 仅文件名 stem（兜底跨目录匹配）
    for p in fulltext_md:
        rel = p[len(FULLTEXT_PFX):]
        stem, _ = os.path.splitext(rel)
        fulltext_stems.add(stem)
        fulltext_name_stems.add(os.path.basename(stem))

    # 加载 manifest 中所有 originals 的 {relPath: md5}
    manifest_md5s = _manifest_all_originals()
    # 标记每个 md5 是否有至少一个文件已生成全文
    md5_has_fulltext: dict[str, bool] = {}
    for p in originals:
        rel = p[len(ORIGINALS_PFX):]
        stem, _ = os.path.splitext(rel)
        md5 = manifest_md5s.get(p, "")
        if not md5:
            # manifest 中没有该文件（外部直接放入）→ 现场补录
            try:
                fpath = resolve_rel(".") / p
                h = hashlib.md5(fpath.read_bytes()).hexdigest()
                md5 = h
                _manifest_set_md5(p, h, fpath.stat().st_size, int(fpath.stat().st_mtime))
                manifest_md5s[p] = h
            except (OSError, IOError):
                md5 = ""
        if not md5:
            continue
        if stem in fulltext_stems or os.path.basename(stem) in fulltext_name_stems:
            md5_has_fulltext[md5] = True

    # 统计 pending：三层匹配
    # ① 全路径 stem 精确匹配 ② MD5 内容去重 ③ 仅文件名匹配（跨目录）
    pending = 0
    pending_paths: list[str] = []
    for p in originals:
        rel = p[len(ORIGINALS_PFX):]
        stem, _ = os.path.splitext(rel)
        # ① 全路径匹配
        if stem in fulltext_stems:
            continue
        # ② MD5 去重
        md5 = manifest_md5s.get(p, "")
        if md5 and md5_has_fulltext.get(md5):
            continue
        # ③ 仅文件名匹配（同一文件上传到不同子目录的情况）
        name_stem = os.path.basename(stem)
        if name_stem in fulltext_name_stems:
            continue
        pending += 1
        pending_paths.append(p)

    # 检测重复文件：MD5 相同但路径不同的文件组（排除空 MD5）
    db = _manifest_db()
    dup_rows = db.execute(
        "SELECT md5, GROUP_CONCAT(rel_path, '\n') FROM uploads"
        " WHERE rel_path LIKE 'raw/originals/%' AND md5 != ''"
        " GROUP BY md5 HAVING COUNT(*) > 1"
    ).fetchall()
    duplicate_groups: list[dict[str, Any]] = []
    for md5, paths_str in dup_rows:
        paths = [p for p in paths_str.split("\n") if p]
        duplicate_groups.append({"md5": md5, "paths": paths})

    return {
        "rawFiles": len(originals),
        "wikiFlatMd": len(wiki_flat),
        "sources": len(sources),
        "entities": len(entities),
        "topics": len(topics),
        "fulltextMd": len(fulltext_md),
        "originalsPending": pending,
        "originalsPendingPaths": pending_paths,
        "duplicateGroups": duplicate_groups,
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


# ── 上传清单 SQLite（MD5 去重） ────────────────────────────────────────

_DB_INITED = False


def _manifest_db() -> sqlite3.Connection:
    """每次调用新建连接，避免线程安全问题。"""
    global _DB_INITED
    db_path = resolve_rel(".upload_manifest.db")
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(db_path))
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=2000")
    if not _DB_INITED:
        conn.execute(
            "CREATE TABLE IF NOT EXISTS uploads ("
            "  rel_path TEXT PRIMARY KEY,"
            "  md5 TEXT NOT NULL CHECK(md5 != ''),"
            "  size INTEGER NOT NULL DEFAULT 0,"
            "  uploaded_at INTEGER NOT NULL DEFAULT 0"
            ")"
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_uploads_md5 ON uploads(md5)"
        )
        conn.execute("DELETE FROM uploads WHERE md5 = ''")
        conn.commit()
        _DB_INITED = True
    return conn


def _manifest_migrate_from_json() -> int:
    """将旧的 .upload_manifest.json 迁移到 SQLite。返回迁移条目数。"""
    json_path = resolve_rel(".upload_manifest.json")
    if not json_path.exists():
        return 0
    try:
        import json
        old = json.loads(json_path.read_text(encoding="utf-8"))
    except Exception:
        return 0
    if not isinstance(old, dict) or not old:
        return 0
    db = _manifest_db()
    count = 0
    for rel_path, entry in old.items():
        try:
            db.execute(
                "INSERT OR IGNORE INTO uploads(rel_path, md5, size, uploaded_at) VALUES(?,?,?,?)",
                (rel_path, entry.get("md5", ""), entry.get("size", 0), entry.get("uploadedAt", 0)),
            )
            count += 1
        except sqlite3.Error:
            pass
    db.commit()
    # 迁移后重命名旧文件备份
    json_path.rename(json_path.with_suffix(".json.bak"))
    return count


def _manifest_add(rel_path: str, data: bytes) -> str:
    """记录一次上传，返回 md5。"""
    db = _manifest_db()
    _manifest_migrate_from_json()
    h = hashlib.md5(data).hexdigest()
    db.execute(
        "INSERT OR REPLACE INTO uploads(rel_path, md5, size, uploaded_at) VALUES(?,?,?,?)",
        (rel_path, h, len(data), int(time.time())),
    )
    db.commit()
    return h


def _manifest_remove(rel_path: str) -> None:
    db = _manifest_db()
    _manifest_migrate_from_json()
    db.execute("DELETE FROM uploads WHERE rel_path = ?", (rel_path,))
    db.commit()


def _manifest_has_md5(md5: str) -> str | None:
    """检查 md5 是否已在清单中。返回已有文件的 relPath，或 None。"""
    db = _manifest_db()
    _manifest_migrate_from_json()
    row = db.execute(
        "SELECT rel_path FROM uploads WHERE md5 = ? LIMIT 1", (md5,)
    ).fetchone()
    return row[0] if row else None


def _manifest_get_md5(rel_path: str) -> str:
    """获取指定路径文件的 md5，不存在则返回空字符串。"""
    db = _manifest_db()
    row = db.execute(
        "SELECT md5 FROM uploads WHERE rel_path = ?", (rel_path,)
    ).fetchone()
    return row[0] if row else ""


def _manifest_set_md5(rel_path: str, md5: str, size: int, uploaded_at: int) -> None:
    """补录一条记录（用于外部文件 fallback）。"""
    db = _manifest_db()
    db.execute(
        "INSERT OR IGNORE INTO uploads(rel_path, md5, size, uploaded_at) VALUES(?,?,?,?)",
        (rel_path, md5, size, uploaded_at),
    )
    db.commit()


def _manifest_all_originals() -> dict[str, str]:
    """返回 {relPath: md5}（仅限在 originals 下的记录）。"""
    db = _manifest_db()
    _manifest_migrate_from_json()
    rows = db.execute(
        "SELECT rel_path, md5 FROM uploads WHERE rel_path LIKE 'raw/originals/%'"
    ).fetchall()
    return {row[0]: row[1] for row in rows}


def _migrate_manifest() -> int:
    """扫描 raw/originals/ 下已有文件，补录到 manifest 中。返回新增数量。"""
    db = _manifest_db()
    _manifest_migrate_from_json()
    existing = set(
        row[0] for row in db.execute(
            "SELECT rel_path FROM uploads WHERE rel_path LIKE 'raw/originals/%'"
        ).fetchall()
    )
    added = 0
    base = resolve_rel(".")
    for p in _iter_files():
        if not p.startswith("raw/originals/") or p.endswith("/"):
            continue
        if p in existing:
            continue
        try:
            fpath = base / p
            content = fpath.read_bytes()
            h = hashlib.md5(content).hexdigest()
            db.execute(
                "INSERT OR IGNORE INTO uploads(rel_path, md5, size, uploaded_at) VALUES(?,?,?,?)",
                (p, h, len(content), int(fpath.stat().st_mtime)),
            )
            added += 1
        except (OSError, IOError):
            pass
    if added > 0:
        db.commit()
    return added


class DuplicateFileError(ValueError):
    """文件内容重复异常"""
    def __init__(self, md5: str, existing_path: str):
        self.md5 = md5
        self.existing_path = existing_path
        super().__init__(f"文件内容重复，已存在于 {existing_path}")


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

    # MD5 去重：检查是否已有相同内容的文件
    md5 = hashlib.md5(data).hexdigest()
    existing = _manifest_has_md5(md5)
    if existing:
        raise DuplicateFileError(md5, existing)

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
    _manifest_add(rel, data)
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
