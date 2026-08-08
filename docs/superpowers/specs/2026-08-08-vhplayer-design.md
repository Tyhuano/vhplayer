# VHplayer 设计文档

日期：2026-08-08
状态：待评审

## 1. 需求概述

基于 Electron 构建的轻量视频播放器，抖音风格、沉浸式、无外置菜单。

### 功能要求
1. 抖音风格：无边框，视频标题在播放区域左上侧，所有操作在播放区域内完成
2. 播放列表切换视频时，不重置播放窗口大小与形态
3. 从文件夹打开播放列表
4. 从 m3u8 播放
5. 通过网络流或视频创建播放列表
6. 收藏功能：参考抖音收藏，收藏夹本身也是一个功能列表
7. 自建播放列表：存软件特定格式文件（.mhlb），可加载/导出；内部也可保存
8. 轻量播放器该有的能力：基础控制、倍速、画面缩放模式、循环/随机、键盘快捷键、记忆播放位置
9. 允许拖动任意边缘放大/缩小播放器，视频随窗口自动跟随
10. 补充：m3u8 网络流本地下载为 MP4 视频流
11. 补充：类似监控的 4 分屏功能，分屏后根据视频本身尺寸初始化分屏大小，每块分屏允许不同的播放列表
12. 补充：右键设置菜单
13. 补充：播放时鼠标静止，播放区域下方的操作列隐藏
14. 补充：整个播放器仅有播放区域，不做任何外置菜单

## 2. 技术选型

- Electron（Windows 平台，frameless，resizable）
- React + Vite（渲染进程）
- Zustand（状态管理）
- HTML5 `<video>` + hls.js（m3u8/HLS）、flv.js（FLV 流）
- electron-store（持久化）
- ffmpeg-static（m3u8 下载转封装）
- electron-builder（Windows 安装包）

### 支持格式
- 本地文件：mp4、webm、ogv、mov（浏览器可解码的容器）
- 网络流：m3u8（HLS，hls.js）、flv（flv.js）、http/https 直链视频

## 3. 架构

```
Electron (Windows, frameless, resizable)
├── 主进程 (main)
│   ├── WindowManager     窗口形态状态机（window/fullscreen/mini）
│   ├── DialogService     打开文件夹/文件、保存对话框、导入/导出 .mhlb
│   ├── DownloadService   ffmpeg 下载 m3u8 → mp4，进度上报
│   ├── StoreService      持久化（electron-store）：列表、收藏、记忆位置、设置
│   └── IPC 桥            contextBridge 暴露安全 API
└── 渲染进程 (React + Vite)
    ├── PlayerCore        <video> + hls.js/flv.js 封装，多实例（最多 4 个）
    ├── 状态管理           Zustand：viewMode、instances、playlists、favorites、settings
    ├── 组件
    │   ├── PlayerGrid    单屏/2x2 分屏布局
    │   ├── PlayerView    单个播放器（视频 + hover 控制列 + 标题 + 右上按钮）
    │   ├── ControlsBar   底部控制列（鼠标静止自动隐藏）
    │   ├── ContextMenu   右键菜单
    │   ├── SidePanel     播放列表/收藏/来源（右侧滑出面板）
    │   ├── MiniUI        置顶小窗紧凑 UI
    │   └── DownloadPopup 下载进度提示
    └── 窗口交互层         拖拽区域（-webkit-app-region）、边缘缩放（系统原生）
```

## 4. 数据模型

```ts
type SourceType = 'file' | 'url' | 'm3u8' | 'flv';

interface MediaItem {
  id: string;
  title: string;
  sourceType: SourceType;
  value: string;              // 文件绝对路径或 URL
  duration?: number;
  lastPosition?: number;      // 记忆播放位置
}

interface Playlist {
  id: string;
  name: string;
  items: MediaItem[];
  createdAt: number;
}

type PlayMode = 'order' | 'loop' | 'random';   // 顺序/循环/随机

interface PlayerInstance {
  id: number;                 // 0-3
  playlistId: string | null;
  currentIndex: number;
  playMode: PlayMode;
  isPlaying: boolean;
  volume: number;             // 0-1
  rate: number;               // 倍速 0.5-3
  scaleMode: 'contain' | 'fill'; // 画面缩放模式
}

interface AppState {
  viewMode: 'single' | 'grid';
  activeInstance: number;     // 活动格
  instances: PlayerInstance[];
  playlists: Playlist[];
  favorites: Playlist;        // 收藏夹
  settings: { downloadDir: string; autoResume: boolean };
}
```

### 分屏实例规则
- `instances` 固定 4 个槽位，视图模式下全部渲染（grid）或仅活动格渲染（single）
- 每个实例独立持有播放列表/进度/音量/倍速 → 满足"每块分屏允许不同的播放列表"
- 点击格子切换活动格；全局控制（收藏、列表、下载、快捷键）作用于活动格

