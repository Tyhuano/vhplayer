# VHplayer P6：Windows 安装包 + GitHub 公开发布计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 产出 Windows NSIS 安装包（含 ffmpeg-static 解包、自定义图标、国内镜像配置），并把源码公开到 GitHub（README 中文说明 + AI vibe coding 标注 + MIT LICENSE），可选发布 v0.1.0 Release 附带安装包。

**Architecture:** electron-builder 26 + electron-vite 构建产物 `out/`；`asarUnpack` 解包 ffmpeg-static 二进制（asar 内无法 spawn，`asarUnpackPath()` 把 `app.asar` 重定向到 `app.asar.unpacked`）；国内网络 github 不可达 → electron zip 走 npmmirror（`electronDownload.mirror`），NSIS/winCodeSign 走 `ELECTRON_BUILDER_BINARIES_MIRROR`；图标自绘（Feather play 图形，MIT，与项目图标同源）。

**前置依赖:** P1-P5 已完成并验收（195 用例全绿）。spec §11：`npm run build` + electron-builder 生成 Windows NSIS 安装包；spec §7 已知打包体积约 +80MB（ffmpeg-static）。

## 已确认决策（用户 2026-08-09）

1. **GitHub 仓库**：公开仓库 `vhplayer`，用户提供 PAT Token（repo 权限，仅本次使用，不入库不写入 git config）
2. **README/LICENSE 署名**：tohua；README 中文 + 顶部 AI vibe coding 标注
3. **应用图标**：公开图标库（Feather/MIT）play 图形自绘生成 `build/icon.ico`（品牌红 #FE2C55 圆角方块 + 白色播放三角）
4. **Release**：tag v0.1.0 + 上传安装包（可选加分项，需 PAT 权限）

## 轻量资源约束（延续 P1-P5 硬性要求）

1. 新增依赖仅 `electron-builder`（devDependencies）；图标生成脚本用临时 pngjs（--no-save，不留依赖）
2. `dist/` 由 .gitignore 忽略；安装包不入库（走 GitHub Release）
3. 打包不触碰任何运行时代码路径（仅构造器 ffmpeg 路径新增 asar 重定向，dev 行为不变）

## Task 1: 打包配置与 asar 路径处理

**Files:**
- Modify: `package.json`（devDeps + `dist` script + 镜像环境变量）
- Create: `electron-builder.yml`
- Modify: `src/main/downloadService.ts`（`asarUnpackPath`）
- Modify: `src/main/__tests__/downloadService.test.ts`

- [x] 安装 electron-builder
- [x] electron-builder.yml：appId/productName/files/asarUnpack/nsis(oneClick=false 可改目录)/icon
- [x] `asarUnpackPath` 纯函数（幂等）+ 2 个单测；构造器应用（16 用例全绿）
- [x] `dist` script：`npm run build && set ELECTRON_BUILDER_BINARIES_MIRROR=...&& electron-builder --win`
- [x] `electronDownload.mirror: https://npmmirror.com/mirrors/electron/`（yml 持久化）

## Task 2: 应用图标

- [x] PowerShell System.Drawing 自绘尝试（多次语法/重载受阻 → 弃用）
- [x] 改用 Node + pngjs（--no-save）：圆角方块 + Feather play 三角逐像素绘制 512/256 PNG + 内嵌 PNG 的 ICO
- [x] 校验：PNG 256x256 rgba 262144、ICO header/count/bpp/size/offset、内嵌 PNG 可解
- [x] 产物落 `build/icon.ico`（+ icon-512/256.png 源文件）、脚本落 `scripts/generate-icon.js`（注释说明需 pngjs）

## Task 3: 构建验证与产物

- [x] typecheck 无报错；jest 195 用例全绿（含新增 2 个 asar 用例）
- [x] `npm run dist`：首次 github 超时（600s got 超时）→ 镜像修复
- [x] 产物 `dist/VHplayer-Setup-0.1.0.exe`（121.4MB）、`app.asar.unpacked/node_modules/ffmpeg-static/ffmpeg.exe` 存在
- [x] win-unpacked 版冒烟运行 8s 无崩溃
- [x] 提交（本计划 + 配置 + 图标 + asar 修复）

## Task 4: README/LICENSE 标准件

- [ ] `README.md`：AI vibe coding 徽章与声明、功能特性、技术栈、安装使用（Release + 开发构建）、快捷键表、m3u8 下载说明、项目结构、许可证
- [ ] `LICENSE`：MIT，版权 tohua（2026）
- [ ] 敏感检查：.gitignore 已忽略 node_modules/out/dist/*.log；git status 复核

## Task 5: GitHub 创建 + 推送

- [ ] PAT 创建公开仓库 `vhplayer`（API `POST /user/repos`）
- [ ] `git remote add origin https://github.com/<user>/vhplayer.git`（remote 不含 Token）
- [ ] push main（临时 URL 带 Token 一次性推送）
- [ ] 验证：仓库可访问、README/LICENSE/源码齐全
- [ ] tag `v0.1.0` + 创建 Release 上传 `dist/VHplayer-Setup-0.1.0.exe`

---

## 自我审查记录（Self-Review）

**Spec 覆盖：** §11 交付物（NSIS 安装包）→ Task 1/3；ffmpeg-static 体积认知 → 产物 121.4MB（压缩后）符合预期；安装包下载目录/自动续播/下载功能均不因打包回归（asar 路径重定向有单测 + 冒烟验证）。

**网络对策：** github.com 不可达（20.205.243.166:443 ETIMEDOUT）→ electron zip（npmmirror/electron）与 builder 二进制（ELECTRON_BUILDER_BINARIES_MIRROR）双镜像；镜像 URL 已连通性预检（200）。`dist` script 用 cmd `set` 语法（Windows npm scripts 默认 cmd.exe）。

**类型一致性：** `asarUnpackPath` 仅作用于构造器 ffmpeg 路径；测试断言 dev 路径不变（`C:\node_modules\...` 无 `app.asar`）与 asar 路径替换后 spawn 可用；幂等保证重复调用安全。

**占位符扫描：** 无 TBD；Task 5 需用户 PAT（执行时向用户索取，Token 不落盘）。
