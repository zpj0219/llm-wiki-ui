"""Hermes Gateway 客户端 — OpenWebUI 兼容 /v1 + Sessions API"""

from __future__ import annotations

import json
from typing import Any, AsyncIterator, Iterator, Literal

import httpx

from config import DEFAULT_CHAT_MODEL, HERMES_API_KEY, HERMES_GATEWAY_URL, USE_HERMES_CHAT


class HermesError(Exception):
    pass


def hermes_enabled() -> bool:
    return USE_HERMES_CHAT and bool(HERMES_API_KEY)


def _client(**kwargs: Any) -> httpx.Client:
    # Windows 系统代理会导致 localhost/LAN 的 Gateway 返回 502
    return httpx.Client(trust_env=False, **kwargs)


def _headers(extra: dict[str, str] | None = None) -> dict[str, str]:
    h = {
        "Authorization": f"Bearer {HERMES_API_KEY}",
        "Content-Type": "application/json",
    }
    if extra:
        h.update(extra)
    return h


def _request(
    method: str,
    path: str,
    *,
    extra_headers: dict[str, str] | None = None,
    **kwargs: Any,
) -> Any:
    url = f"{HERMES_GATEWAY_URL}{path}"
    try:
        with _client(timeout=120.0) as client:
            resp = client.request(method, url, headers=_headers(extra_headers), **kwargs)
    except httpx.RequestError as e:
        raise HermesError(f"无法连接 Hermes Gateway ({HERMES_GATEWAY_URL}): {e}") from e

    if resp.status_code >= 400:
        detail = resp.text[:500]
        try:
            body = resp.json()
            detail = body.get("detail") or body.get("message") or body.get("error", {}).get("message") or detail
        except Exception:
            pass
        raise HermesError(f"Hermes API 错误 ({resp.status_code}): {detail}")

    if resp.status_code == 204 or not resp.content:
        return {}
    return resp.json()


def health_check() -> dict[str, Any]:
    try:
        with _client(timeout=8.0) as client:
            resp = client.get(f"{HERMES_GATEWAY_URL}/health")
        return {
            "ok": resp.status_code == 200,
            "status": resp.status_code,
            "error": None if resp.status_code == 200 else resp.text[:200] or f"HTTP {resp.status_code}",
        }
    except httpx.RequestError as e:
        return {"ok": False, "status": 0, "error": str(e)}


def list_models() -> list[dict[str, str]]:
    """OpenWebUI 同款：GET /v1/models"""
    data = _request("GET", "/v1/models")
    items = data.get("data") if isinstance(data, dict) else None
    if not isinstance(items, list):
        return [{"id": DEFAULT_CHAT_MODEL, "name": DEFAULT_CHAT_MODEL}]

    models: list[dict[str, str]] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        model_id = str(item.get("id") or "").strip()
        if not model_id:
            continue
        models.append({"id": model_id, "name": model_id})

    if not models:
        return [{"id": DEFAULT_CHAT_MODEL, "name": DEFAULT_CHAT_MODEL}]
    return models


def delete_session(hermes_session_id: str) -> None:
    """清理旧版 Sessions API 绑定的 Hermes 会话（兼容迁移）。"""
    _request("DELETE", f"/api/sessions/{hermes_session_id}")


def _session_key_header(session_key: str | None) -> dict[str, str] | None:
    return {"X-Hermes-Session-Key": session_key} if session_key else None


def chat_completions(
    messages: list[dict[str, str]],
    model: str,
    *,
    session_key: str | None = None,
) -> str:
    """OpenWebUI 同款：POST /v1/chat/completions（非流式）"""
    data = _request(
        "POST",
        "/v1/chat/completions",
        json={"model": model, "messages": messages, "stream": False},
        extra_headers=_session_key_header(session_key),
    )
    return _extract_openai_text(data)


