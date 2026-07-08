"""Wiki API 路由 — 读取 hermes-data 知识库"""

from __future__ import annotations

import mimetypes
from pathlib import Path

from fastapi import APIRouter, Body, Depends, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel

from knowledge_store import delete_entry, ensure_kb_root, get_all_originals_status, get_page, get_stats, kb_root, list_entries, resolve_rel, save_page
from routers.auth import get_current_user
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
def api_list_entries(_: dict = Depends(get_current_user)):
    return {
        "success": True,
        "files": list_entries(),
        "root": str(kb_root()),
    }


@router.get("/stats")
def api_stats(_: dict = Depends(get_current_user)):
    return {"success": True, "stats": get_stats()}


@router.get("/pages/{path:path}")
def api_get_page(path: str, _: dict = Depends(get_current_user)):
    rel_path = path.replace("\\", "/")
    content = get_page(rel_path)
    if content is None:
        raise HTTPException(status_code=404, detail=f"页面不存在: {rel_path}")
    return {"success": True, "relPath": rel_path, "content": content}


@router.put("/pages/{path:path}")
def api_save_page(path: str, body: SavePageRequest, _: dict = Depends(get_current_user)):
    rel_path = path.replace("\\", "/")
    try:
        save_page(rel_path, body.content)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    invalidate_index()
    return {"success": True, "relPath": rel_path}


@router.get("/backlinks/{path:path}")
def api_backlinks(path: str, _: dict = Depends(get_current_user)):
    rel_path = path.replace("\\", "/")
    return {"success": True, "backlinks": get_backlinks(rel_path)}


@router.post("/search")
def api_search(body: SearchRequest, _: dict = Depends(get_current_user)):
    results = search_pages(body.query, body.limit)
    return {"success": True, "results": results}


@router.get("/graph")
def api_graph(_: dict = Depends(get_current_user)):
    return {"success": True, **build_graph()}


@router.post("/refresh")
def api_refresh(_: dict = Depends(get_current_user)):
    invalidate_index()
    return {"success": True, "message": "索引已刷新"}


@router.get("/originals-status")
def api_originals_status(_: dict = Depends(get_current_user)):
    return {"success": True, "statuses": get_all_originals_status()}


@router.post("/ensure-dir")
def api_ensure_dir(dir_path: str = Body(..., embed=True), _: dict = Depends(get_current_user)):
    """创建知识库目录（用于上传空文件夹）"""
    ensure_kb_root()
    try:
        dest = resolve_rel(dir_path)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    dest.mkdir(parents=True, exist_ok=True)
    return {"success": True, "path": dir_path}


@router.delete("/pages/{path:path}")
def api_delete_entry(path: str, _: dict = Depends(get_current_user)):
    """删除文件或目录"""
    try:
        delete_entry(path)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return {"success": True, "message": f"已删除: {path}"}


@router.get("/download/{path:path}")
def api_download_file(path: str, _: dict = Depends(get_current_user)):
    """下载文件（以附件形式返回原始文件）"""
    try:
        file_path = resolve_rel(path)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    if not file_path.is_file():
        raise HTTPException(status_code=404, detail="文件不存在")

    mime_type, _ = mimetypes.guess_type(str(file_path))
    if mime_type is None:
        mime_type = "application/octet-stream"

    filename = Path(path).name
    return FileResponse(
        path=str(file_path),
        media_type=mime_type,
        filename=filename,
        content_disposition_type="attachment",
    )
