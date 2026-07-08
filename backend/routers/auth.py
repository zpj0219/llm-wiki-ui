"""认证 API 路由"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel

from auth_store import (
    DEFAULT_USER_PERMISSIONS,
    PERMISSION_FIELDS,
    _check_is_admin,
    authenticate,
    create_user,
    delete_user,
    get_all_users,
    get_user_by_token,
    get_user_permissions,
    issue_token,
    revoke_token,
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
    if not user:
        return {
            "success": False,
            "errorMessage": "用户名或密码错误",
        }

    token = issue_token(user)
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
            },
            "permissions": permissions,
            "access_token": token,
            "token_type": "bearer",
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


# ── 用户管理（仅管理员） ──────────────────────────────────────────

@router.get("/users")
def api_list_users(admin: dict = Depends(require_admin)):
    return {"success": True, "users": get_all_users()}


@router.post("/users")
def api_create_user(body: CreateUserRequest, admin: dict = Depends(require_admin)):
    try:
        user = create_user(
            username=body.username,
            password=body.password,
            email=body.email,
            full_name=body.full_name,
            is_active=body.is_active,
            is_superuser=False,  # 新建用户默认为非管理员
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return {"success": True, "user": user}


@router.put("/users/{user_id}")
def api_update_user(user_id: int, body: UpdateUserRequest, admin: dict = Depends(require_admin)):
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
    if user_id == admin["id"]:
        raise HTTPException(status_code=400, detail="不能删除自己的账号")
    if not delete_user(user_id):
        raise HTTPException(status_code=404, detail="用户不存在")
    return {"success": True}


@router.get("/users/{user_id}/permissions")
def api_get_user_permissions(user_id: int, admin: dict = Depends(require_admin)):
    perms = get_user_permissions(user_id)
    return {"success": True, "permissions": perms}


@router.put("/users/{user_id}/permissions")
def api_update_user_permissions(user_id: int, body: UpdatePermissionsRequest, admin: dict = Depends(require_admin)):
    # 只允许设置已定义的权限字段
    filtered = {
        f: bool(body.permissions.get(f, DEFAULT_USER_PERMISSIONS[f]))
        for f in PERMISSION_FIELDS
    }
    set_user_permissions(user_id, filtered)
    return {"success": True, "permissions": filtered}
