# AGENTS.md

## 项目状态
全新项目，尚未搭建。唯一权威设计文档：`docs/superpowers/specs/2026-08-08-vhplayer-design.md`（用户已确认，实施前必须先读它）。

## 已确定的技术决策（勿擅自更改）
- Electron + React + Vite，渲染进程用 Zustand 管理状态
- 播放内核：HTML5 `<video>` + hls.js（m3u8）+ flv.js（FLV）
- 持久化：electron-store；列表格式 `.mhlb`（JSON 封装）
- m3u8 下载转 MP4：ffmpeg-static，仅 remux（`-c copy`）
- 打包：electron-builder，Windows NSIS 安装包
- 无框架（不用 UI 组件库），样式自定义，参考抖音沉浸式风格

## 架构关键约束
- 主进程持窗口形态状态机（window/fullscreen/mini）；**切换视频时绝不触碰窗口 bounds/形态**，窗口操作仅由用户触发
- 播放器多实例化：`instances` 固定 4 个槽位（分屏 2x2），每个实例独立播放列表/音量/倍速/进度；全局控制作用于活动格
- 沉浸式：无外置菜单栏/标题栏，`frame: false`，标题区 `-webkit-app-region: drag`，播放区 `no-drag`；所有交互在播放区域内（hover 控制列 + 右键菜单）
- 鼠标静止 2.5s 隐藏底部控制列（mousemove 重置计时器）
- 渲染进程通过 contextBridge 暴露的 IPC API 访问主进程，勿直接使用 Node API

## 开发命令（约定，搭建后生效）
- `npm run dev` 开发运行
- `npm run build` + electron-builder 出安装包
- 单元测试：Jest（播放核心、窗口状态机、存储 round-trip）

## 语言
- 界面文案与代码注释使用简体中文
- 所有输出使用简体中文
