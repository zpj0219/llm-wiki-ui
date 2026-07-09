"""认证 API 路由"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel

from auth_store import (
    DEFAULT_USER_PERMISSIONS,
    PERMISSION_FIELDS,
    _check_is_admin,
    authenticate,
    bump_token_version,
    create_user,
    delete_user,
    get_all_users,
    get_user_by_token,
    get_user_permissions,
    issue_tokens,
    revoke_token,
    revoke_user_tokens,
    rotate_access_token,
    set_user_permissions,
    update_user,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginRequest(BaseModel):
    username: str
    password: str


class CreateUserRequest(BaseModel):
    username: str
    password: str
    email: str | None = None
    full_name: str | None = None
    is_active: bool = True
    account_source: str | None = None


class UpdateUserRequest(BaseModel):
    username: str | None = None
    password: str | None = None
    email: str | None = None
    full_name: str | None = None
    is_active: bool | None = None


class UpdatePermissionsRequest(BaseModel):
    permissions: dict[str, bool]


def _extract_bearer(authorization: str | None) -> str | None:
    if not authorization:
        return None
    parts = authorization.split(" ", 1)
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return None
    return parts[1].strip() or None


def get_current_user(authorization: str | None = Header(default=None)) -> dict:
    token = _extract_bearer(authorization)
    user = get_user_by_token(token) if token else None
    if not user:
        raise HTTPException(status_code=401, detail="登录已失效，请重新登录")
    return user


def require_admin(current_user: dict = Depends(get_current_user)) -> dict:
    if not current_user.get("is_superuser"):
        raise HTTPException(status_code=403, detail="需要管理员权限")
    return current_user

# 统一重登错误码: 499 或 401 + 特定 errorCode
RELOGIN_ERROR_CODE = "TOKEN_EXPIRED_OR_REVOKED"


@router.post("/login")
def login(body: LoginRequest):
    username = body.username.strip()
    if not username:
        return {
            "success": False,
            "errorMessage": "请输入用户名",
        }
    if not body.password:
        return {
            "success": False,
            "errorMessage": "请输入密码",
        }

    user = authenticate(username, body.password)
    if user == "disabled":
        return {
            "success": False,
            "errorMessage": "账号已被禁用，请联系管理员",
        }
    if user == "wrong_source":
        return {
            "success": False,
            "errorMessage": "当前系统为 Odoo SSO 模式，请通过 Odoo 菜单访问",
        }
    if not user:
        return {
            "success": False,
            "errorMessage": "用户名或密码错误",
        }

    tokens = issue_tokens(user)
    permissions = get_user_permissions(user["id"])
    return {
        "success": True,
        "data": {
            "user": {
                "id": user["id"],
                "username": user["username"],
                "email": user.get("email"),
                "full_name": user.get("full_name"),
                "is_active": user.get("is_active", True),
                "is_superuser": user.get("is_superuser", False),
                "created_at": user.get("created_at"),
                "account_source": user.get("account_source", "local"),
            },
            "permissions": permissions,
            "access_token": tokens["access_token"],
            "refresh_token": tokens["refresh_token"],
            "token_type": "bearer",
            "expires_in": tokens["expires_in"],
        },
    }


@router.get("/me")
def me(current_user: dict = Depends(get_current_user)):
    permissions = get_user_permissions(current_user["id"])
    return {"success": True, "data": current_user, "permissions": permissions}


@router.post("/logout")
def logout(authorization: str | None = Header(default=None)):
    token = _extract_bearer(authorization)
    if token:
        revoke_token(token)
    return {"success": True}


@router.post("/refresh")
def api_refresh_token(authorization: str | None = Header(default=None)):
    """用 refresh_token 换取新的 access_token。"""
    token = _extract_bearer(authorization)
    if not token:
        raise HTTPException(status_code=401, detail="缺少 refresh_token")
    result = rotate_access_token(token)
    if not result:
        raise HTTPException(status_code=401, detail="refresh_token 无效或已过期，请重新登录")
    return {"success": True, "data": result}


@router.get("/config")
def auth_config():
    """返回当前用户管理模式配置，前端据此决定是否显示用户管理等入口。"""
    from config import USER_MANAGEMENT_MODE
    return {
        "success": True,
        "userManagementMode": USER_MANAGEMENT_MODE,
    }


# ── Odoo JWT SSO 回调 ─────────────────────────────────────────────

@router.get("/odoo/callback")
def odoo_callback(token: str = ""):
    """Odoo JWT SSO 回调：验证短期 JWT → upsert 用户 → 签发 token。

    Odoo 侧重定向到此端点：GET /api/auth/odoo/callback?token=<HS256_JWT>
    仅在 USER_MANAGEMENT_MODE=odoo 时可用。
    """
    from config import ODOO_SSO_JWT_SECRET, USER_MANAGEMENT_MODE
    from odoo_auth import find_or_create_odoo_user, odoo_sso_enabled, verify_odoo_jwt

    if USER_MANAGEMENT_MODE != "odoo":
        raise HTTPException(status_code=400, detail="当前用户管理模式不是 Odoo SSO，请使用本地登录")

    if not odoo_sso_enabled():
        raise HTTPException(status_code=400, detail="Odoo SSO 未启用，请配置 ODOO_SSO_JWT_SECRET")

    token = token.strip()
    if not token:
        raise HTTPException(status_code=400, detail="缺少 token 参数")

    payload = verify_odoo_jwt(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Odoo Token 无效或已过期")

    sub = str(payload.get("sub") or "").strip()
    login = str(payload.get("login") or "").strip()
    email = str(payload.get("email") or "").strip() or None
    name = str(payload.get("name") or "").strip() or None

    if not sub:
        raise HTTPException(status_code=400, detail="JWT 中缺少 sub 字段")

    user = find_or_create_odoo_user(
        sub=sub,
        login=login,
        email=email,
        name=name,
    )

    if not user.get("is_active"):
        raise HTTPException(status_code=403, detail="账号已被禁用，请联系管理员")

    tokens = issue_tokens(user)
    permissions = get_user_permissions(user["id"])

    return {
        "success": True,
        "data": {
            "user": {
                "id": user["id"],
                "username": user["username"],
                "email": user.get("email"),
                "full_name": user.get("full_name"),
                "is_active": user.get("is_active", True),
                "is_superuser": user.get("is_superuser", False),
                "created_at": user.get("created_at"),
                "account_source": user.get("account_source", "local"),
                "external_id": user.get("external_id"),
            },
            "permissions": permissions,
            "access_token": tokens["access_token"],
            "refresh_token": tokens["refresh_token"],
            "token_type": "bearer",
            "expires_in": tokens["expires_in"],
        },
    }


# ── 用户管理（仅管理员，Odoo 模式下只读） ──────────────────────────

def _require_local_mode():
    from config import USER_MANAGEMENT_MODE
    if USER_MANAGEMENT_MODE != "local":
        raise HTTPException(status_code=400, detail="当前为 Odoo SSO 模式，用户管理由 Odoo 统一处理")

@router.get("/users")
def api_list_users(admin: dict = Depends(require_admin)):
    # GET 在两种模式下均可用，Odoo 模式下管理员可查看用户列表（只读）
    return {"success": True, "users": get_all_users()}


@router.post("/users")
def api_create_user(body: CreateUserRequest, admin: dict = Depends(require_admin)):
    _require_local_mode()
    try:
        user = create_user(
            username=body.username,
            password=body.password,
            email=body.email,
            full_name=body.full_name,
            is_active=body.is_active,
            is_superuser=False,  # 新建用户默认为非管理员
            account_source=body.account_source or "local",
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return {"success": True, "user": user}


@router.put("/users/{user_id}")
def api_update_user(user_id: int, body: UpdateUserRequest, admin: dict = Depends(require_admin)):
    _require_local_mode()
    # 禁止禁用管理员账号
    if body.is_active is not None and not body.is_active and _check_is_admin(user_id):
        raise HTTPException(status_code=400, detail="不能禁用管理员账号")
    try:
        user = update_user(
            user_id,
            username=body.username,
            password=body.password,
            email=body.email,
            full_name=body.full_name,
            is_active=body.is_active,
            is_superuser=None,  # 不允许通过此接口修改管理员状态
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    return {"success": True, "user": user}


@router.delete("/users/{user_id}")
def api_delete_user(user_id: int, admin: dict = Depends(require_admin)):
    _require_local_mode()
    if user_id == admin["id"]:
        raise HTTPException(status_code=400, detail="不能删除自己的账号")
    if not delete_user(user_id):
        raise HTTPException(status_code=404, detail="用户不存在")
    return {"success": True}


@router.get("/users/{user_id}/permissions")
def api_get_user_permissions(user_id: int, admin: dict = Depends(require_admin)):
    _require_local_mode()
    perms = get_user_permissions(user_id)
    return {"success": True, "permissions": perms}


@router.put("/users/{user_id}/permissions")
def api_update_user_permissions(user_id: int, body: UpdatePermissionsRequest, admin: dict = Depends(require_admin)):
    _require_local_mode()
    filtered = {
        f: bool(body.permissions.get(f, DEFAULT_USER_PERMISSIONS[f]))
        for f in PERMISSION_FIELDS
    }
    set_user_permissions(user_id, filtered)
    # 权限变更后直接在同一连接内使 token 失效
    from database import get_connection
    with get_connection() as conn:
        conn.execute(
            "UPDATE users SET token_version = token_version + 1 WHERE id = ?",
            (user_id,),
        )
        conn.execute("DELETE FROM auth_tokens WHERE user_id = ?", (user_id,))
        conn.commit()
    return {"success": True, "permissions": filtered}
