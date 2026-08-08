# VHplayer P3 设计文档：侧滑面板 + 收藏 + 右键菜单

日期：2026-08-08
状态：用户已确认设计
父文档：`docs/superpowers/specs/2026-08-08-vhplayer-design.md`（需求 5/6/7/12 部分）

## 1. 范围

本阶段交付三块功能（对应父 spec 需求 5/6/7/12）：

1. **侧滑面板**（需求 5/7 部分）：右侧滑出面板，两 tab「播放列表 / 收藏」，列表支持手写拖拽排序 + 三种排序方式（名称 / 时间正序 / 时间倒序）、删除、清空。
2. **收藏功能**（需求 6）：控制栏爱心按钮 + 右键菜单「收藏/取消收藏」；收藏夹即功能列表，可点播、可移除。
3. **右键菜单**（需求 12）：全自定义样式，含播放控制 / 模式 / 倍速 / 画面缩放 / 收藏 / 打开播放列表 / 来源管理；「下载 MP4 / 导入导出 .mhlb / 设置」三项**置灰显示**（属后续阶段）。

**不在本阶段**：.mhlb 导入/导出、设置菜单、分屏（P4）、下载（P5）、打包（P6）。

## 2. 实现方案（已确认）

**方案 A：全渲染进程自研组件**
- ContextMenu / SidePanel 为 React 组件，UI 状态进 Zustand
- 拖拽排序手写 HTML5 DnD（draggable + drop 事件），不引入库
- 主进程零改动（.mhlb 导入导出涉及 dialog.save 时才扩展，属下阶段）
- 测试沿用 P2 模式（jest + jsdom + react-dom/test-utils）

已排除：方案 B（Electron 原生 Menu.popup，无法样式化、与沉浸式冲突）、方案 C（dnd-kit 等库，违反依赖最小化硬约束）。

## 3. 数据层变更

### 3.1 MediaItem 增加 createdAt

```ts
interface MediaItem {
  id: string
  title: string
  sourceType: SourceType
  value: string
  duration?: number
  lastPosition?: number
  createdAt?: number   // 新增：时间排序依据
}
```

- `mediaItemFromPath` / `mediaItemFromUrl` 生成时写入 `createdAt: Date.now()`
- 旧持久化数据缺失该字段：时间排序时回退 `0`（视为最旧），不迁移存量数据

### 3.2 appStore 新增 actions

| action | 行为 |
|---|---|
| `openPanel()` / `closePanel()` | 打开/关闭面板 |
| `setPanelTab(tab)` | 切换 tab（'lists' \| 'favorites'），tab 记忆存 store（不落盘） |
| `toggleFavorite()` | 收藏/取消收藏当前活动实例的播放项（无播放项时 no-op） |
| `removeFromFavorites(itemId)` | 从收藏夹移除单项 |
| `reorderItems(playlistId, from, to)` | 列表内拖拽排序（写回 items，走持久化） |
| `setSortMode(playlistId, mode)` | 记录排序方式 'name' \| 'timeAsc' \| 'timeDesc'（**内存态不落盘**）；展示层用 `sortItems` 纯函数按此 mode 计算顺序，**排序不改写 items 原顺序** |
| `playItemFromList(listId, index)` | 播放指定列表的指定项（更新活动实例 playlistId/currentIndex/isPlaying） |
| `setScaleMode(instanceId, mode)` | 切换 contain/fill |

- 面板 UI 状态（`panelOpen: boolean`、`panelTab`、各列表 `sortMode`）放入 `AppStore`（`AppState` 之外的新接口字段，**不纳入 StoreSnapshot 持久化**）
- 收藏/移除/重排均触发 `schedulePersist()`（沿用现有节流）

### 3.3 收藏语义（已确认）

- 收藏项为**引用复制**（快照）：收藏当前播放项时复制 `MediaItem` 入 `favorites.items`
- 去重规则：按 `item.id` 判断已存在则不重复添加
- 列表内文件删除/路径失效不影响收藏夹

## 4. 侧滑面板 SidePanel

- 右侧滑出，宽 320px，动画 0.25s，z-index 高于控制列与标题区；面板打开时播放不中断
- 结构：
  - 顶部：tab 切换「播放列表 / 收藏」+ 关闭按钮（X）
  - 播放列表 tab：
    - 添加入口按钮组：打开文件 / 文件夹 / 网络流（复用 PlayerView 现有逻辑，抽为共享函数）
    - 列表选择器（下拉）：`playlists` 可多列表，切换展示目标列表；空态显示提示
    - 排序切换按钮组：名称 / 时间正序 / 时间倒序（当前项高亮）
    - items 列表：点击项 → `playItemFromList` 切到活动实例播放；当前播放项高亮；hover 显示删除按钮（单项删除）；支持**手写拖拽排序**（拖拽占位指示，放下后 `reorderItems`）
    - 底部：「清空列表」按钮
  - 收藏 tab：
    - favorites.items 列表：点击播放、hover 显示取消收藏（爱心移除）、当前播放项高亮
- 开关：右上按钮组新增「列表」按钮 + 快捷键 L 切换 + Esc 关闭；tab 记忆（上次打开的 tab 下次保持）
- 关闭时机：Esc / 点面板外（遮罩）/ X 按钮

## 5. 右键菜单 ContextMenu

