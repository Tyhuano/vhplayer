# VHplayer P7：多平台短视频信息流聚合（平台接入系列总规划 + P7 接口探针）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 以**独立扩展**方式接入 B站/快手/抖音短视频：抖音式全屏竖屏信息流（自动播放可开关）、抖音风格信息展示（平台徽标/标题/作者/视频编号）、平台视频收藏（与本地收藏区分）、「在官方端打开」、主题关键词聚合（多平台同类型视频混合流）、信息流卡片复用现有下载能力。

**Architecture:** 平台代码全部落在独立目录（`src/shared/platform`、`src/main/platform`、`src/renderer/src/platform`），**不改动既有核心**（playerCore/PlayerView/appStore/types/DownloadService/窗口状态机/分屏）；平台请求走主进程独立 Service（注入 fetch 可单测，规避 CORS、接口变更单点维护、cookie 不出主进程）；信息流用独立 `PlatformPlayer`（自建 video + dash.js）与独立 `platformStore`（zustand 独立实例）；平台持久化用独立 electron-store key（`platform.*`），与既有 config 结构互不干扰。最小侵入面仅 2 处新增：`App.tsx` 挂载 `<PlatformOverlay />`、`ContextMenu.tsx` 新增「短视频信息流」入口。

**Tech Stack:** 新增依赖仅 `dash.js`（平台模块专属引用）；沿用 Electron + React 19 + Zustand 5 + Jest 30/jsdom 全链路 TDD。

**前置依赖:** P1-P6 已完成并验收（201 用例全绿 + NSIS 安装包 + GitHub 公开仓库 v0.1.0）。权威 spec：`docs/superpowers/specs/2026-08-08-vhplayer-design.md`（本系列为全新扩展，不修改既有需求）。

## 已确认决策（用户 2026-08-09）

1. **平台范围与顺序**：B站 → 快手 → 抖音，**按风险由低到高**执行
2. **B站范围**：仅接入**推荐短视频类型**（不做全量视频引入）；**需要登录**（cookie，解锁高清/原画）
3. **抖音**：利用**抖音网页版**解析（信息流接口 + 分享链接/页面解析兜底），实验性，接受接口不稳定与合规风险
4. **快手**：接入快手短视频（网页版 graphql）
5. **类型聚合**：多平台尽可能推荐同类型视频（主题关键词池 + 聚合器混合流）；聚合结果以平台实际返回为准，不做审核规避
6. **信息流形态**：抖音式全屏竖屏信息流；**自动播放可开关**（用户选择）
7. **信息展示**：抖音风格——平台来源标注 + 视频名称 + 视频编号（BV 号/抖音视频编号/快手 photoId 等）
8. **收藏**：平台视频可收藏；收藏列表**区分本地收藏与平台模式**；收藏后可从收藏列表打开播放；提供「在官方端收藏点赞」入口（打开源页面）
9. **独立扩展**：不影响项目已有能力（代码/数据/运行时三层隔离）
10. **最小侵入**：仅 `App.tsx` 挂载 1 行 + `ContextMenu` 1 项，其余全部独立
11. **下载**：信息流卡片提供「下载」按钮，**复用现有 DownloadService**（durl mp4 直链 remux 下载；DASH 合并下载列为后续增强）

## 轻量资源约束（延续 P1-P6 硬性要求）

1. 新增依赖仅 `dash.js`（npm 依赖层面零新增其余项，无 UI 库）
2. 平台数据（cookie/平台收藏/主题偏好/自动播放开关）走**独立 electron-store key（`platform.*`）**，不纳入既有 StoreSnapshot 结构；旧数据向后兼容
3. **平台播放绝不触碰窗口 bounds/形态**；信息流模式与本地播放/分屏/下载完全解耦
4. 平台请求/播放失败独立降级提示，不影响本地播放器任何状态
5. cookie 仅存主进程（IPC 写入 store），不落日志、不进 git、不暴露给渲染进程

## 总阶段规划（P7-P12，按风险由低到高）

