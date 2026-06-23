"""Chat API 路由（Mock）"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from mock_chat import (
    clear_messages,
    create_session,
    delete_session,
    get_session,
    list_sessions,
    send_message,
)
from routers.auth import get_current_user

router = APIRouter(prefix="/api/chat", tags=["chat"])


class CreateSessionRequest(BaseModel):
    name: str | None = None


class SendMessageRequest(BaseModel):
    content: str = Field(min_length=1)


@router.get("/sessions")
def api_list_sessions(current_user: dict = Depends(get_current_user)):
    user_id = current_user["id"]
    return {"success": True, "sessions": list_sessions(user_id)}


@router.post("/sessions")
def api_create_session(
    body: CreateSessionRequest | None = None,
    current_user: dict = Depends(get_current_user),
):
    user_id = current_user["id"]
    name = body.name if body else None
    session = create_session(user_id, name)
    return {"success": True, "session": session}


@router.get("/sessions/{session_id}")
def api_get_session(session_id: str, current_user: dict = Depends(get_current_user)):
    session = get_session(current_user["id"], session_id)
    if not session:
        raise HTTPException(status_code=404, detail="会话不存在")
    return {"success": True, "session": session}


@router.delete("/sessions/{session_id}")
def api_delete_session(session_id: str, current_user: dict = Depends(get_current_user)):
    if not delete_session(current_user["id"], session_id):
        raise HTTPException(status_code=404, detail="会话不存在")
    return {"success": True}


@router.post("/sessions/{session_id}/clear")
def api_clear_session(session_id: str, current_user: dict = Depends(get_current_user)):
    session = clear_messages(current_user["id"], session_id)
    if not session:
        raise HTTPException(status_code=404, detail="会话不存在")
    return {"success": True, "session": session}


@router.post("/sessions/{session_id}/messages")
def api_send_message(
    session_id: str,
    body: SendMessageRequest,
    current_user: dict = Depends(get_current_user),
):
    try:
        result = send_message(current_user["id"], session_id, body.content)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    if not result:
        raise HTTPException(status_code=404, detail="会话不存在")
    return {"success": True, **result}
