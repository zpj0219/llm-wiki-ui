"""用户认证与 Token 管理（SQLite）"""

from __future__ import annotations

import secrets
import time
from typing import Any

from database import get_connection, verify_password

_TOKEN_TTL = 86400 * 7  # 7 天


def authenticate(username: str, password: str) -> dict[str, Any] | None:
    with get_connection() as conn:
        row = conn.execute(
            "SELECT * FROM users WHERE username = ?",
            (username,),
        ).fetchone()
    if not row or not verify_password(password, row["password_hash"]):
        return None
    if not row["is_active"]:
        return None
    return dict(row)


def issue_token(user: dict[str, Any]) -> str:
    token = secrets.token_urlsafe(32)
    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO auth_tokens (token, user_id, username, expires_at)
            VALUES (?, ?, ?, ?)
            """,
            (token, user["id"], user["username"], time.time() + _TOKEN_TTL),
        )
        conn.commit()
    return token


def revoke_token(token: str) -> None:
    with get_connection() as conn:
        conn.execute("DELETE FROM auth_tokens WHERE token = ?", (token,))
        conn.commit()


def _purge_expired(conn) -> None:
    conn.execute("DELETE FROM auth_tokens WHERE expires_at < ?", (time.time(),))


def get_user_by_token(token: str) -> dict[str, Any] | None:
    if not token:
        return None
    with get_connection() as conn:
        _purge_expired(conn)
        session = conn.execute(
            "SELECT user_id, username, expires_at FROM auth_tokens WHERE token = ?",
            (token,),
        ).fetchone()
        if not session:
            return None
        if session["expires_at"] < time.time():
            conn.execute("DELETE FROM auth_tokens WHERE token = ?", (token,))
            conn.commit()
            return None
        user = conn.execute(
            "SELECT * FROM users WHERE id = ?",
            (session["user_id"],),
        ).fetchone()
    if not user:
        return None
    return _public_user(dict(user))


def _public_user(user: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": user["id"],
        "username": user["username"],
        "email": user.get("email"),
        "full_name": user.get("full_name"),
        "is_active": bool(user.get("is_active", True)),
        "is_superuser": bool(user.get("is_superuser", False)),
        "created_at": user.get("created_at"),
    }
