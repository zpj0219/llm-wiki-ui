"""Wiki API 路由"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from mock_data import get_page, get_stats, list_entries, save_page
from wiki_index import (
    build_graph,
    get_backlinks,
    invalidate_index,
    search_pages,
)

router = APIRouter(prefix="/api/wiki", tags=["wiki"])


class SavePageRequest(BaseModel):
    content: str


class SearchRequest(BaseModel):
    query: str
    limit: int = 20


@router.get("/entries")
def api_list_entries():
    return {"success": True, "files": list_entries(), "root": "/data/knowledge-base"}


@router.get("/stats")
def api_stats():
    return {"success": True, "stats": get_stats()}


@router.get("/pages/{path:path}")
def api_get_page(path: str):
    rel_path = path.replace("\\", "/")
    content = get_page(rel_path)
    if content is None:
        raise HTTPException(status_code=404, detail=f"页面不存在: {rel_path}")
    return {"success": True, "relPath": rel_path, "content": content}


@router.put("/pages/{path:path}")
def api_save_page(path: str, body: SavePageRequest):
    rel_path = path.replace("\\", "/")
    if get_page(rel_path) is None:
        raise HTTPException(status_code=404, detail=f"页面不存在: {rel_path}")
    save_page(rel_path, body.content)
    invalidate_index()
    return {"success": True, "relPath": rel_path}


@router.get("/backlinks/{path:path}")
def api_backlinks(path: str):
    rel_path = path.replace("\\", "/")
    return {"success": True, "backlinks": get_backlinks(rel_path)}


@router.post("/search")
def api_search(body: SearchRequest):
    results = search_pages(body.query, body.limit)
    return {"success": True, "results": results}


@router.get("/graph")
def api_graph():
    return {"success": True, **build_graph()}


@router.post("/refresh")
def api_refresh():
    invalidate_index()
    return {"success": True, "message": "索引已刷新"}
