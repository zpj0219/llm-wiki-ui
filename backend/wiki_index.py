"""Wiki 索引：wikilink 解析、反向链接、搜索、关系图"""

from __future__ import annotations

import re
import time
from typing import Any

from mock_data import get_all_pages

WIKILINK_RE = re.compile(r"\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]")

_cached: dict[str, Any] | None = None
_CACHE_TTL = 30


def _title_from_path(rel_path: str) -> str:
    base = rel_path.split("/")[-1]
    return re.sub(r"\.md$", "", base, flags=re.IGNORECASE)


def _parse_frontmatter_title(content: str) -> str | None:
    if not content.startswith("---"):
        return None
    end = content.find("\n---", 3)
    if end == -1:
        return None
    fm = content[3:end]
    m = re.search(r"^title:\s*(.+)$", fm, re.MULTILINE)
    if not m:
        return None
    return m.group(1).strip().strip("\"'")


def _parse_wikilinks(content: str) -> list[str]:
    return [m.group(1).strip().replace("\\", "/") for m in WIKILINK_RE.finditer(content)]


def _wiki_node_group(rel_path: str) -> str:
    p = rel_path.replace("\\", "/")
    if p.startswith("wiki/entities/"):
        return "entities"
    if p.startswith("wiki/topics/"):
        return "topics"
    if p.startswith("wiki/sources/"):
        return "sources"
    return "flat"


def _is_wiki_md(rel_path: str) -> bool:
    p = rel_path.replace("\\", "/")
    return p.startswith("wiki/") and p.endswith(".md")


def _resolve_link(
    target: str, by_title: dict[str, str], all_paths: list[str]
) -> str | None:
    t = target.strip().replace("\\", "/")
    if not t:
        return None
    if t.endswith(".md"):
        if t in by_title.values():
            return t
        norm = t if "/" in t else f"wiki/{t}"
        if norm in all_paths:
            return norm
        return None
    key = t.lower()
    if key in by_title:
        return by_title[key]
    if t in by_title:
        return by_title[t]
    wiki_key = f"wiki/{key}.md"
    if wiki_key in by_title:
        return by_title[wiki_key]
    for rel in all_paths:
        if _title_from_path(rel) == t:
            return rel
        if _title_from_path(rel).lower() == key:
            return rel
    return None


def build_index(force: bool = False) -> dict[str, Any]:
    global _cached
    if (
        _cached
        and not force
        and time.time() - _cached["builtAt"] < _CACHE_TTL
    ):
        return _cached

    pages_data = get_all_pages()
    md_paths = [p for p in pages_data if _is_wiki_md(p)]
    by_title: dict[str, str] = {}

    for rel in md_paths:
        title = _title_from_path(rel)
        by_title[title] = rel
        by_title[title.lower()] = rel
        by_title[rel.lower()] = rel

    for rel in md_paths:
        content = pages_data.get(rel, "")
        fm_title = _parse_frontmatter_title(content)
        if fm_title:
            by_title[fm_title] = rel
            by_title[fm_title.lower()] = rel

    pages: list[dict[str, Any]] = []
    backlinks: dict[str, list[str]] = {}

    for rel in md_paths:
        content = pages_data.get(rel, "")
        outbound: list[str] = []
        for link in _parse_wikilinks(content):
            resolved = _resolve_link(link, by_title, md_paths)
            if resolved:
                outbound.append(resolved)
        outbound = list(dict.fromkeys(outbound))
        pages.append(
            {
                "relPath": rel,
                "title": _parse_frontmatter_title(content) or _title_from_path(rel),
                "content": content,
                "outbound": outbound,
            }
        )

    for p in pages:
        for target in p["outbound"]:
            if target not in backlinks:
                backlinks[target] = []
            if p["relPath"] not in backlinks[target]:
                backlinks[target].append(p["relPath"])

    _cached = {
        "builtAt": time.time(),
        "pages": pages,
        "backlinks": backlinks,
        "byTitle": by_title,
    }
    return _cached


def invalidate_index() -> None:
    global _cached
    _cached = None


def search_pages(query: str, limit: int = 20) -> list[dict[str, Any]]:
    q = query.strip().lower()
    if not q:
        return []
    index = build_index()
    results: list[dict[str, Any]] = []
    for p in index["pages"]:
        title_lower = p["title"].lower()
        body_lower = p["content"].lower()
        score = 0
        if q in title_lower:
            score += 10
        if q in body_lower:
            score += 3
        if q in p["relPath"].lower():
            score += 2
        if score == 0:
            continue
        idx = body_lower.find(q)
        snippet = (
            p["content"][max(0, idx - 40) : idx + len(q) + 80].replace("\n", " ")
            if idx >= 0
            else p["title"]
        )
        results.append(
            {
                "relPath": p["relPath"],
                "title": p["title"],
                "snippet": snippet,
                "score": score,
            }
        )
    results.sort(key=lambda x: x["score"], reverse=True)
    return results[:limit]


def get_backlinks(rel_path: str) -> list[str]:
    index = build_index()
    return index["backlinks"].get(rel_path, [])


def build_graph() -> dict[str, Any]:
    index = build_index()
    degree: dict[str, int] = {p["relPath"]: 0 for p in index["pages"]}
    edges: list[dict[str, str]] = []
    path_set = {p["relPath"] for p in index["pages"]}

    for p in index["pages"]:
        for target in p["outbound"]:
            if target in path_set:
                edges.append({"source": p["relPath"], "target": target})
                degree[p["relPath"]] = degree.get(p["relPath"], 0) + 1
                degree[target] = degree.get(target, 0) + 1

    nodes = [
        {
            "id": p["relPath"],
            "label": p["title"],
            "relPath": p["relPath"],
            "group": _wiki_node_group(p["relPath"]),
            "degree": degree.get(p["relPath"], 0),
        }
        for p in index["pages"]
    ]
    return {"nodes": nodes, "edges": edges}
