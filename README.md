# 叙事工坊 · Story Forge

> AI-driven branching story editor — write, branch, and weave your narrative.

![License](https://img.shields.io/badge/license-GPL%20v3-blue)
![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey)
![Tauri](https://img.shields.io/badge/Tauri-2.0-orange)

---

## 简介

叙事工坊是一款基于节点树的 AI 辅助小说创作工具。每个章节是一个节点，节点可以分支派生出「if 线」，AI 沿着节点链向上读取上文，帮你续写、修改或开拓新的剧情走向。

## 核心功能

- **节点树编辑** — 故事以树状结构组织，每个节点独立编辑，左侧内容右侧对话
- **分支派生** — 任意节点可派生 if 线，分支携带父节点的故事与状态
- **AI 续写** — 对话驱动，AI 自动读取当前节点到根节点的完整上文
- **伏笔管理** — 伏笔列表跟踪剧情走向，已回收伏笔自动归档至状态卡
- **状态卡片** — 每个节点独立维护角色/世界状态，派生时自动继承并演化
- **写作规则** — 全局文风设定，始终置于上下文开头
- **多项目管理** — 项目间完全隔离，支持密码保护、导入导出与备份
- **目标字数** — 节点级字数下限控制，保证章节完整性

## 下载安装

前往 [Releases](https://github.com/NightPoetry/story-forge/releases) 下载对应平台安装包：

| 平台 | 文件格式 |
|------|---------|
| macOS (Apple Silicon / Intel) | `.dmg`（通用二进制） |
| Linux | `.AppImage` / `.deb` |
| Windows | `.exe`（NSIS 安装包） |

## 从源码运行

### 环境要求

- [Node.js](https://nodejs.org/) 18+
- [Rust](https://rustup.rs/) stable
- [Tauri 2 CLI](https://v2.tauri.app/start/prerequisites/)

> macOS 需要 Xcode Command Line Tools；Linux 需要 `libwebkit2gtk-4.1-dev` 等系统依赖，详见 [Tauri 文档](https://v2.tauri.app/start/prerequisites/#linux)。

### 安装与启动

```bash
git clone https://github.com/NightPoetry/story-forge.git
cd story-forge
npm install
```

```bash
# 纯浏览器开发（无桌面功能，数据存 localStorage）
npm run dev          # 打开 http://localhost:1420

# Tauri 桌面应用开发（带热重载）
npm run tauri:dev

# 生产构建
npm run tauri:build  # 产物在 src-tauri/target/release/bundle/
```

## AI 接入

在软件设置中填入：
- API Endpoint（支持 Anthropic 或 OpenAI 兼容接口）
- API Key
- 选择接口格式

## 开源协议

本项目基于 [GPL v3](LICENSE) 开源。你可以自由使用、修改和分发，但衍生项目须以相同协议开源。商业授权请联系作者。
