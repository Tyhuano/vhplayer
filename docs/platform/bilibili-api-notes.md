# Bilibili 接口探针笔记（2026-08-09，未登录态实测）

> 实测环境：Windows + PowerShell，UA=Mozilla/5.0 (Chrome/120)，Referer=https://www.bilibili.com。
> 结论以响应 code 与返回结构为准。接口可能随时收紧（如 wbi 签名要求），实现时预留签名能力。

## 可用接口（全部未登录可用）

### 1. 视频信息
```
GET https://api.bilibili.com/x/web-interface/view?bvid={bvid}
```
- code=0；返回 title / cid / duration(秒) / dimension.width|height / pic(封面) / owner.name
- 用途：解析 BV 号后获取标题、封面、cid、宽高

### 2. 推荐流（信息流主方案）
```
GET https://api.bilibili.com/x/web-interface/wbi/index/top/rcmd?ps={n}
```
- code=0，ps 最大约 30，返回 `data.item[]`：
  - `bvid`、`cid`、`title`、`pic`(封面)、`duration`(秒)、`pubdate`
  - `owner { mid, name, face }`
  - `stat { view, like }`
  - `uri` = https://www.bilibili.com/video/{bvid}（官方页面，pageUrl）
- ⚠️ item **无 dimension 宽高字段**（竖屏过滤需 playurl 探测或不做硬过滤）
- ⚠️ wbi 前缀接口当前未带 w_rid 签名参数也可用，但需预留 wbi 签名能力（防收紧）

### 3. 热门 / 排行榜（备选信息流）
```
GET https://api.bilibili.com/x/web-interface/popular?ps={n}&pn={pn}
GET https://api.bilibili.com/x/web-interface/ranking/v2?rid=0&type=all
```
- popular 返回 `data.list[]`，**含 dimension.width/height**（可竖屏过滤）
- ranking/v2 返回 `data.list[]`（bvid/title 等）

### 4. 搜索（主题聚合主方案）
```
GET https://api.bilibili.com/x/web-interface/wbi/search/type?search_type=video&keyword={urlencoded}&page={pn}
```
- code=0，约 20 条/页；结果含 title(含 <em class="keyword"> 高亮标签，需清洗)、bvid、duration、pic、owner.name
- ⚠️ 无 wbi 前缀的 `x/web-interface/search/type` 返回 **HTML 风控页**，不可用

### 5. 播放地址
```
GET https://api.bilibili.com/x/player/playurl?bvid={bvid}&cid={cid}&qn={qn}&fnval={fnval}
```
- `fnval=0`（durl 单文件）：未登录清晰度矩阵（实测 BV1xx411c7mD）：
  - qn=32 → quality=16（360P）
  - qn=64 → quality=64（720P）
  - qn=80 / qn=116 → **仍回退 quality=64（720P）**
  - 结论：**未登录 durl 上限 720P**；durl[0].url 为 upos mp4 直链，`<video>` 可直接播放
- `fnval=16`（DASH）：未登录 **video 轨仅 32p**（2024 年后限制）；DASH 对未登录无实用价值
- 登录（SESSDATA cookie）预期解锁 1080P+/DASH 高清——**实施阶段实测确认**

## 不可用 / 限制

| 项 | 现象 |
|----|------|
| `x/web-interface/search/type`（无 wbi） | 返回 HTML 风控页 |
| `x/web-interface/video/feed?tid=` | 返回空列表（分区 feed 已停用） |
| DASH（未登录） | 仅 32p，无实用价值 |
| durl 直链有效期 | 数小时级，播放/下载前需实时 resolve |

## 实施建议（P8 引用）

- 信息流：rcmd 推荐（30 条/次，翻页用 ps 递增或换 pn）
- 搜索/聚合：wbi/search/type（关键词 → 结果 → view 补齐信息 → playurl 拿直链）
- 播放：durl 直链原生 video（未登录 720P 足够短视频场景）；登录后 DASH 走 dash.js
- 下载：durl 直链复用现有 DownloadService（ffmpeg remux，零改动）
- 封面 pic 为 `http://i*.hdslb.com`（http 协议），Electron 渲染可用；如需 https 可尝试替换协议
