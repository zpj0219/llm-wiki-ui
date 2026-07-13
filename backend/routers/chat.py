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
    stop_session,
    stream_message_async,
    update_session_model,
)
from config import (
    DEFAULT_CHAT_MODEL,
    HERMES_GATEWAY_URL,
    HERMES_WEBHOOK_ROUTE,
    HERMES_WEBHOOK_SECRET,
    HERMES_WEBHOOK_URL,
)
from hermes_client import (
    HermesError,
    crystallize_conversation,
    health_check,
    hermes_enabled,
)
from crystallize_store import (
    content_fingerprint,
    find_duplicate,
    list_message_ids_submitted,
    record_submission,
)
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
        "crystallizeEnabled": bool(HERMES_WEBHOOK_SECRET),
        "crystallizeWebhook": f"{HERMES_WEBHOOK_URL}/webhooks/{HERMES_WEBHOOK_ROUTE}",
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
        events = await stream_message_async(
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




class CrystallizeRequest(BaseModel):
    topic: str = Field(min_length=1, max_length=200)
    content: str = Field(min_length=1)
    conversationId: str | None = None
    messageId: str | None = None
    source: str | None = None
    timestamp: str | None = None
    force: bool = False


class CrystallizeLookupRequest(BaseModel):
    messageIds: list[str] = Field(default_factory=list)
    content: str | None = None


@router.post("/crystallize/lookup")
def api_crystallize_lookup(
    body: CrystallizeLookupRequest,
    current_user: dict = Depends(get_current_user),
):
    """查询消息是否已结晶 / 内容指纹是否已提交。"""
    user_id = str(current_user["id"])
    submitted = list_message_ids_submitted(user_id, body.messageIds or [])
    content_hit = None
    match_by = None
    if body.content and body.content.strip():
        h = content_fingerprint(body.content)
        content_hit, match_by = find_duplicate(user_id, content_hash=h, message_id="")
    return {
        "success": True,
        "submittedMessageIds": sorted(submitted),
        "contentHash": content_fingerprint(body.content) if body.content else None,
        "contentDuplicate": content_hit,
        "matchBy": match_by,
    }


@router.post("/crystallize")
def api_crystallize(
    body: CrystallizeRequest,
    current_user: dict = Depends(get_current_user),
):
    """将对话片段提交到 Hermes Webhook 结晶化（异步 202）。

    精确去重：
    - content_hash = MD5(normalize(content))，**不含 topic**
    - 同一用户下 message_id 或 content_hash 命中则 409（force=true 可强制）
    """
    user_id = str(current_user["id"])
    topic = body.topic.strip()
    content = body.content
    conversation_id = (body.conversationId or "").strip()
    message_id = (body.messageId or "").strip()
    source = (body.source or "llm-wiki-ui").strip() or "llm-wiki-ui"

    content_hash = content_fingerprint(content)
    existing, match_by = find_duplicate(
        user_id, content_hash=content_hash, message_id=message_id
    )
    if existing and not body.force:
        raise HTTPException(
            status_code=409,
            detail={
                "code": "CRYSTALLIZE_DUPLICATE",
                "message": (
                    "该助手回复已结晶过"
                    if match_by == "message_id"
                    else "相同对话正文已结晶过（主题不参与去重）"
                ),
                "matchBy": match_by,
                "contentHash": content_hash,
                "existing": existing,
            },
        )

    try:
        result = crystallize_conversation(
            topic=topic,
            content=content,
            source=source,
            conversation_id=conversation_id,
            timestamp=body.timestamp,
        )
    except HermesError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    delivery_id = result.get("delivery_id")
    record = record_submission(
        user_id,
        conversation_id=conversation_id,
        message_id=message_id,
        content_hash=content_hash,
        topic=topic,
        delivery_id=str(delivery_id) if delivery_id else None,
        source=source,
    )

    return {
        "success": True,
        "status": result.get("status", "accepted"),
        "route": result.get("route", HERMES_WEBHOOK_ROUTE),
        "deliveryId": delivery_id,
        "contentHash": content_hash,
        "message": "结晶任务已提交，Agent 将异步写入知识库",
        "userId": current_user.get("id"),
        "submission": record,
        "forced": bool(body.force and existing),
        "previous": existing if body.force else None,
    }

@router.post("/sessions/{session_id}/stop")
def api_stop_session(session_id: str, current_user: dict = Depends(get_current_user)):
    """标记会话需要中断——区别于刷新断开。"""
    stop_session(session_id)
    return {"success": True}
