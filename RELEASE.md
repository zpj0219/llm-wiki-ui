# 发布检查清单

本清单用于发布 `v1.0.0`。执行 Tag 操作前应确保所有功能代码和文档已经提交。

## 1. 版本一致性

```bash
rg -n 'version="|APP_VERSION =' backend/main.py frontend/src/shared/constants.ts
sed -n '1,12p' frontend/package.json
sed -n '1,12p' frontend/package-lock.json
rg -n 'v1\.0\.0|\[1\.0\.0\]' README.md CHANGELOG.md RELEASE.md deploy.md
```

确认以下位置均为 `1.0.0`：

- `backend/main.py`
- `frontend/package.json`
- `frontend/package-lock.json`
- `frontend/src/shared/constants.ts`
- `README.md`
- `CHANGELOG.md`

## 2. 仓库检查

```bash
git status --short
git diff --check
git ls-files | rg '(^|/)app\.db$|\.tar$|\.env$'
```

要求：

- 不提交 `.env`、`data/app.db`、`backend/data/app.db`、`*.tar`。
- 不提交 `frontend/dist/`、`node_modules/` 或 Python 缓存。
- Tag 前工作区应为空，或者只包含确认要进入版本的文件。

## 3. 前端验证

```bash
cd frontend
npm ci
npm run build
cd ..
```

重点检查：

- 登录、侧栏和版本号。
- 工作台文件浏览与 Markdown 预览。
- 文件管理上传、文本预览、下载和删除。
- 关系图加载、搜索、拖拽、缩放、节点预览和移动端手势。
- 对话流式输出、停止、耗时标签和历史会话。
- 结晶确认、重复提示、强制提交和失败提示。

## 4. 后端验证

```bash
python3 -m py_compile backend/*.py backend/routers/*.py
```

若已安装后端依赖，可启动后验证：

```bash
cd backend
uvicorn main:app --port 8000
```

```bash
curl http://localhost:8000/api/health
curl http://localhost:8000/api/docs
```

## 5. Docker 验证

```bash
docker compose config
docker compose build
docker compose up -d
docker compose ps
curl http://localhost:3000/api/health
docker compose logs --tail=100
```

确认：

- 容器状态为 `healthy`。
- 知识库挂载路径正确。
- Hermes Gateway `:8642` 可用。
- 需要结晶时，Webhook `:8644` 和 HMAC Secret 配置一致。
- `./data/app.db` 在运行时生成，停止和重建容器后数据仍保留。

## 6. 数据备份

升级已有环境前备份：

```bash
cp data/app.db "data/app.db.backup-$(date +%Y%m%d-%H%M%S)"
```

知识库由 `hermes-data` 侧统一备份。不要把备份数据库提交到 Git。

## 7. 创建版本提交与 Tag

```bash
git add README.md CHANGELOG.md RELEASE.md deploy.md mob.md \
  backend/README.md backend/main.py \
  frontend/README.md frontend/package.json frontend/package-lock.json \
  .env.example

git commit -m "release: prepare v1.0.0"
git tag -a v1.0.0 -m "LLM-Wiki UI v1.0.0"
git push origin HEAD
git push origin v1.0.0
```

创建 Tag 前可再次确认：

```bash
git status --short
git show --stat --oneline HEAD
git show v1.0.0 --no-patch
```

## 8. 离线镜像

如需交付离线镜像：

```bash
docker tag llm-wiki-ui:latest llm-wiki-ui:v1.0.0
docker save -o llm-wiki-ui-v1.0.0.tar llm-wiki-ui:v1.0.0
```

`.tar` 文件是发布制品，不提交到源码仓库。

## 9. 回滚

```bash
git checkout <上一个版本标签>
docker compose up -d --build
```

数据库结构采用启动时迁移。回滚前应恢复与目标版本对应的数据库备份。
