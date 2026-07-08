"""用户认证与 Token 管理（SQLite）"""

from __future__ import annotations

import secrets
import time
from typing import Any

from database import get_connection, hash_password, verify_password

_TOKEN_TTL = 86400 * 7  # 7 天

# ── 权限常量 ────────────────────────────────────────────────────────

PERMISSION_FIELDS = [
    "can_access_wiki_workbench",
    "can_access_wiki_rawfiles",
    "can_access_wiki_graph",
    "can_access_wiki_search",
    "can_access_chat",
    "can_access_settings",
    "can_manage_accounts",
]

DEFAULT_USER_PERMISSIONS: dict[str, bool] = {
    "can_access_wiki_workbench": True,
    "can_access_wiki_rawfiles": True,
    "can_access_wiki_graph": True,
    "can_access_wiki_search": True,
    "can_access_chat": True,
    "can_access_settings": True,
    "can_manage_accounts": False,
}

DEFAULT_ADMIN_PERMISSIONS: dict[str, bool] = {k: True for k in PERMISSION_FIELDS}


def _check_is_admin(user_id: int) -> bool:
    """检查用户是否为管理员。"""
    with get_connection() as conn:
        row = conn.execute(
            "SELECT is_superuser FROM users WHERE id = ?", (user_id,)
        ).fetchone()
    return bool(row and row["is_superuser"])


def authenticate(username: str, password: str) -> dict[str, Any] | None | str:
    """返回用户 dict、None（凭据错误）或 'disabled'（账号已禁用）。"""
    with get_connection() as conn:
        row = conn.execute(
            "SELECT * FROM users WHERE username = ?",
            (username,),
        ).fetchone()
    if not row or not verify_password(password, row["password_hash"]):
        return None
    if not row["is_active"]:
        return "disabled"
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


def get_user_permissions(user_id: int) -> dict[str, bool]:
    """获取用户的功能权限。不存在记录时返回默认权限。"""
    with get_connection() as conn:
        row = conn.execute(
            "SELECT * FROM user_permissions WHERE user_id = ?",
            (user_id,),
        ).fetchone()
    if not row:
        return dict(DEFAULT_USER_PERMISSIONS)
    return {field: bool(row[field]) for field in PERMISSION_FIELDS}


def set_user_permissions(user_id: int, permissions: dict[str, bool]) -> dict[str, bool]:
    """写入或更新用户权限。"""
    with get_connection() as conn:
        existing = conn.execute(
            "SELECT 1 FROM user_permissions WHERE user_id = ?", (user_id,)
        ).fetchone()
        if existing:
            sets = ", ".join(f"{f} = ?" for f in PERMISSION_FIELDS)
            conn.execute(
                f"UPDATE user_permissions SET {sets} WHERE user_id = ?",
                [int(permissions.get(f, DEFAULT_USER_PERMISSIONS[f])) for f in PERMISSION_FIELDS] + [user_id],
            )
        else:
            conn.execute(
                f"""INSERT INTO user_permissions (user_id, {', '.join(PERMISSION_FIELDS)})
                VALUES (?, {', '.join('?' * len(PERMISSION_FIELDS))})""",
                [user_id] + [int(permissions.get(f, DEFAULT_USER_PERMISSIONS[f])) for f in PERMISSION_FIELDS],
            )
        conn.commit()
    return get_user_permissions(user_id)


def get_all_users() -> list[dict[str, Any]]:
    """列出所有用户（含权限）。仅管理员调用。"""
    with get_connection() as conn:
        users = conn.execute(
            "SELECT id, username, email, full_name, is_active, is_superuser, created_at FROM users ORDER BY id"
        ).fetchall()
    result: list[dict[str, Any]] = []
    for u in users:
        user_dict = _public_user(dict(u))
        user_dict["permissions"] = get_user_permissions(u["id"])
        result.append(user_dict)
    return result


def create_user(
    username: str,
    password: str,
    *,
    email: str | None = None,
    full_name: str | None = None,
    is_active: bool = True,
    is_superuser: bool = False,
    permissions: dict[str, bool] | None = None,
) -> dict[str, Any]:
    """创建新用户，返回用户 dict。"""
    from datetime import datetime, timezone

    username = username.strip()
    if not username:
        raise ValueError("用户名不能为空")
    if not password:
        raise ValueError("密码不能为空")

    now = datetime.now(timezone.utc).isoformat()
    with get_connection() as conn:
        existing = conn.execute(
            "SELECT id FROM users WHERE username = ?", (username,)
        ).fetchone()
        if existing:
            raise ValueError(f"用户名已存在: {username}")

        conn.execute(
            """INSERT INTO users (username, password_hash, email, full_name, is_active, is_superuser, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (username, hash_password(password), email or None, full_name or None,
             int(is_active), int(is_superuser), now),
        )
        conn.commit()
        user = conn.execute(
            "SELECT * FROM users WHERE username = ?", (username,)
        ).fetchone()

    user_dict = _public_user(dict(user))
    # 写入权限
    user_dict["permissions"] = set_user_permissions(
        user["id"],
        permissions if permissions is not None else (
            DEFAULT_ADMIN_PERMISSIONS if is_superuser else DEFAULT_USER_PERMISSIONS
        ),
    )
    return user_dict


def update_user(
    user_id: int,
    *,
    username: str | None = None,
    password: str | None = None,
    email: str | None = None,
    full_name: str | None = None,
    is_active: bool | None = None,
    is_superuser: bool | None = None,
) -> dict[str, Any] | None:
    """更新用户信息。"""
    with get_connection() as conn:
        row = conn.execute(
            "SELECT * FROM users WHERE id = ?", (user_id,)
        ).fetchone()
        if not row:
            return None

        updates: list[str] = []
        params: list[Any] = []

        if username is not None:
            uname = username.strip()
            if not uname:
                raise ValueError("用户名不能为空")
            # 检查是否与其他用户重复
            dup = conn.execute(
                "SELECT id FROM users WHERE username = ? AND id != ?", (uname, user_id)
            ).fetchone()
            if dup:
                raise ValueError(f"用户名已存在: {uname}")
            updates.append("username = ?")
            params.append(uname)

        if password is not None:
            if not password:
                raise ValueError("密码不能为空")
            updates.append("password_hash = ?")
            params.append(hash_password(password))

        if email is not None:
            updates.append("email = ?")
            params.append(email)
        if full_name is not None:
            updates.append("full_name = ?")
            params.append(full_name)
        if is_active is not None:
            updates.append("is_active = ?")
            params.append(int(is_active))
        if is_superuser is not None:
            updates.append("is_superuser = ?")
            params.append(int(is_superuser))

        if updates:
            params.append(user_id)
            conn.execute(f"UPDATE users SET {', '.join(updates)} WHERE id = ?", params)
            conn.commit()

        user = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()

    user_dict = _public_user(dict(user))
    user_dict["permissions"] = get_user_permissions(user_id)
    return user_dict


def delete_user(user_id: int) -> bool:
    """删除用户。返回 True 表示成功。"""
    with get_connection() as conn:
        row = conn.execute(
            "SELECT id FROM users WHERE id = ?", (user_id,)
        ).fetchone()
        if not row:
            return False
        conn.execute("DELETE FROM users WHERE id = ?", (user_id,))
        conn.commit()
    return True
