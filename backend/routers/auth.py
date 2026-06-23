"""认证 API 路由（Mock）"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel

from mock_auth import authenticate, get_user_by_token, issue_token, revoke_token

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginRequest(BaseModel):
    username: str
    password: str


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
    if not user:
        return {
            "success": False,
            "errorMessage": "用户名或密码错误",
        }

    token = issue_token(user)
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
            "access_token": token,
            "token_type": "bearer",
        },
    }


@router.get("/me")
def me(current_user: dict = Depends(get_current_user)):
    return {"success": True, "data": current_user}


@router.post("/logout")
def logout(authorization: str | None = Header(default=None)):
    token = _extract_bearer(authorization)
    if token:
        revoke_token(token)
    return {"success": True}
