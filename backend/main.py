"""LLM-Wiki 前端 BFF — 知识库 + 对话 Gateway 代理"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import DATABASE_PATH, HERMES_GATEWAY_URL, KNOWLEDGE_BASE_ROOT, USE_HERMES_CHAT
from database import init_db
from knowledge_store import ensure_kb_root, _migrate_manifest
from routers.auth import router as auth_router
from routers.chat import router as chat_router
from routers.upload import router as upload_router
from routers.wiki import router as wiki_router

ensure_kb_root()
init_db()
_migrate_manifest()  # 启动时一次性扫描文件并计算 MD5

app = FastAPI(
    title="LLM-Wiki 前端 API",
    description="Hongtai AI Hub — 知识库浏览、原件上传、LLM-Wiki 对话",
    version="1.0.0",
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(chat_router)
app.include_router(wiki_router)
app.include_router(upload_router)


@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "service": "llm-wiki-ui-bff",
        "knowledgeBaseRoot": str(KNOWLEDGE_BASE_ROOT),
        "databasePath": str(DATABASE_PATH),
        "hermesGateway": HERMES_GATEWAY_URL,
        "useHermesChat": USE_HERMES_CHAT,
    }
