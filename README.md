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
- **双重伏笔系统** — 正伏笔（AI 自动回溯）+ 逆伏笔（作者手动设计），详见下方
- **状态卡片** — 每个节点独立维护角色/世界状态，AI 写作时增量更新，绝不丢失已有信息
- **写作规则** — 全局文风设定，始终置于上下文开头
- **多项目管理** — 项目间完全隔离，支持密码保护、导入导出与备份
- **目标字数** — 节点级字数下限控制，保证章节完整性

---

## 双重伏笔系统

这套伏笔机制源自作者自身的写作经验。

作者有一个朋友也写小说，两人的伏笔风格截然不同——朋友写的伏笔一眼就能看出是伏笔，而作者写的伏笔读者却毫无察觉。经过反复讨论才发现原因：**作者的伏笔在变成伏笔之前根本不是伏笔。** 它们只是无意中写下的一些小细节，直到后面的剧情需要一个合理解释时，才回头发现——这个细节恰好能用。

这种"先写后用"的意外感，和"先设计后埋线"的精密感，是两种完全不同的阅读体验。叙事工坊将它们分别实现为两套机制：

### 正伏笔 — 回溯式的意外

正伏笔不需要提前设计。它是 AI 在续写故事时自动完成的行为：回溯上文中已经写过的细节——一个不经意提到的物件、一句随口说的话、一个看似无关的场景描写——将它编织进当前剧情，让读者突然意识到"这个东西前面竟然早就写过了"。

这种伏笔的惊喜感来自**直接**：读者看到过这个细节，但没在意。当它在关键时刻发挥作用时，读者的第一反应不是"作者真厉害"，而是"等等，这个我好像见过"。

AI 每次写作后会自动生成一份**正伏笔小传**，记录本次使用了哪些上文细节、出自哪里、起了什么作用，同时列出一组**待选素材**——上文中值得在后续利用但本次未用的细节。你可以在对话中主动引导 AI 使用某个候选项。

### 逆伏笔 — 设计式的欺骗

逆伏笔是作者刻意安排的隐藏信息。你在伏笔面板中设计一个**隐藏真相**（比如某个角色其实是卧底），AI 会在故事中植入暗示，但同时**用剧情歪曲暗示的含义**——让读者和主角一同被误导，完全往相反的方向理解。

这种伏笔的惊喜感来自**欺骗**：读者不是没看到线索，而是线索被包裹在一个错误的理解框架里。当真相揭露时，读者回想起那些暗示，发现它们一直在指向正确答案——只是自己被骗了。

逆伏笔需要手动创建和管理。你设定隐藏真相和暗示/误导方式，AI 负责在写作中执行，直到你决定在合适的时机回收它。

---

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
