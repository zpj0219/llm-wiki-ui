"""应用配置 — 对接 LLM-Wiki 知识库与 Gateway"""

from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

_ROOT = Path(__file__).resolve().parent.parent
_BACKEND_DIR = Path(__file__).resolve().parent
load_dotenv(_ROOT / ".env")
load_dotenv(_BACKEND_DIR / ".env")

# 知识库根目录（与 hermes-data 中 home/Documents/knowledge-base 对齐）
_DEFAULT_KB = (
    Path(__file__).resolve().parent.parent.parent
    / "hermes-data"
    / "data"
    / "home"
    / "Documents"
    / "knowledge-base"
)
KNOWLEDGE_BASE_ROOT = Path(
    os.getenv("KNOWLEDGE_BASE_ROOT", str(_DEFAULT_KB))
).resolve()

# SQLite 应用数据库（用户、Token、对话会话）
_DEFAULT_DB = _BACKEND_DIR / "data" / "app.db"
DATABASE_PATH = Path(os.getenv("DATABASE_PATH", str(_DEFAULT_DB))).resolve()

# Hermes Gateway（OpenWebUI 兼容：/v1/models + /v1/chat/completions）
HERMES_GATEWAY_URL = os.getenv("HERMES_GATEWAY_URL", "http://localhost:8642").rstrip("/")
HERMES_API_KEY = os.getenv("HERMES_API_KEY", "").strip()
# OpenWebUI 连接 Hermes 时使用的逻辑模型 id
DEFAULT_CHAT_MODEL = os.getenv("DEFAULT_CHAT_MODEL", "hermes-agent").strip() or "hermes-agent"

# auto：有 API Key 则走 Hermes；也可显式 true/false
_use = os.getenv("USE_HERMES_CHAT", "auto").strip().lower()
USE_HERMES_CHAT = _use == "true" or (_use == "auto" and bool(HERMES_API_KEY))

ALLOWED_UPLOAD_EXTENSIONS = {
    ".pdf",
    ".doc",
    ".docx",
    ".xls",
    ".xlsx",
    ".ppt",
    ".pptx",
    ".txt",
    ".md",
    ".png",
    ".jpg",
    ".jpeg",
    ".webp",
    ".zip",
}

# ── Odoo JWT SSO 桥接 ──────────────────────────────────────────────
# 与 Odoo 自定义模块共享的 HS256 密钥，不为空即启用 Odoo SSO 回调
ODOO_SSO_JWT_SECRET = os.getenv("ODOO_SSO_JWT_SECRET", "").strip()

# ── 用户管理模式 ────────────────────────────────────────────────────
# "local"  — 本地模式：管理员手动添加用户（默认）
# "odoo"   — Odoo SSO 模式：用户由 Odoo 跳转回调自动创建，隐藏用户管理入口
USER_MANAGEMENT_MODE = os.getenv("USER_MANAGEMENT_MODE", "local").strip().lower()
if USER_MANAGEMENT_MODE not in ("local", "odoo"):
    USER_MANAGEMENT_MODE = "local"

# Hermes Webhook（结晶化 crystallize，默认 8644）
# POST {HERMES_WEBHOOK_URL}/webhooks/{HERMES_WEBHOOK_ROUTE}
def _default_webhook_url() -> str:
    import re

    gw = HERMES_GATEWAY_URL.rstrip("/")
    m = re.match(r"^(https?://.+):\d+$", gw)
    if m:
        return f"{m.group(1)}:8644"
    return "http://localhost:8644"


HERMES_WEBHOOK_URL = os.getenv("HERMES_WEBHOOK_URL", _default_webhook_url()).rstrip("/")
HERMES_WEBHOOK_SECRET = os.getenv("HERMES_WEBHOOK_SECRET", "").strip()
HERMES_WEBHOOK_ROUTE = os.getenv("HERMES_WEBHOOK_ROUTE", "crystallize").strip() or "crystallize"
