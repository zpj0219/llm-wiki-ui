"""SQLite 数据库初始化与连接"""

from __future__ import annotations

import hashlib
import secrets
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Any, Iterator

from config import DATABASE_PATH

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    email TEXT,
    full_name TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    is_superuser INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS auth_tokens (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    username TEXT NOT NULL,
    expires_at REAL NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS chat_sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    hermes_session_id TEXT,
    provider TEXT NOT NULL DEFAULT 'hermes',
    model_id TEXT NOT NULL DEFAULT 'hermes-agent'
);

CREATE TABLE IF NOT EXISTS chat_messages (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    sort_order INTEGER NOT NULL,
    FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_permissions (
    user_id INTEGER PRIMARY KEY,
    can_access_wiki_workbench INTEGER NOT NULL DEFAULT 1,
    can_access_wiki_rawfiles INTEGER NOT NULL DEFAULT 1,
    can_access_wiki_graph INTEGER NOT NULL DEFAULT 1,
    can_access_wiki_search INTEGER NOT NULL DEFAULT 1,
    can_access_chat INTEGER NOT NULL DEFAULT 1,
    can_access_settings INTEGER NOT NULL DEFAULT 1,
    can_manage_accounts INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_auth_tokens_user ON auth_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_user ON chat_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id, sort_order);
"""

_SEED_USERS: tuple[dict[str, Any], ...] = (
    {
        "username": "admin",
        "password": "admin123",
        "email": "admin@example.com",
        "full_name": "系统管理员",
        "is_superuser": True,
    },
    {
        "username": "user",
        "password": "user123",
        "email": "user@example.com",
        "full_name": "普通用户",
        "is_superuser": False,
    },
)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    key = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 100_000)
    return f"{salt.hex()}:{key.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        salt_hex, key_hex = stored.split(":", 1)
    except ValueError:
        return False
    salt = bytes.fromhex(salt_hex)
    key = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 100_000)
    return secrets.compare_digest(key.hex(), key_hex)


def _migrate(conn: sqlite3.Connection) -> None:
    cols = {row[1] for row in conn.execute("PRAGMA table_info(chat_sessions)").fetchall()}
    if "model_id" not in cols:
        conn.execute(
            "ALTER TABLE chat_sessions ADD COLUMN model_id TEXT NOT NULL DEFAULT 'hermes-agent'"
        )


def init_db() -> None:
    DATABASE_PATH.parent.mkdir(parents=True, exist_ok=True)
    with get_connection() as conn:
        conn.executescript(SCHEMA)
        _migrate(conn)
        _seed_users(conn)
        _seed_permissions(conn)
        conn.commit()


def _seed_users(conn: sqlite3.Connection) -> None:
    row = conn.execute("SELECT COUNT(*) FROM users").fetchone()
    if row and row[0] > 0:
        return
    now = _now_iso()
    for u in _SEED_USERS:
        conn.execute(
            """
            INSERT INTO users (username, password_hash, email, full_name, is_active, is_superuser, created_at)
            VALUES (?, ?, ?, ?, 1, ?, ?)
            """,
            (
                u["username"],
                hash_password(u["password"]),
                u["email"],
                u["full_name"],
                1 if u["is_superuser"] else 0,
                now,
            ),
        )


def _seed_permissions(conn: sqlite3.Connection) -> None:
    """为已有用户补充默认权限，仅在新表为空时执行。"""
    row = conn.execute("SELECT COUNT(*) FROM user_permissions").fetchone()
    if row and row[0] > 0:
        return
    users = conn.execute("SELECT id, is_superuser FROM users").fetchall()
    for u in users:
        is_admin = bool(u["is_superuser"])
        conn.execute(
            """
            INSERT INTO user_permissions (
                user_id, can_access_wiki_workbench, can_access_wiki_rawfiles,
                can_access_wiki_graph, can_access_wiki_search,
                can_access_chat, can_access_settings, can_manage_accounts
            ) VALUES (?, 1, 1, 1, 1, 1, 1, ?)
            """,
            (u["id"], 1 if is_admin else 0),
        )


@contextmanager
def get_connection() -> Iterator[sqlite3.Connection]:
    conn = sqlite3.connect(str(DATABASE_PATH), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    try:
        yield conn
    finally:
        conn.close()