### .mhlb 文件格式
JSON 封装：`{ version: 1, name: string, items: MediaItem[] }`
- 导出：任意播放列表/收藏 → .mhlb
- 导入：读取 .mhlb → 生成新播放列表加入 `playlists`

### 持久化（electron-store，userData 目录）
- `playlists`、`favorites`、`settings`、各实例状态（音量/倍速/模式/最后播放项）

## 5. 窗口形态管理（需求 2/9 核心）

主进程持有 `WindowState = { mode: 'window'|'fullscreen'|'mini', bounds }`。

- **切换视频绝不触碰窗口 bounds/形态**：渲染进程仅替换 video src 与标题，所有窗口操作仅由用户触发（按钮/快捷键）
- 全屏：`win.setFullScreen(true)`，ESC/按钮退出
- 置顶小窗：`setAlwaysOnTop(true)` + 按比例缩小 bounds + 紧凑 UI（隐藏列表/控制列精简）；退出恢复原 bounds
- 无边框：`frame: false`；播放区域上方细条区域（标题栏）为拖拽区 `-webkit-app-region: drag`，播放区域 `no-drag`
- 边缘缩放：Windows frameless + `resizable: true` 系统原生支持任意边缘拖拽；视频层 100% 宽高 + `object-fit: contain` 自动跟随

## 6. 4 分屏（需求 11）

- 布局切换：1x1 ↔ 2x2（Grid 组件，每格等分窗口）
- **进入分屏时初始化窗口尺寸**：读取各格视频 `videoWidth/videoHeight`，取平均（或首个有效值）宽高比，计算使 2x2 网格完整显示的窗口 bounds，主进程 `setBounds`
- 每格独立：hover 控制、独立列表、独立播放进度
- 活动格：高亮边框（抖音式白色描边）

## 7. m3u8 下载为 MP4（需求 10）

- 内置 `ffmpeg-static`（打包体积约 +80MB）
- 流程：右键菜单/控制栏 → 保存对话框 → 主进程 spawn `ffmpeg -i <m3u8> -c copy <out.mp4>`（remux 转封装，不重编码，无损快速）→ 解析 stderr 进度（`time=` 字段）→ IPC 上报渲染进程 → 控制栏/角标显示进度 → 完成通知
- 失败处理：网络中断/无效源 → 提示错误，删除半成品文件
- 兜底：无 ffmpeg 二进制时禁用下载并提示

## 8. UI 与交互（沉浸式，需求 1/4/12/13/14）

- **无外置菜单**：窗口无菜单栏，全部交互在播放区域内
- 布局：视频区 100% 铺满；左上角标题（hover 显示）；右上角按钮组（分屏切换/收藏/下载/置顶/全屏/设置）
- 底部控制列：hover 播放区域出现；**鼠标静止 2.5s 自动隐藏**（mousemove 重置计时器）；含进度条（拖拽 seek、记忆位置标记点）、播放/暂停、上一集/下一集、倍速、音量/静音、播放模式循环/随机
- 右键菜单：播放/暂停、上一集/下一集、播放模式、倍速（0.5x-3x）、画面缩放模式、收藏/取消收藏、下载 MP4（m3u8 时可用）、打开播放列表、来源管理（文件夹/m3u8 URL/网络流）、导入/导出 .mhlb、设置
- 侧滑面板（播放区域内右侧滑出）：播放列表（拖拽排序、删除、清空）、收藏夹、来源新增
- 设置菜单（右键 → 设置，或右上齿轮）：下载目录、自动续播开关、记忆位置开关
- 快捷键：空格 播放/暂停、←/→ 快退快进 5s、↑/↓ 音量、M 静音、F 全屏、P 置顶小窗、G 分屏切换、L 打开列表、Esc 退出全屏/关闭面板
- 记忆播放位置：退出/切换视频时保存 `lastPosition`，重新打开提示并续播（`autoResume` 开启时自动续播）；进度条标记点显示

## 9. 错误处理

| 场景 | 处理 |
|------|------|
| 文件不存在/被删除 | 播放器显示错误浮层，自动跳到列表下一项 |
| m3u8/URL 加载失败 | hls.js error 事件 → 错误浮层，可选重试/下一项 |
| 未支持的格式 | 统一错误浮层（codec 不支持提示） |
| 下载失败 | 删除半成品，提示错误 |
| .mhlb 解析失败 | 提示文件格式错误，不写入列表 |
| 窗口形态切换异常 | 回退到 window 模式 |

## 10. 测试策略

- 播放核心：hls.js 加载、源切换、进度记忆（单元测试用 Jest + jsdom mock video）
- 状态机：WindowState 三形态转换（单元测试）
- 列表持久化：electron-store 读写 round-trip（单元测试）
- 手动验收清单：10 条需求逐项验证（含分屏窗口初始化尺寸、鼠标静止隐藏、边缘缩放跟随）

## 11. 交付物

- `npm run dev` 开发运行
- `npm run build` + electron-builder 生成 Windows NSIS 安装包
