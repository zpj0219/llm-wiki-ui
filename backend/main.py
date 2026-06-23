"""LLM-Wiki FastAPI 后端入口"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers.auth import router as auth_router
from routers.chat import router as chat_router
from routers.wiki import router as wiki_router

app = FastAPI(
    title="LLM-Wiki API",
    description="LLM-Wiki 知识库后端（Mock 数据）",
    version="0.1.0",
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


@app.get("/api/health")
def health():
    return {"status": "ok", "service": "llm-wiki-api"}
