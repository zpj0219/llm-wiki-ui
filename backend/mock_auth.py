"""Mock 用户与 token 管理"""

from __future__ import annotations

import secrets
import time
from typing import Any

MOCK_USERS: dict[str, dict[str, Any]] = {
    "admin": {
        "id": 1,
        "username": "admin",
        "password": "admin123",
        "email": "admin@example.com",
        "full_name": "系统管理员",
        "is_active": True,
        "is_superuser": True,
        "created_at": "2025-01-01T00:00:00Z",
    },
    "user": {
        "id": 2,
        "username": "user",
        "password": "user123",
        "email": "user@example.com",
        "full_name": "普通用户",
        "is_active": True,
        "is_superuser": False,
        "created_at": "2025-01-01T00:00:00Z",
    },
}

# token -> { user_id, username, expires_at }
_active_tokens: dict[str, dict[str, Any]] = {}
_TOKEN_TTL = 86400 * 7  # 7 天


def authenticate(username: str, password: str) -> dict[str, Any] | None:
    user = MOCK_USERS.get(username)
    if not user or user["password"] != password:
        return None
    if not user.get("is_active", True):
        return None
    return user


def issue_token(user: dict[str, Any]) -> str:
    token = f"mock-{secrets.token_urlsafe(24)}"
    _active_tokens[token] = {
        "user_id": user["id"],
        "username": user["username"],
        "expires_at": time.time() + _TOKEN_TTL,
    }
    return token


def revoke_token(token: str) -> None:
    _active_tokens.pop(token, None)


def get_user_by_token(token: str) -> dict[str, Any] | None:
    if not token or not token.startswith("mock-"):
        return None
    session = _active_tokens.get(token)
    if not session:
        return None
    if session["expires_at"] < time.time():
        _active_tokens.pop(token, None)
        return None
    username = session["username"]
    user = MOCK_USERS.get(username)
    if not user:
        return None
    return _public_user(user)


def _public_user(user: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": user["id"],
        "username": user["username"],
        "email": user.get("email"),
        "full_name": user.get("full_name"),
        "is_active": user.get("is_active", True),
        "is_superuser": user.get("is_superuser", False),
        "created_at": user.get("created_at"),
    }