def chat_completions_stream(
    messages: list[dict[str, str]],
    model: str,
    *,
    session_key: str | None = None,
) -> Iterator[dict[str, Any]]:
    """OpenWebUI 同款：POST /v1/chat/completions stream=true

    Yields dicts: {"type": "delta", "delta": str} | {"type": "step", "step": {...}}
    """
    url = f"{HERMES_GATEWAY_URL}/v1/chat/completions"
    headers = _headers(_session_key_header(session_key))

    with _client(timeout=None) as client:
        with client.stream(
            "POST",
            url,
            headers=headers,
            json={"model": model, "messages": messages, "stream": True},
        ) as resp:
            if resp.status_code >= 400:
                raise HermesError(f"Hermes 流式错误 ({resp.status_code}): {resp.read().decode()[:300]}")
            sse_event = ""
            for line in resp.iter_lines():
                if not line:
                    sse_event = ""
                    continue
                if line.startswith("event:"):
                    sse_event = line[6:].strip()
                    continue
                if not line.startswith("data:"):
                    continue
                payload = line[5:].strip()
                if payload == "[DONE]":
                    break
                try:
                    event = json.loads(payload)
                except json.JSONDecodeError:
                    continue
                if not isinstance(event, dict):
                    continue
                for out in _parse_stream_events(event, sse_event):
                    yield out
                sse_event = ""


async def chat_completions_stream_async(
    messages: list[dict[str, str]],
    model: str,
    *,
    session_key: str | None = None,
) -> AsyncIterator[dict[str, Any]]:
    """异步版：POST /v1/chat/completions stream=true，不阻塞线程池"""
    url = f"{HERMES_GATEWAY_URL}/v1/chat/completions"
    headers = _headers(_session_key_header(session_key))

    async with httpx.AsyncClient(trust_env=False, timeout=None) as client:
        async with client.stream(
            "POST", url, headers=headers,
            json={"model": model, "messages": messages, "stream": True},
        ) as resp:
            if resp.status_code >= 400:
                body = await resp.aread()
                raise HermesError(f"Hermes 流式错误 ({resp.status_code}): {body.decode()[:300]}")
            sse_event = ""
            async for line in resp.aiter_lines():
                if not line:
                    sse_event = ""
                    continue
                if line.startswith("event:"):
                    sse_event = line[6:].strip()
                    continue
                if not line.startswith("data:"):
                    continue
                payload = line[5:].strip()
                if payload == "[DONE]":
                    break
                try:
                    event = json.loads(payload)
                except json.JSONDecodeError:
                    continue
                if not isinstance(event, dict):
                    continue
                for out in _parse_stream_events(event, sse_event):
                    yield out
                sse_event = ""


def _tool_label(tool: str) -> str:
    names = {
        "read_file": "读取文件",
        "write_file": "写入文件",
        "terminal": "执行命令",
        "web_search": "网页搜索",
        "qmd_search": "搜索知识库",
        "search": "搜索",
        "grep": "检索内容",
        "list_dir": "列出目录",
    }
    return names.get(tool, tool or "工具")


def _step_detail(data: dict[str, Any]) -> str:
    for key in ("input", "args", "arguments"):
        val = data.get(key)
        if isinstance(val, str) and val.strip():
            text = val.strip().replace("\n", " ")
            return text[:120] + ("…" if len(text) > 120 else "")
        if isinstance(val, dict) and val:
            text = json.dumps(val, ensure_ascii=False)
            return text[:120] + ("…" if len(text) > 120 else "")
    output = data.get("output") or data.get("result")
    if isinstance(output, str) and output.strip():
        text = output.strip().replace("\n", " ")
        return text[:120] + ("…" if len(text) > 120 else "")
    return ""


def _build_step(
    data: dict[str, Any],
    *,
    status: Literal["running", "completed"],
    fallback_tool: str = "",
) -> dict[str, Any] | None:
    tool = str(
        data.get("tool")
        or data.get("name")
        or data.get("tool_name")
        or fallback_tool
        or ""
    ).strip()
    if tool.startswith("_"):
        return None

    step_id = str(
        data.get("toolCallId")
        or data.get("tool_call_id")
        or data.get("call_id")
        or data.get("id")
        or f"{tool}-{status}-{data.get('message', '')}"[:64]
    ).strip()
    if not step_id:
        step_id = f"{tool or 'step'}-{status}"

    label = str(data.get("message") or data.get("label") or "").strip()
    if not label:
        friendly = _tool_label(tool)
        label = f"正在{friendly}…" if status == "running" else f"{friendly} 完成"

    detail = _step_detail(data)
    return {
        "id": step_id,
        "label": label,
        "status": status,
        "tool": tool or None,
        "detail": detail or None,
    }


