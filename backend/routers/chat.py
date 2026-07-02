"""Chat API — OpenWebUI 兼容 Hermes Gateway（/v1/chat/completions）"""

from __future__ import annotations

import json

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from chat_service import (
    chat_provider,
    clear_messages,
    create_session,
    delete_session,
    get_available_models,
    get_session,
    list_sessions,
    send_message,
    stream_message_async,
    update_session_model,
)
from config import DEFAULT_CHAT_MODEL, HERMES_GATEWAY_URL
from hermes_client import HermesError, health_check, hermes_enabled
from routers.auth import get_current_user

router = APIRouter(prefix="/api/chat", tags=["chat"])


class CreateSessionRequest(BaseModel):
    name: str | None = None
    modelId: str | None = None


class UpdateSessionRequest(BaseModel):
    modelId: str = Field(min_length=1)


class SendMessageRequest(BaseModel):
    content: str = Field(min_length=1)


@router.get("/config")
def api_chat_config(_: dict = Depends(get_current_user)):
    hermes_ok = False
    hermes_error: str | None = None
    if hermes_enabled():
        try:
            hc = health_check()
            hermes_ok = hc.get("ok", False)
            hermes_error = hc.get("error")
        except Exception as e:
            hermes_error = str(e)
    return {
        "success": True,
        "provider": chat_provider(),
        "hermesGateway": HERMES_GATEWAY_URL,
        "hermesConnected": hermes_ok,
        "hermesError": hermes_error,
        "defaultModel": DEFAULT_CHAT_MODEL,
        "streaming": True,
    }


@router.get("/models")
def api_list_models(_: dict = Depends(get_current_user)):
    try:
        models = get_available_models()
    except HermesError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    return {"success": True, "models": models, "defaultModel": DEFAULT_CHAT_MODEL}


@router.get("/sessions")
def api_list_sessions(current_user: dict = Depends(get_current_user)):
    user_id = str(current_user["id"])
    return {"success": True, "sessions": list_sessions(user_id)}


@router.post("/sessions")
def api_create_session(
    body: CreateSessionRequest | None = None,
    current_user: dict = Depends(get_current_user),
):
    user_id = str(current_user["id"])
    name = body.name if body else None
    model_id = body.modelId if body else None
    session = create_session(user_id, name, model_id=model_id)
    return {"success": True, "session": session}


@router.patch("/sessions/{session_id}")
def api_update_session(
    session_id: str,
    body: UpdateSessionRequest,
    current_user: dict = Depends(get_current_user),
):
    try:
        session = update_session_model(str(current_user["id"]), session_id, body.modelId)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    if not session:
        raise HTTPException(status_code=404, detail="会话不存在")
    return {"success": True, "session": session}


@router.get("/sessions/{session_id}")
def api_get_session(session_id: str, current_user: dict = Depends(get_current_user)):
    session = get_session(str(current_user["id"]), session_id)
    if not session:
        raise HTTPException(status_code=404, detail="会话不存在")
    return {"success": True, "session": session}


@router.delete("/sessions/{session_id}")
def api_delete_session(session_id: str, current_user: dict = Depends(get_current_user)):
    if not delete_session(str(current_user["id"]), session_id):
        raise HTTPException(status_code=404, detail="会话不存在")
    return {"success": True}


@router.post("/sessions/{session_id}/clear")
def api_clear_session(session_id: str, current_user: dict = Depends(get_current_user)):
    session = clear_messages(str(current_user["id"]), session_id)
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
        result = send_message(str(current_user["id"]), session_id, body.content)
    except HermesError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    if not result:
        raise HTTPException(status_code=404, detail="会话不存在")
    return {"success": True, **result}


@router.post("/sessions/{session_id}/messages/stream")
async def api_send_message_stream(
    session_id: str,
    body: SendMessageRequest,
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    user_id = str(current_user["id"])
    cancel_state = {"v": False}

    def is_cancelled() -> bool:
        return cancel_state["v"]

    try:
        events = stream_message_async(
            user_id, session_id, body.content, is_cancelled=is_cancelled
        )
    except HermesError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    if events is None:
        raise HTTPException(status_code=404, detail="会话不存在")

    async def generate():
        try:
            async for event in events:
                if await request.is_disconnected():
                    cancel_state["v"] = True
                    break
                yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"
            if not cancel_state["v"]:
                yield "data: [DONE]\n\n"
        finally:
            if cancel_state["v"]:
                await events.aclose()

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
