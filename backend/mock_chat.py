"""Chat Mock 存储与回复"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

_store: dict[str, dict[str, dict[str, Any]]] = {}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _ensure_user(user_id: str) -> dict[str, dict[str, Any]]:
    if user_id not in _store:
        _store[user_id] = {}
    return _store[user_id]


def _default_session_name(messages: list[dict[str, Any]]) -> str:
    for msg in messages:
        if msg.get("role") == "user" and msg.get("content"):
            text = str(msg["content"]).strip().replace("\n", " ")
            return text[:24] + ("…" if len(text) > 24 else "")
    return "新对话"


def list_sessions(user_id: str) -> list[dict[str, Any]]:
    sessions = _ensure_user(user_id).values()
    return sorted(
        [
            {
                "id": s["id"],
                "name": s["name"],
                "createdAt": s["createdAt"],
                "updatedAt": s["updatedAt"],
                "messageCount": len(s["messages"]),
            }
            for s in sessions
        ],
        key=lambda x: x["updatedAt"],
        reverse=True,
    )


def create_session(user_id: str, name: str | None = None) -> dict[str, Any]:
    user_sessions = _ensure_user(user_id)
    session_id = str(uuid.uuid4())
    now = _now_iso()
    session = {
        "id": session_id,
        "name": name.strip() if name and name.strip() else "新对话",
        "messages": [],
        "createdAt": now,
        "updatedAt": now,
    }
    user_sessions[session_id] = session
    return _serialize_session(session)


def get_session(user_id: str, session_id: str) -> dict[str, Any] | None:
    session = _ensure_user(user_id).get(session_id)
    if not session:
        return None
    return _serialize_session(session)


def delete_session(user_id: str, session_id: str) -> bool:
    user_sessions = _ensure_user(user_id)
    if session_id not in user_sessions:
        return False
    del user_sessions[session_id]
    return True


def clear_messages(user_id: str, session_id: str) -> dict[str, Any] | None:
    session = _ensure_user(user_id).get(session_id)
    if not session:
        return None
    session["messages"] = []
    session["name"] = "新对话"
    session["updatedAt"] = _now_iso()
    return _serialize_session(session)


def _mock_reply(user_text: str, history: list[dict[str, Any]]) -> str:
    preview = user_text.strip().replace("\n", " ")
    if len(preview) > 120:
        preview = preview[:120] + "…"
    turns = sum(1 for m in history if m.get("role") == "user")
    return (
        f"这是 Mock 助手的回复（第 {turns + 1} 轮）。\n\n"
        f"你刚才说：「{preview}」\n\n"
        "当前为演示模式，接入真实 LLM API 后将返回模型生成内容。"
    )


def send_message(user_id: str, session_id: str, content: str) -> dict[str, Any] | None:
    session = _ensure_user(user_id).get(session_id)
    if not session:
        return None

    text = content.strip()
    if not text:
        raise ValueError("消息内容不能为空")

    now = _now_iso()
    user_msg = {
        "id": str(uuid.uuid4()),
        "role": "user",
        "content": text,
        "timestamp": now,
    }
    assistant_msg = {
        "id": str(uuid.uuid4()),
        "role": "assistant",
        "content": _mock_reply(text, session["messages"]),
        "timestamp": _now_iso(),
    }
    session["messages"].extend([user_msg, assistant_msg])
    session["updatedAt"] = assistant_msg["timestamp"]
    if session["name"] == "新对话":
        session["name"] = _default_session_name(session["messages"])

    return {
        "session": _serialize_session(session),
        "userMessage": user_msg,
        "assistantMessage": assistant_msg,
    }


def _serialize_session(session: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": session["id"],
        "name": session["name"],
        "messages": list(session["messages"]),
        "createdAt": session["createdAt"],
        "updatedAt": session["updatedAt"],
    }
