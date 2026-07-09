"""Chat 会话持久化（SQLite）"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from config import DEFAULT_CHAT_MODEL
from database import get_connection


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _default_session_name(messages: list[dict[str, Any]]) -> str:
    for msg in messages:
        if msg.get("role") == "user" and msg.get("content"):
            text = str(msg["content"]).strip().replace("\n", " ")
            return text[:24] + ("…" if len(text) > 24 else "")
    return "新对话"


def _load_messages(conn, session_id: str) -> list[dict[str, Any]]:
    rows = conn.execute(
        """
        SELECT id, role, content, timestamp
        FROM chat_messages
        WHERE session_id = ?
        ORDER BY sort_order
        """,
        (session_id,),
    ).fetchall()
    return [
        {
            "id": r["id"],
            "role": r["role"],
            "content": r["content"],
            "timestamp": r["timestamp"],
        }
        for r in rows
    ]


def _serialize_session(row, messages: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "id": row["id"],
        "name": row["name"],
        "messages": messages,
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
        "hermesSessionId": row["hermes_session_id"],
        "provider": row["provider"] or "hermes",
        "modelId": row["model_id"] or DEFAULT_CHAT_MODEL,
    }


def _get_session_row(conn, user_id: str, session_id: str):
    return conn.execute(
        "SELECT * FROM chat_sessions WHERE id = ? AND user_id = ?",
        (session_id, user_id),
    ).fetchone()


def list_sessions(user_id: str) -> list[dict[str, Any]]:
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT s.id, s.name, s.created_at, s.updated_at, s.provider, s.model_id,
                   (SELECT COUNT(*) FROM chat_messages m WHERE m.session_id = s.id) AS message_count
            FROM chat_sessions s
            WHERE s.user_id = ?
            ORDER BY s.updated_at DESC
            """,
            (user_id,),
        ).fetchall()
    return [
        {
            "id": r["id"],
            "name": r["name"],
            "createdAt": r["created_at"],
            "updatedAt": r["updated_at"],
            "messageCount": r["message_count"],
            "provider": r["provider"] or "hermes",
            "modelId": r["model_id"] or DEFAULT_CHAT_MODEL,
        }
        for r in rows
    ]


def create_session(
    user_id: str,
    name: str | None = None,
    *,
    hermes_session_id: str | None = None,
    provider: str = "hermes",
    model_id: str | None = None,
) -> dict[str, Any]:
    session_id = str(uuid.uuid4())
    now = _now_iso()
    title = name.strip() if name and name.strip() else "新对话"
    model = (model_id or DEFAULT_CHAT_MODEL).strip() or DEFAULT_CHAT_MODEL
    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO chat_sessions (id, user_id, name, created_at, updated_at, hermes_session_id, provider, model_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (session_id, user_id, title, now, now, hermes_session_id, provider, model),
        )
        conn.commit()
        row = conn.execute(
            "SELECT * FROM chat_sessions WHERE id = ?",
            (session_id,),
        ).fetchone()
    return _serialize_session(row, [])


def update_session_model(user_id: str, session_id: str, model_id: str) -> dict[str, Any] | None:
    model = model_id.strip()
    if not model:
        raise ValueError("模型不能为空")
    now = _now_iso()
    with get_connection() as conn:
        row = _get_session_row(conn, user_id, session_id)
        if not row:
            return None
        conn.execute(
            "UPDATE chat_sessions SET model_id = ?, updated_at = ? WHERE id = ?",
            (model, now, session_id),
        )
        conn.commit()
        row = conn.execute(
            "SELECT * FROM chat_sessions WHERE id = ?",
            (session_id,),
        ).fetchone()
        messages = _load_messages(conn, session_id)
    return _serialize_session(row, messages)


def get_session(user_id: str, session_id: str) -> dict[str, Any] | None:
    with get_connection() as conn:
        row = _get_session_row(conn, user_id, session_id)
        if not row:
            return None
        messages = _load_messages(conn, session_id)
    return _serialize_session(row, messages)


def delete_session(user_id: str, session_id: str) -> dict[str, Any] | None:
    """删除会话，返回被删会话行（含 hermes_session_id）以便调用方清理 Hermes。"""
    with get_connection() as conn:
        row = _get_session_row(conn, user_id, session_id)
        if not row:
            return None
        conn.execute("DELETE FROM chat_sessions WHERE id = ?", (session_id,))
        conn.commit()
    return dict(row)


def clear_messages(user_id: str, session_id: str) -> dict[str, Any] | None:
    now = _now_iso()
    with get_connection() as conn:
        row = _get_session_row(conn, user_id, session_id)
        if not row:
            return None
        conn.execute("DELETE FROM chat_messages WHERE session_id = ?", (session_id,))
        conn.execute(
            "UPDATE chat_sessions SET name = ?, updated_at = ? WHERE id = ?",
            ("新对话", now, session_id),
        )
        conn.commit()
        row = conn.execute(
            "SELECT * FROM chat_sessions WHERE id = ?",
            (session_id,),
        ).fetchone()
    return _serialize_session(row, [])


def append_messages(
    user_id: str,
    session_id: str,
    user_msg: dict[str, Any],
    assistant_msg: dict[str, Any],
    *,
    rename_from_messages: bool = False,
) -> dict[str, Any] | None:
    with get_connection() as conn:
        row = _get_session_row(conn, user_id, session_id)
        if not row:
            return None

        max_order = conn.execute(
            "SELECT COALESCE(MAX(sort_order), -1) FROM chat_messages WHERE session_id = ?",
            (session_id,),
        ).fetchone()[0]

        for i, msg in enumerate((user_msg, assistant_msg)):
            conn.execute(
                """
                INSERT INTO chat_messages (id, session_id, role, content, timestamp, sort_order)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    msg["id"],
                    session_id,
                    msg["role"],
                    msg["content"],
                    msg["timestamp"],
                    max_order + 1 + i,
                ),
            )

        new_name = row["name"]
        if rename_from_messages and row["name"] == "新对话":
            messages = _load_messages(conn, session_id)
            messages.extend([user_msg, assistant_msg])
            new_name = _default_session_name(messages)

        updated_at = assistant_msg["timestamp"]
        conn.execute(
            "UPDATE chat_sessions SET name = ?, updated_at = ? WHERE id = ?",
            (new_name, updated_at, session_id),
        )
        conn.commit()

        row = conn.execute(
            "SELECT * FROM chat_sessions WHERE id = ?",
            (session_id,),
        ).fetchone()
        messages = _load_messages(conn, session_id)
    return _serialize_session(row, messages)


def update_last_message(session_id: str, content: str, user_id: str) -> None:
    """更新会话最后一条 assistant 消息的内容。用于后台续收补写和流式中间写入。"""
    with get_connection() as conn:
        row = conn.execute(
            """
            SELECT id FROM chat_messages
            WHERE session_id = ? AND role = 'assistant'
            ORDER BY sort_order DESC LIMIT 1
            """,
            (session_id,),
        ).fetchone()
        if row:
            conn.execute(
                "UPDATE chat_messages SET content = ? WHERE id = ?",
                (content, row["id"]),
            )
            conn.execute(
                "UPDATE chat_sessions SET updated_at = ? WHERE id = ?",
                (_now_iso(), session_id),
            )
            conn.commit()
