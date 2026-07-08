"""Chat 服务 — OpenWebUI 兼容 /v1/chat/completions + 本地 SQLite 会话"""

from __future__ import annotations

import uuid
import asyncio
from datetime import datetime, timezone
from typing import Any, AsyncIterator, Callable, Iterator

from chat_store import (
    append_messages,
    clear_messages as store_clear,
    create_session as store_create,
    delete_session as store_delete,
    get_session as store_get,
    list_sessions as store_list,
    update_last_message,
    update_session_model as store_update_model,
)
from config import DEFAULT_CHAT_MODEL, USE_HERMES_CHAT
from hermes_client import (
    HermesError,
    chat_completions,
    chat_completions_stream,
    chat_completions_stream_async,
    delete_session as hermes_delete,
    hermes_enabled,
    list_models,
)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _require_hermes() -> None:
    if not hermes_enabled():
        raise HermesError(
            "LLM-Wiki Gateway 未配置。请在 .env 中设置 HERMES_API_KEY（与 llm-wiki 的 API_SERVER_KEY 一致）"
        )


def _session_key(user_id: str) -> str:
    return f"agent:main:webui:user:{user_id}"


def _serialize(session: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": session["id"],
        "name": session["name"],
        "messages": list(session["messages"]),
        "createdAt": session["createdAt"],
        "updatedAt": session["updatedAt"],
        "modelId": session.get("modelId") or DEFAULT_CHAT_MODEL,
        "provider": session.get("provider", "hermes"),
    }


def _build_api_messages(session: dict[str, Any], user_text: str) -> list[dict[str, str]]:
    messages: list[dict[str, str]] = []
    for msg in session.get("messages") or []:
        role = msg.get("role")
        content = msg.get("content")
        if role in ("user", "assistant") and isinstance(content, str) and content.strip():
            messages.append({"role": str(role), "content": content})
    messages.append({"role": "user", "content": user_text})
    return messages


# ── 停止标记（前端点击停止 vs 刷新断开） ────────────────────────────

_session_stop_flags: dict[str, bool] = {}
_active_background_tasks: dict[str, bool] = {}


def stop_session(session_id: str) -> None:
    """标记会话需要中断。由 /stop 端点调用。"""
    _session_stop_flags[session_id] = True


def _is_stopped(session_id: str) -> bool:
    return _session_stop_flags.pop(session_id, False)


def get_available_models() -> list[dict[str, str]]:
    _require_hermes()
    return list_models()


def list_sessions(user_id: str) -> list[dict[str, Any]]:
    return store_list(user_id)


def create_session(
    user_id: str,
    name: str | None = None,
    *,
    model_id: str | None = None,
) -> dict[str, Any]:
    model = (model_id or DEFAULT_CHAT_MODEL).strip() or DEFAULT_CHAT_MODEL
    title = name.strip() if name and name.strip() else "新对话"
    session = store_create(user_id, title, model_id=model, provider="hermes")
    return _serialize(session)


def update_session_model(user_id: str, session_id: str, model_id: str) -> dict[str, Any] | None:
    session = store_update_model(user_id, session_id, model_id)
    return _serialize(session) if session else None


def get_session(user_id: str, session_id: str) -> dict[str, Any] | None:
    session = store_get(user_id, session_id)
    return _serialize(session) if session else None


def delete_session(user_id: str, session_id: str) -> bool:
    row = store_delete(user_id, session_id)
    if not row:
        return False
    hid = row.get("hermes_session_id")
    if hid and hermes_enabled():
        try:
            hermes_delete(str(hid))
        except HermesError:
            pass
    return True


def clear_messages(user_id: str, session_id: str) -> dict[str, Any] | None:
    session = store_clear(user_id, session_id)
    return _serialize(session) if session else None


