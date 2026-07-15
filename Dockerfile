FROM node:20-alpine AS frontend-builder

WORKDIR /app
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci
COPY frontend/ .
RUN npm run build

FROM python:3.12-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends nginx curl \
    && rm -rf /var/lib/apt/lists/* \
    && rm -f /etc/nginx/sites-enabled/default

WORKDIR /app

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ .
COPY --from=frontend-builder /app/dist /usr/share/nginx/html
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY deploy/start.sh /start.sh
RUN sed -i 's/\r$//' /start.sh \
    && chmod +x /start.sh \
    && mkdir -p /var/lib/llm-wiki-ui

ENV KNOWLEDGE_BASE_ROOT=/data/knowledge-base \
    DATABASE_PATH=/var/lib/llm-wiki-ui/app.db

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=15s \
    CMD curl -f http://127.0.0.1/api/health || exit 1

CMD ["sh", "/start.sh"]