- 播放区任意位置 `onContextMenu` 阻止系统菜单并弹出自定义菜单
- 菜单项结构（顶层 + 子菜单）：

```
▶ 播放 / 暂停            （文本随 isPlaying 切换）
⏮ 上一集  /  ⏭ 下一集
播放模式 ▸  顺序 / 循环 / 随机    （当前项打勾 ✓）
倍速 ▸      0.5x / 1x / 1.5x / 2x / 3x   （当前项打勾 ✓）
画面缩放 ▸  contain（适应）/ fill（铺满） （当前项打勾 ✓）
♥ 收藏 / 取消收藏          （当前项在收藏夹时显示取消收藏；无播放项时禁用）
L 打开播放列表             （切换面板开/关）
来源管理 ▸ 打开文件 / 打开文件夹 / 网络流
─────── 分隔线 ───────
下载 MP4（置灰，P5） / 导入 .mhlb（置灰）/ 导出 .mhlb（置灰）/ 设置（置灰）
```

- 交互规则：
  - 定位：跟随鼠标，视口右/下边缘不足时自动向上/左翻转
  - 关闭：点击菜单项生效后关闭；点击外部 / Esc / 滚动 / 窗口失焦关闭
  - 菜单打开时若有面板，菜单浮于面板之上（z-index 更高）
  - 无播放项（无 playlist/列表为空）时禁用播放类菜单项
- 快捷键优先级调整（useShortcuts 的 Esc 处理）：先关右键菜单 → 再关面板 → 再退出全屏/置顶；L 键切换面板

## 6. 画面缩放（父需求 8 补齐）

- `PlayerView` 的 video `object-fit` 绑定 `instance.scaleMode`（'contain' → `contain`，'fill' → `fill`）
- 入口：右键菜单「画面缩放」子菜单；切分屏（P4）时各实例独立

## 7. 测试策略

| 范围 | 用例 |
|---|---|
| `reorder` / `sortItems` 纯函数（playlistUtils） | 重排边界（首/尾/相邻）、三种排序方式、createdAt 缺失回退 |
| store actions | 收藏去重、取消收藏、toggleFavorite 幂等、playItemFromList 更新活动实例 |
| ContextMenu 组件 | 右键弹出/点击外部关闭/Esc 关闭、菜单项回调生效、置灰项不可点、视口翻转定位 |
| SidePanel 组件 | tab 切换与记忆、点项播放、删除/清空、拖拽排序事件（模拟 dragstart/drop） |
| 回归 | 既有 39 用例保持全绿 |

- 拖拽排序的 DOM 事件在 jsdom 下用 dispatchEvent 模拟；排序算法抽为纯函数单独测
- 沿用 react-dom/test-utils + createRoot 模式（不新增 testing-library）

## 8. 错误处理

| 场景 | 处理 |
|---|---|
| 收藏夹数据损坏（非 Playlist 结构） | hydrate 时兜底空收藏夹 |
| 列表为空 / 未选中 | 面板显示空态文案，播放类菜单项禁用 |
| 拖拽到列表外 / 无效目标 | 忽略，不改变顺序 |
| 播放列表被外部删除 | 面板重新选择列表，活动实例 playlistId 失效时走现有空态 |

## 9. 文件结构（交付目标）

```
src/shared/
├── types.ts                  修改：MediaItem.createdAt + IPC 常量（无新通道，仅类型）
└── source.ts                 修改：mediaItemFromPath/Url 写入 createdAt
src/renderer/src/
├── store/appStore.ts         修改：面板 UI 状态 + 收藏/排序/重排/播放 actions
├── store/playlistUtils.ts    新增：reorderItems/sortItems 纯函数（TDD）
├── components/SidePanel.tsx  新增：右侧滑出面板
├── components/ContextMenu.tsx 新增：右键菜单
├── components/PlayerView.tsx 修改：object-fit 绑定 scaleMode、右上「列表」按钮、抽共享打开逻辑
├── components/ControlsBar.tsx 修改：爱心收藏按钮
├── hooks/useShortcuts.ts     修改：L 开面板、Esc 优先级链、onContextMenu 全局处理
├── App.tsx                   修改：接入 SidePanel/ContextMenu
└── styles.css                修改：面板/菜单/爱心样式
```

（主进程本阶段零改动）

## 10. 验收清单（dev 手动）

- [ ] 右键播放区 → 自定义菜单弹出（深色圆角），倍速/模式/缩放当前项打勾，置灰项不可点击
- [ ] 菜单在窗口右/下边缘自动翻转定位；点击外部/Esc 关闭
- [ ] 右上「列表」按钮与 L 键开合面板，tab 记忆保留
- [ ] 打开文件/文件夹/网络流 → 新列表出现在面板，下拉可切换多列表
- [ ] 列表点击项播放；当前项高亮；拖拽换序生效；删除/清空生效
- [ ] 排序切换：名称 / 时间正序 / 倒序（新增文件时间戳正确）
- [ ] 控制栏爱心：未收藏白心 → 点击变红实心；收藏 tab 出现该项；再点取消
- [ ] 收藏项可点播；收藏变化关闭重开仍在（持久化）
- [ ] 画面缩放 contain/fill 切换即时生效
- [ ] 面板/菜单打开时播放不中断；全屏下菜单/面板正常
- [ ] 回归：播放/续播/快捷键/控制列隐藏均正常
