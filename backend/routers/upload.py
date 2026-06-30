"""原件上传 API — 写入 knowledge-base/raw/originals"""

from __future__ import annotations

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from knowledge_store import (
    ORIGINALS_PREFIX,
    DuplicateFileError,
    ensure_kb_root,
    kb_root,
    list_originals_directories,
    save_original,
)
from routers.auth import get_current_user

router = APIRouter(prefix="/api/upload", tags=["upload"])


@router.get("/config")
def upload_config():
    ensure_kb_root()
    return {
        "success": True,
        "inboxPath": "raw/inbox",
        "originalsBase": ORIGINALS_PREFIX,
        "defaultTargetDir": f"{ORIGINALS_PREFIX}/maintenance/manuals",
        "knowledgeBaseRoot": str(kb_root()),
        "pipelineNote": "上传后由 Hermes 定时任务：originals → fulltext → wiki ingest → qmd 索引",
    }


@router.get("/originals-dirs")
def api_list_originals_dirs():
    ensure_kb_root()
    return {
        "success": True,
        "base": ORIGINALS_PREFIX,
        "directories": list_originals_directories(),
    }


@router.post("/originals")
async def upload_original(
    file: UploadFile = File(...),
    target_dir: str = Form(default=f"{ORIGINALS_PREFIX}/maintenance/manuals"),
    to_inbox: bool = Form(default=False),
    _: dict = Depends(get_current_user),
):
    if not file.filename:
        raise HTTPException(status_code=400, detail="缺少文件名")

    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="文件为空")

    if len(data) > 100 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="单文件最大 100MB")

    try:
        rel_path = save_original(
            file.filename,
            data,
            target_dir=target_dir,
            to_inbox=to_inbox,
        )
    except DuplicateFileError as e:
        return {
            "success": False,
            "reason": "duplicate",
            "message": f"文件内容重复，已存在于 {e.existing_path}",
            "existingPath": e.existing_path,
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    return {
        "success": True,
        "relPath": rel_path,
        "message": "上传成功，等待 Hermes 定时任务处理（originals → fulltext → wiki）",
    }
