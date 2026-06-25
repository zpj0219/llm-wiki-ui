"""应用配置 — 对接 Hermes Agent 知识库与 Gateway"""

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
