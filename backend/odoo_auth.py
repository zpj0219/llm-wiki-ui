"""Odoo JWT SSO 桥接 — 验证 Odoo 生成的短期 JWT，查找或创建本地用户"""

from __future__ import annotations

from typing import Any

import jwt

from config import ODOO_SSO_JWT_SECRET
from database import get_connection, hash_password
from auth_store import DEFAULT_USER_PERMISSIONS, set_user_permissions

_ODOO_EXTERNAL_ID_PREFIX = "odoo:"


def odoo_sso_enabled() -> bool:
    return bool(ODOO_SSO_JWT_SECRET)


def verify_odoo_jwt(token: str) -> dict[str, Any] | None:
    """验证 Odoo 生成的 HS256 JWT，成功返回 payload，失败返回 None。

    payload 期望字段: sub, login, email, name, exp
    """
    if not token:
        return None
    try:
        payload = jwt.decode(
            token,
            ODOO_SSO_JWT_SECRET,
            algorithms=["HS256"],
            options={"require": ["sub", "exp"]},
        )
    except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
        return None
    return payload


def find_or_create_odoo_user(
    sub: str,
    login: str,
    email: str | None = None,
    name: str | None = None,
) -> dict[str, Any]:
    """按 external_id = odoo:{sub} 查找或创建本地用户，返回用户 dict。

    创建时 password_hash 为随机不可用哈希，用户无法本地登录；
    username = odoo_{sub}（确保唯一且不与本地用户冲突）。
    """
    import secrets
    from datetime import datetime, timezone

    external_id = f"{_ODOO_EXTERNAL_ID_PREFIX}{sub}"
    now = datetime.now(timezone.utc).isoformat()

    with get_connection() as conn:
        # 查找已有用户
        row = conn.execute(
            "SELECT * FROM users WHERE external_id = ?", (external_id,)
        ).fetchone()
        if row:
            # 同步 email / name（Odoo 侧变更时自动更新）
            updates: list[str] = []
            params: list[Any] = []
            if email and email != row["email"]:
                updates.append("email = ?")
                params.append(email)
            if name and name != row["full_name"]:
                updates.append("full_name = ?")
                params.append(name)
            if updates:
                params.append(row["id"])
                conn.execute(f"UPDATE users SET {', '.join(updates)} WHERE id = ?", params)
                conn.commit()
            return dict(row)

        # 不存在 → 创建新用户
        username = f"odoo_{sub}"
        # 确保 username 不冲突
        dup = conn.execute(
            "SELECT id FROM users WHERE username = ?", (username,)
        ).fetchone()
        if dup:
            # 极端情况：已有同名本地用户，加后缀
            username = f"odoo_{sub}_{secrets.token_hex(4)}"

        # 随机不可用哈希，禁止此用户本地登录
        unusable_pw = hash_password(secrets.token_urlsafe(64))

        conn.execute(
            """INSERT INTO users
            (username, password_hash, email, full_name, is_active, is_superuser, created_at, external_id, account_source)
            VALUES (?, ?, ?, ?, 1, 0, ?, ?, 'odoo')""",
            (username, unusable_pw, email, name or login, now, external_id),
        )
        conn.commit()
        row = conn.execute(
            "SELECT * FROM users WHERE external_id = ?", (external_id,)
        ).fetchone()

    user_dict = dict(row)
    # 写入默认权限
    set_user_permissions(user_dict["id"], dict(DEFAULT_USER_PERMISSIONS))
    return user_dict