| 阶段 | 内容 | 关键点 | 风险 | 状态 |
|------|------|--------|------|------|
| P7 | 平台接口探针 | 实测 B站短视频 feed/搜索、快手 graphql、抖音网页版签名难度；产出接口锁定文档 | 低 | 本计划 |
| P8 | B站短视频信息流 | `BiliService`（feed/搜索/view/playurl + cookie）+ dash.js + 信息流 UI + 收藏 + 官方端打开 + 下载按钮 | 低 | 待 P7 结论 |
| P9 | 主题聚合框架 | `AggregatorService`：关键词池（预设+自定义）→ 多平台并行同主题 → 去重混合排序；先 B站单平台 | 低 | 待 P8 |
| P10 | 快手接入 | `KuaishouService`（graphql feed/搜索/详情）+ 聚合扩展 | 中 | 待 P9 |
| P11 | 抖音网页版 | a_bogus 签名实现（评估失败则降级分享链接/页面解析）+ 信息流 | 高 | 待 P10 |
| P12 | 收尾 | UI 打磨（标签池管理/封面流性能/自动播放）、全量回归验收 | — | 待 P11 |

## 统一数据模型（P7 落盘，P8 起实施）

```ts
// src/shared/platform/types.ts（独立文件，不触碰 shared/types.ts）
export type Platform = 'bili' | 'douyin' | 'kuaishou'

export interface PlatformVideo {
  platform: Platform
  videoId: string          // BV 号 / aweme_id / photoId
  title: string
  author?: string
  cover: string
  playUrl?: string         // 解析后的直链（可失效，播放/下载时实时 resolve）
  pageUrl: string          // 官方页面（「官方端打开」用）
  duration?: number
  width?: number
  height?: number
  bili?: { bvid: string; cid: number }   // B站专用元数据
}
```

## Task 1: P7 接口探针（本计划核心交付）

**目标**：实测三平台网页端可用接口，锁定 P8-P11 技术方案与降级路径。全部为只读请求（不写代码）。

- [ ] **Step 1: B站短视频 feed 与搜索接口探针**

候选接口逐一实测（`-Uri` + UA/Referer 头，未登录态）：

1. 视频信息：`GET https://api.bilibili.com/x/web-interface/view?bvid=` → 记录返回结构（标题/cid/时长/封面/宽高）
2. 播放地址：`GET https://api.bilibili.com/x/player/playurl?bvid=&cid=&qn=&fnval=` → 记录 durl（mp4 直链）与 DASH 两条路径的可用性/清晰度（未登录与带 cookie 两种态）
3. 推荐 feed：候选 `GET https://api.bilibili.com/x/web-interface/video/feed?tid=`、动态流接口、短视频频道页（`bilibili.com/video/shorts` 页面数据）→ 确认**短视频类型**可用的信息流接口与参数（未登录态）
4. 搜索：`GET https://api.bilibili.com/x/web-interface/search/type?search_type=video&keyword=` → 记录可用性（未登录态）

输出到 `docs/`（新文件 `docs/platform/bilibili-api-notes.md`）：
- 接口清单（URL/参数/响应路径/未登录限制/清晰度）
- 短视频 feed 最终选型（若候选全不可用则记录降级：搜索接口按关键词拉取）
- cookie 登录对清晰度的影响实测数据

- [ ] **Step 2: 快手网页版探针**

候选接口逐一实测：

1. 视频详情：`POST https://www.kuaishou.com/graphql` body `visionVideoDetail`（videoId）→ 记录直链字段（photo.photoUrl）与签名要求
2. 信息流：graphql `visionFeedList`（web 端 client_key、did 要求）→ 记录可用性
3. 搜索：graphql `visionSearchPhoto`（keyword）→ 记录可用性
4. 首屏页面数据（`https://www.kuaishou.com/` HTML 内嵌 JSON）作为兜底评估

输出 `docs/platform/kuaishou-api-notes.md`：接口清单/签名参数/未登录限制/降级路径。

- [ ] **Step 3: 抖音网页版评估**

