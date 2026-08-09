# VHplayer

[![AI Vibe Coding](https://img.shields.io/badge/AI%20Vibe%20Coding-🤖-fe2c55)](https://github.com/anomalyco/opencode)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Electron](https://img.shields.io/badge/Electron-43-47848F.svg)](https://www.electronjs.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB.svg)](https://react.dev/)

> 🚀 一个轻量、沉浸式的本地视频播放器，为「网络直播流 + 本地视频」双场景设计。
> 本项目由 **AI vibe coding** 全程协作开发（设计文档 → 分阶段实现计划 → TDD 驱动 → 逐任务提交），
> 全部功能、测试与打包均在与 AI 结对的工作流中完成。

---

## ✨ 功能特性

- **沉浸式无边框窗口**：无菜单栏/标题栏，播放区域内 hover 显示控制列，鼠标静止 2.5s 自动隐藏（抖音风格）
- **多格式播放**：本地文件（mp4/webm/mkv/mov 等）、m3u8 网络流（hls.js）、FLV 流（flv.js）
- **2x2 四格分屏**：四路独立播放，每格独立播放列表/音量/倍速/进度，活动格白色描边高亮
- **m3u8 一键下载转 MP4**：内置 ffmpeg 纯 remux（`-c copy` 无损快速），串行队列、进度浮层、失败自动清理半成品
- **播放列表 + 收藏夹**：文件夹/文件/网络流多来源，拖拽排序，收藏即用
- **记忆续播**：退出/切换自动保存播放位置，`autoResume` 开启时自动从上次位置继续
- **快捷键体系**：空格/方向键/音量键/全屏/分屏/小窗全覆盖

## 🖥️ 技术栈

| 层 | 技术 |
|----|------|
| 框架 | Electron 43 + React 19 + Vite 7（electron-vite） |
| 状态 | Zustand 5（渲染进程），electron-store（持久化） |
| 播放 | HTML5 `<video>` + hls.js + flv.js |
| 下载 | ffmpeg-static（remux 转封装） |
| 测试 | Jest 30 + jsdom（195 个用例） |
| 打包 | electron-builder（Windows NSIS 安装包） |

## 📦 安装与使用

### 方式一：直接下载安装包（推荐）

从 [GitHub Releases](../../releases) 下载 `VHplayer-Setup-0.1.0.exe`（约 121MB，已内置 ffmpeg），
安装后即可使用，**无需任何环境配置**。

### 方式二：从源码构建

```bash
# 克隆并安装依赖
git clone https://github.com/Tyhuano/vhplayer.git
cd vhplayer
npm install

# 开发运行（热更新）
npm run dev

# 单元测试（195 用例）
npm test

# 打包 Windows 安装包（输出到 dist/）
npm run dist
```

> 注：国内网络环境下 `npm run dist` 已配置 npmmirror 镜像（electron 发行包与 NSIS 工具链），无需额外设置。

### 快速上手

1. 启动后点击右上角按钮组或右键菜单，选择 **打开文件 / 打开文件夹 / 网络流**
2. 粘贴 m3u8 或 http(s) 直播流地址即可播放
3. 播放 m3u8 流时点击 **下载 MP4**，右下角浮层显示进度，完成后可「打开目录」定位文件
4. 点击 **分屏** 按钮（或按 `G`）进入 2x2 四格分屏；点击格内任意位置激活该格
5. 右键 **设置** 可配置下载目录与自动续播开关

## ⌨️ 快捷键

| 按键 | 功能 |
|------|------|
| 空格 | 播放 / 暂停 |
| ← / → | 快退 / 快进 5 秒 |
| ↑ / ↓ | 音量增减 |
| M | 静音切换 |
| F | 全屏切换 |
| P | 置顶小窗切换 |
| G | 单屏 / 2x2 分屏切换 |
| L | 打开播放列表 |
| Esc | 退出全屏 / 关闭浮层面板 |

## 🗂️ 项目结构

```
src/
├── main/          # Electron 主进程（窗口状态机、下载服务、IPC、存储、媒体扫描）
├── preload/       # contextBridge API 桥接
├── renderer/      # React 渲染进程（Zustand store、播放核心、组件、hooks）
└── shared/        # 主/渲染共享类型与工具
docs/superpowers/  # AI vibe coding 工作流产物（设计文档 + 分阶段计划 + 验收记录）
tests/             # Jest 全局 setup（window.api mock）
```

## 🤖 AI Vibe Coding 说明

本项目从设计到交付遵循 **AI vibe coding** 工作流：

- 唯一权威设计文档先行（`docs/superpowers/specs/`），确认后再动代码
- 功能分阶段（P1-P6）拆解为可执行计划，每个任务 TDD（先写测试 → 确认失败 → 实现 → 全绿 → 提交）
- 每次提交一个功能点，提交信息中文，全程可追溯
- 195 个单元测试覆盖播放核心 / 窗口状态机 / 存储持久化 / 下载服务 / 组件交互

协作栈：Claude Code / opencode + Superpowers 技能（brainstorming → writing-plans → executing-plans → TDD）。

## 📄 许可证

[MIT](LICENSE) © 2026 tohua