def send_message(user_id: str, session_id: str, content: str) -> dict[str, Any] | None:
    _require_hermes()
    session = store_get(user_id, session_id)
    if not session:
        return None

    text = content.strip()
    if not text:
        raise ValueError("消息内容不能为空")

    now = _now_iso()
    user_msg = {"id": str(uuid.uuid4()), "role": "user", "content": text, "timestamp": now}
    model = session.get("modelId") or DEFAULT_CHAT_MODEL
    api_messages = _build_api_messages(session, text)

    try:
        reply = chat_completions(api_messages, model, session_key=_session_key(user_id))
    except HermesError as e:
        raise ValueError(str(e)) from e

    assistant_msg = {
        "id": str(uuid.uuid4()),
        "role": "assistant",
        "content": reply,
        "timestamp": _now_iso(),
    }

    updated = append_messages(
        user_id,
        session_id,
        user_msg,
        assistant_msg,
        rename_from_messages=True,
    )
    if not updated:
        return None

    return {
        "session": _serialize(updated),
        "userMessage": user_msg,
        "assistantMessage": assistant_msg,
    }


def stream_message(
    user_id: str,
    session_id: str,
    content: str,
    *,
    is_cancelled: Callable[[], bool] | None = None,
) -> Iterator[dict[str, Any]] | None:
    """生成 SSE 事件 dict：started / delta / step / done / stopped / error"""
    _require_hermes()
    session = store_get(user_id, session_id)
    if not session:
        return None

    text = content.strip()
    if not text:
        raise ValueError("消息内容不能为空")

    now = _now_iso()
    user_msg = {"id": str(uuid.uuid4()), "role": "user", "content": text, "timestamp": now}
    model = session.get("modelId") or DEFAULT_CHAT_MODEL
    api_messages = _build_api_messages(session, text)

    def _persist(parts: list[str], *, stopped: bool) -> tuple[dict[str, Any] | None, dict[str, Any]]:
        full = "".join(parts) if parts else ("（已停止生成）" if stopped else "（无回复内容）")
        assistant_msg = {
            "id": str(uuid.uuid4()),
            "role": "assistant",
            "content": full,
            "timestamp": _now_iso(),
        }
        updated = append_messages(
            user_id,
            session_id,
            user_msg,
            assistant_msg,
            rename_from_messages=True,
        )
        return updated, assistant_msg

    def _iter() -> Iterator[dict[str, Any]]:
        yield {"type": "started", "userMessage": user_msg}
        yield {
            "type": "step",
            "step": {
                "id": "__hermes_init__",
                "label": "LLM-Wiki 正在分析问题…",
                "status": "running",
            },
        }
        parts: list[str] = []
        saved = False

        def _save_once(*, stopped: bool) -> tuple[dict[str, Any] | None, dict[str, Any] | None]:
            nonlocal saved
            if saved:
                return None, None
            saved = True
            updated, assistant_msg = _persist(parts, stopped=stopped)
            return updated, assistant_msg

        try:
            try:
                for chunk in chat_completions_stream(
                    api_messages, model, session_key=_session_key(user_id)
                ):
                    if is_cancelled and is_cancelled():
                        break
                    if chunk.get("type") == "delta":
                        delta = str(chunk.get("delta") or "")
                        if delta:
                            parts.append(delta)
                            yield {"type": "delta", "delta": delta}
                    elif chunk.get("type") == "step":
                        step = chunk.get("step")
                        if isinstance(step, dict):
                            yield {"type": "step", "step": step}
            except HermesError as e:
                yield {"type": "error", "message": str(e)}
                return

            stopped = bool(is_cancelled and is_cancelled())
            updated, assistant_msg = _save_once(stopped=stopped)
            if not updated or not assistant_msg:
                yield {"type": "error", "message": "会话保存失败"}
                return
            yield {
                "type": "stopped" if stopped else "done",
                "session": _serialize(updated),
                "assistantMessage": assistant_msg,
            }
        except GeneratorExit:
            _save_once(stopped=True)
            raise

    return _iter()


