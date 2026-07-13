"""结晶提交记录与内容指纹（精确去重）"""

from __future__ import annotations

import hashlib
import re
from datetime import datetime, timezone
from typing import Any

from database import get_connection


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def normalize_crystallize_content(content: str) -> str:
    """规范化正文：统一换行、去 BOM、两端空白。

    注意：topic 不参与指纹；仅 content 决定 content_hash。
    """
    text = (content or "").replace("\r\n", "\n").replace("\r", "\n")
    text = text.lstrip("\ufeff")
    # 去掉行尾空白，避免无意义空格导致“假不同”
    text = "\n".join(line.rstrip() for line in text.split("\n"))
    return text.strip()


def content_fingerprint(content: str) -> str:
    """内容指纹：MD5(hex)。

    选型说明见接口注释 — 用于非对抗场景的精确去重，与 uploads 清单一致。
    """
    normalized = normalize_crystallize_content(content)
    return hashlib.md5(normalized.encode("utf-8")).hexdigest()


def _row_to_dict(row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "userId": row["user_id"],
        "conversationId": row["conversation_id"],
        "messageId": row["message_id"],
        "contentHash": row["content_hash"],
        "topic": row["topic"],
        "deliveryId": row["delivery_id"],
        "source": row["source"],
        "createdAt": row["created_at"],
    }


def find_duplicate(
    user_id: str,
    *,
    content_hash: str,
    message_id: str = "",
) -> tuple[dict[str, Any] | None, str | None]:
    """查找重复提交。

    返回 (existing, match_by)：
    - match_by = "message_id" | "content_hash" | None
    优先 message_id（同一助手气泡），其次 content_hash（同正文）。
    """
    uid = str(user_id)
    mid = (message_id or "").strip()
    with get_connection() as conn:
        if mid:
            row = conn.execute(
                """
                SELECT * FROM crystallize_submissions
                WHERE user_id = ? AND message_id = ?
                ORDER BY id DESC
                LIMIT 1
                """,
                (uid, mid),
            ).fetchone()
            if row:
                return _row_to_dict(row), "message_id"

        row = conn.execute(
            """
            SELECT * FROM crystallize_submissions
            WHERE user_id = ? AND content_hash = ?
            ORDER BY id DESC
            LIMIT 1
            """,
            (uid, content_hash),
        ).fetchone()
        if row:
            return _row_to_dict(row), "content_hash"
    return None, None


def record_submission(
    user_id: str,
    *,
    conversation_id: str,
    message_id: str,
    content_hash: str,
    topic: str,
    delivery_id: str | None,
    source: str = "llm-wiki-ui",
) -> dict[str, Any]:
    """写入一次成功提交记录。"""
    now = _now_iso()
    with get_connection() as conn:
        cur = conn.execute(
            """
            INSERT INTO crystallize_submissions (
                user_id, conversation_id, message_id, content_hash,
                topic, delivery_id, source, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                str(user_id),
                (conversation_id or "").strip(),
                (message_id or "").strip(),
                content_hash,
                (topic or "").strip(),
                delivery_id,
                (source or "llm-wiki-ui").strip() or "llm-wiki-ui",
                now,
            ),
        )
        conn.commit()
        row = conn.execute(
            "SELECT * FROM crystallize_submissions WHERE id = ?",
            (cur.lastrowid,),
        ).fetchone()
    return _row_to_dict(row)


def list_message_ids_submitted(user_id: str, message_ids: list[str]) -> set[str]:
    """批量查询哪些 message_id 已结晶（用于前端按钮状态）。"""
    ids = [m.strip() for m in message_ids if m and m.strip()]
    if not ids:
        return set()
    placeholders = ",".join("?" * len(ids))
    with get_connection() as conn:
        rows = conn.execute(
            f"""
            SELECT DISTINCT message_id FROM crystallize_submissions
            WHERE user_id = ? AND message_id IN ({placeholders})
            """,
            (str(user_id), *ids),
        ).fetchall()
    return {r["message_id"] for r in rows if r["message_id"]}
