"""LLM-Wiki mock 知识库数据"""

from __future__ import annotations

from copy import deepcopy
from typing import Any

# 模拟 wiki 页面内容（Markdown）
MOCK_PAGES: dict[str, str] = {
    "wiki/index.md": """---
title: 知识库首页
---

# LLM-Wiki 知识库

> 基于 **Karpathy LLM-Wiki** 方法论：用互链 Markdown 构建可复利增长的知识体系。

## 方法论要点

- **一次整理，持续复利**：素材整理后写入 Wiki，关联关系已建立
- **互链优于碎片检索**：`[[wikilink]]` 连接实体、主题与来源，可审计、可版本化
- **人机分工**：人策展来源，Agent 摘要、交叉引用并维护一致性

## 目录结构

- [[entities/数控机床|数控机床实体]]
- [[topics/故障诊断|故障诊断主题]]
- [[sources/维修手册-001|维修手册 001]]

## 最近更新

| 工单号 | 设备 | 状态 |
|--------|------|------|
| WX250107002 | CNC-001 | 已修复 |
| WX250108015 | PLC-003 | 处理中 |
""",
    "wiki/entities/CNC-001.md": """---
title: CNC-001 数控机床
---

# CNC-001 数控机床

## 基本信息

- **型号**: FANUC Series 0i-MF
- **位置**: 车间 A-3
- **安装日期**: 2022-06-15

## 关联主题

- [[topics/主轴故障|主轴故障]]
- [[topics/伺服报警|伺服报警]]

## 维修记录

参见 [[sources/维修手册-001|维修手册 001]] 中的 WX250107002 工单。
""",
    "wiki/entities/PLC-003.md": """---
title: PLC-003 可编程控制器
---

# PLC-003 可编程控制器

## 基本信息

- **型号**: Siemens S7-1200
- **位置**: 车间 B-1

## 关联

- [[topics/通信故障|通信故障]]
""",
    "wiki/topics/主轴故障.md": """---
title: 主轴故障
---

# 主轴故障诊断

## 常见症状

1. 主轴异响
2. 转速不稳定
3. 报警代码 ALM-401

## 处理方法

1. 检查主轴轴承润滑
2. 确认编码器连接
3. 参考 [[entities/CNC-001|CNC-001]] 历史维修记录

## 相关工单

- WX250107002
""",
    "wiki/topics/伺服报警.md": """---
title: 伺服报警
---

# 伺服报警处理

## 报警代码对照

| 代码 | 含义 | 处理 |
|------|------|------|
| SV0401 | 伺服准备未完成 | 检查电源 |
| SV0404 | 伺服就绪信号异常 | 检查接线 |

关联设备：[[entities/CNC-001|CNC-001]]
""",
    "wiki/topics/故障诊断.md": """---
title: 故障诊断
---

# 故障诊断流程

## 标准流程

1. **现象确认** — 记录报警代码与操作步骤
2. **初步排查** — 查阅 [[sources/维修手册-001|维修手册]]
3. **深度分析** — 使用诊断工具
4. **修复验证** — 试运行并记录

## 子主题

- [[topics/主轴故障|主轴故障]]
- [[topics/伺服报警|伺服报警]]
- [[topics/通信故障|通信故障]]
""",
    "wiki/topics/通信故障.md": """---
title: 通信故障
---

# 通信故障

## PROFINET 通信异常

常见于 [[entities/PLC-003|PLC-003]] 等设备。

### 排查步骤

1. 检查网线连接
2. 确认 IP 配置
3. 重启通信模块
""",
    "wiki/sources/维修手册-001.md": """---
title: 维修手册 001
---

# 维修手册 001 — CNC 系列

## 工单 WX250107002

| 字段 | 值 |
|------|-----|
| 设备 | [[entities/CNC-001|CNC-001]] |
| 故障类型 | [[topics/主轴故障|主轴故障]] |
| 现象 | 主轴 ALM-401 报警 |
| 原因 | 主轴轴承磨损 |
| 处理 | 更换轴承，重新润滑 |
| 状态 | 已修复 |

## 工单 WX250108015

| 字段 | 值 |
|------|-----|
| 设备 | [[entities/PLC-003|PLC-003]] |
| 故障类型 | [[topics/通信故障|通信故障]] |
| 状态 | 处理中 |
""",
    "raw/手册/CNC操作指南.pdf.md": """---
title: CNC 操作指南（MarkItDown 转换）
---

# CNC 操作指南

> 此文件为 raw 原件经 MarkItDown 转换后的中间产物。

参见结构化页面 [[sources/维修手册-001|维修手册 001]]。
""",
}

# 运行时内存存储（支持编辑保存）
_pages: dict[str, str] = deepcopy(MOCK_PAGES)


def get_all_pages() -> dict[str, str]:
    return _pages


def get_page(rel_path: str) -> str | None:
    return _pages.get(rel_path)


def save_page(rel_path: str, content: str) -> None:
    _pages[rel_path] = content


def list_entries() -> list[dict[str, Any]]:
    """返回文件树条目"""
    entries: list[dict[str, Any]] = []
    dirs_seen: set[str] = set()

    for path in sorted(_pages.keys()):
        parts = path.replace("\\", "/").split("/")
        for i in range(len(parts) - 1):
            dir_path = "/".join(parts[: i + 1])
            if dir_path not in dirs_seen:
                dirs_seen.add(dir_path)
                entries.append({"relPath": dir_path, "isDirectory": True})

        entries.append({"relPath": path, "isDirectory": False})

    return entries


def get_stats() -> dict[str, int]:
    raw_files = sum(1 for p in _pages if p.startswith("raw/") and not p.endswith("/"))
    wiki_flat = sum(
        1
        for p in _pages
        if p.startswith("wiki/") and p.count("/") == 1 and p.endswith(".md")
    )
    sources = sum(1 for p in _pages if p.startswith("wiki/sources/"))
    entities = sum(1 for p in _pages if p.startswith("wiki/entities/"))
    topics = sum(1 for p in _pages if p.startswith("wiki/topics/"))
    return {
        "rawFiles": raw_files,
        "wikiFlatMd": wiki_flat,
        "sources": sources,
        "entities": entities,
        "topics": topics,
    }