async def stream_message_async(
    user_id: str,
    session_id: str,
    content: str,
    *,
    is_cancelled: Callable[[], bool] | None = None,
) -> AsyncIterator[dict[str, Any]] | None:
    """异步版流式对话，不阻塞线程池。"""
    _require_hermes()
    session = store_get(user_id, session_id)
    if not session:
        return None

    text = content.strip()
    if not text:
        raise ValueError("消息内容不能为空")

    now = _now_iso()
    user_msg = {"id": str(uuid.uuid4()), "role": "user", "content": text, "timestamp": now}
    model = session.get("modelId") or DEFAULT_CHAT_MODEL
    api_messages = _build_api_messages(session, text)

    async def _iter() -> AsyncIterator[dict[str, Any]]:
        parts: list[str] = []
        saved = False

        def _persist(parts: list[str], *, stopped: bool) -> tuple[dict[str, Any] | None, dict[str, Any]]:
            full = "".join(parts) if parts else ("（已停止生成）" if stopped else "（无回复内容）")
            assistant_msg = {
                "id": str(uuid.uuid4()),
                "role": "assistant",
                "content": full,
                "timestamp": _now_iso(),
            }
            updated = append_messages(
                user_id, session_id, user_msg, assistant_msg, rename_from_messages=True,
            )
            return updated, assistant_msg

        def _save_once(*, stopped: bool) -> tuple[dict[str, Any] | None, dict[str, Any] | None]:
            nonlocal saved
            if saved:
                return None, None
            saved = True
            return _persist(parts, stopped=stopped)

        yield {"type": "started", "userMessage": user_msg}
        yield {
            "type": "step",
            "step": {
                "id": "__hermes_init__",
                "label": "LLM-Wiki 正在分析问题…",
                "status": "running",
            },
        }

        try:
            async for chunk in chat_completions_stream_async(
                api_messages, model, session_key=_session_key(user_id)
            ):
                if is_cancelled and is_cancelled():
                    break
                if _is_stopped(session_id):
                    # 用户点击停止 → 真正中断
                    yield {"type": "stopped", "session": _serialize(session), "assistantMessage": {"id": "", "role": "assistant", "content": "（已停止）", "timestamp": _now_iso()}}
                    _save_once(stopped=True)
                    return
                if chunk.get("type") == "delta":
                    delta = str(chunk.get("delta") or "")
                    if delta:
                        parts.append(delta)
                        yield {"type": "delta", "delta": delta}
                elif chunk.get("type") == "step":
                    step = chunk.get("step")
                    if isinstance(step, dict):
                        yield {"type": "step", "step": step}
        except HermesError as e:
            yield {"type": "error", "message": str(e)}
            return
        else:
            # else 只在 try 块正常完成时执行（无 break / return / exception）
            # 正常完成 → 在这里持久化 + 发送 done
            stopped = bool(is_cancelled and is_cancelled()) or _is_stopped(session_id)
            updated, assistant_msg = _save_once(stopped=stopped)
            if updated and assistant_msg:
                yield {
                    "type": "stopped" if stopped else "done",
                    "session": _serialize(updated),
                    "assistantMessage": assistant_msg,
                }
        finally:
            # finally 只处理异常断开（break / GeneratorExit）：应急保存 + 后台续收
            if not saved:
                stopped = bool(is_cancelled and is_cancelled()) or _is_stopped(session_id)
                if stopped:
                    _save_once(stopped=True)
                elif parts:
                    # 浏览器刷新/断开 → 先保存已有内容，再后台续收
                    _save_once(stopped=False)
                    _active_background_tasks[session_id] = True
                    async def _background_continue():
                        try:
                            async for chunk in chat_completions_stream_async(
                                api_messages, model, session_key=_session_key(user_id)
                            ):
                                if chunk.get("type") == "delta":
                                    delta = str(chunk.get("delta") or "")
                                    if delta:
                                        parts.append(delta)
                        except Exception:
                            pass
                        finally:
                            _active_background_tasks.pop(session_id, None)
                            if parts:
                                update_last_message(session_id, "".join(parts), user_id)
                    asyncio.create_task(_background_continue())

    return _iter()


def chat_provider() -> str:
    if hermes_enabled():
        return "hermes"
    if USE_HERMES_CHAT:
        return "unavailable"
    return "disabled"