def _parse_stream_events(event: dict[str, Any], sse_event: str) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    etype = str(event.get("type") or event.get("event") or sse_event or "").strip()

    if etype in ("hermes.tool.progress", "tool.progress"):
        status_raw = str(event.get("status") or "running").lower()
        status: Literal["running", "completed"] = (
            "completed" if status_raw in ("completed", "complete", "done", "success") else "running"
        )
        step = _build_step(event, status=status)
        if step:
            out.append({"type": "step", "step": step})
        return out

    if etype == "tool.started":
        step = _build_step(event, status="running")
        if step:
            out.append({"type": "step", "step": step})
        return out

    if etype == "tool.completed":
        step = _build_step(event, status="completed")
        if step:
            out.append({"type": "step", "step": step})
        return out

    if etype in ("assistant.delta", "message.delta", "content.delta"):
        delta = str(event.get("delta") or event.get("content") or "")
        if delta:
            out.append({"type": "delta", "delta": delta})
        return out

    if etype == "run.completed":
        return out

    delta = _extract_stream_delta(event)
    if delta:
        out.append({"type": "delta", "delta": delta})
    return out


def _extract_stream_delta(event: dict[str, Any]) -> str:
    choices = event.get("choices")
    if choices:
        delta = choices[0].get("delta", {})
        return str(delta.get("content") or "")
    return ""


def _extract_openai_text(data: Any) -> str:
    if isinstance(data, str):
        return data
    if not isinstance(data, dict):
        return str(data)

    choices = data.get("choices")
    if isinstance(choices, list) and choices:
        msg = choices[0].get("message") or choices[0].get("delta") or {}
        if isinstance(msg, dict):
            content = msg.get("content")
            if isinstance(content, str) and content.strip():
                return content

    for key in ("output", "response", "content", "text", "message"):
        val = data.get(key)
        if isinstance(val, str) and val.strip():
            return val

    return json.dumps(data, ensure_ascii=False, indent=2)


def crystallize_conversation(
    *,
    topic: str,
    content: str,
    source: str = "llm-wiki-ui",
    conversation_id: str = "",
    timestamp: str | None = None,
) -> dict[str, Any]:
    """调用 Hermes Webhook 结晶化接口（默认 :8644/webhooks/crystallize）。

    HMAC: X-Webhook-Signature = hex(HMAC-SHA256(raw_body, secret))
    """
    import hashlib
    import hmac
    import uuid
    from datetime import datetime, timezone

    from config import (
        HERMES_WEBHOOK_ROUTE,
        HERMES_WEBHOOK_SECRET,
        HERMES_WEBHOOK_URL,
    )

    if not HERMES_WEBHOOK_SECRET:
        raise HermesError(
            "未配置 HERMES_WEBHOOK_SECRET（与 hermes-data config.yaml 中 "
            "platforms.webhook.routes.crystallize.secret 一致）"
        )

    topic = (topic or "").strip()
    content = (content or "").strip()
    if not topic:
        raise HermesError("topic 不能为空")
    if not content:
        raise HermesError("content 不能为空")

    ts = timestamp or datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")
    payload = {
        "topic": topic,
        "content": content,
        "source": source or "llm-wiki-ui",
        "conversation_id": conversation_id or "",
        "timestamp": ts,
    }
    raw_body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    signature = hmac.new(
        HERMES_WEBHOOK_SECRET.encode("utf-8"),
        raw_body,
        hashlib.sha256,
    ).hexdigest()
    request_id = f"cryst-{uuid.uuid4().hex}"

    route = HERMES_WEBHOOK_ROUTE.strip("/") or "crystallize"
    url = f"{HERMES_WEBHOOK_URL.rstrip('/')}/webhooks/{route}"
    headers = {
        "Content-Type": "application/json",
        "X-Webhook-Signature": signature,
        "X-Request-ID": request_id,
    }

    try:
        with _client(timeout=30.0) as client:
            resp = client.post(url, content=raw_body, headers=headers)
    except httpx.RequestError as e:
        raise HermesError(f"无法连接 Hermes Webhook ({url}): {e}") from e

    detail: Any
    try:
        detail = resp.json()
    except Exception:
        detail = {"raw": resp.text[:500]}

    if resp.status_code >= 400:
        msg = detail if isinstance(detail, str) else (
            detail.get("error") or detail.get("detail") or detail.get("message") or detail
        )
        raise HermesError(f"结晶化 Webhook 错误 ({resp.status_code}): {msg}")

    if not isinstance(detail, dict):
        detail = {"data": detail}
    detail.setdefault("delivery_id", request_id)
    detail.setdefault("webhook_url", url)
    return detail