1. 推荐流：`GET https://www.douyin.com/aweme/v1/web/tab/feed/`（无签名直调）→ 记录错误码与签名要求（a_bogus/X-Bogus/msToken）
2. 搜索：`aweme/v1/web/general/search/single/` 同上
3. 页面数据兜底：分享链接（`v.douyin.com` 短链）与详情页 HTML 内嵌数据（`_ROUTER_DATA`/`RENDER_DATA`）提取直链的可行性
4. 签名复杂度评估：a_bogus 算法在 Node 侧实现的成本（代码量/混淆程度/更新频率）→ 结论：实现 / 降级链接解析

输出 `docs/platform/douyin-api-notes.md`：实测记录 + 签名成本评估 + 降级路径决策。

- [ ] **Step 4: 探针结论汇总与选型落盘**

`docs/platform/platform-decision.md`：三平台最终方案（主方案 + 降级路径 + 未登录/登录能力矩阵），供 P8-P11 各计划引用。

- [ ] **Step 5: 验证与提交**

- 提交：`docs/platform/*`（3 份接口笔记 + 1 份决策）
- 提交信息：`docs: P7 平台接口探针结论（B站/快手/抖音能力矩阵与方案选型）`

## Task 2（预留，P8 起）：后续阶段计划将在各阶段开始前单独落盘，引用本计划与 `platform-decision.md`

---

## 风险登记（随阶段更新）

| 风险 | 等级 | 对策 |
|------|------|------|
| 平台接口/签名变更 | 高（抖音）/中（快手）/低（B站） | 主进程单点 Service + 优雅降级 + 独立接口笔记维护 |
| 抖音 a_bogus 逆向不可行 | 高 | P7 探针评估后降级为分享链接/页面解析（仍可用，非信息流） |
| 主题关键词被平台限流 | 中 | 聚合结果以平台返回为准，不做审核规避；关键词池可自定义 |
| cookie 泄露（本机明文） | 中 | 仅主进程持有、UI 风险提示、不进日志/git；后续可评估 DPAPI 加密 |
| 信息流性能（封面流/长列表） | 中 | 分页拉取 + 封面懒加载 + 视频预加载控制 |

## 测试策略（P8 起执行，延续 TDD）

- 纯函数：平台 ID/链接解析、feed 归一化、聚合去重排序、签名实现
- 主进程 Service：mock fetch 全链路（feed/search/view/playurl/解析）
- PlatformPlayer dash 分支、信息流组件、platformStore actions、平台收藏持久化 round-trip
- 既有 201 用例基线零回归（独立目录隔离验证）

## 验收（P12 手动清单，预留）

- 三平台信息流可拉取播放、上下滑动切换、自动播放开关生效
- 信息卡显示平台徽标/标题/作者/编号；「官方端打开」跳转源页面
- 平台视频收藏 → 收藏列表「平台」视图 → 重新打开可播（直链过期自动重取）
- 主题聚合：输入关键词 → 多平台同主题混合流
- cookie 登录后清晰度提升（B站/快手实测）
- 信息流卡片下载 → 复用现有下载流程产出 mp4
- 回归：本地播放/分屏/下载/原有收藏/窗口形态零回归

---

## 自我审查记录（Self-Review）

**Spec 覆盖：** 本系列为既有 spec 之外的新扩展，未修改既有需求；「独立扩展不触碰窗口 bounds/形态」延续架构关键约束；下载复用 P5 的 DownloadService（durl 直链 remux），不新增下载代码路径。

**隔离性核对：** 目录隔离（shared/main/renderer 三处 platform 独立目录）、数据隔离（`platform.*` store key）、运行时隔离（PlatformPlayer 自管 video、不注册进 videoRegistry）、依赖隔离（dash.js 仅平台模块引用）——既有 201 用例与全部组件零改动。

**占位符扫描：** P7 为只读探针（无代码占位）；P8-P12 明确标注"待探针结论后单独落盘"，无伪实现；探针输出物（4 份文档）路径已定。

**风险诚实性：** 抖音签名可行性在 P7 实测评估，不预先承诺信息流可用；降级路径（链接解析）作为保底方案写入决策。
