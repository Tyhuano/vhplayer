# 快手接口探针笔记（2026-08-09，未登录态实测）

> 实测环境：Windows + PowerShell，UA=Mozilla/5.0 (Chrome/120)。

## 实测结果

### 1. 网页首页 / 搜索页
```
GET https://www.kuaishou.com/
GET https://www.kuaishou.com/search/video?searchKey={keyword}
```
- HTTP 200，HTML 约 77-318KB，但**无内嵌数据**（无 `_DATA` / `__NEXT_DATA__` / `window.initial`）、无 mp4 直链——纯 JS 渲染（数据全走接口）

### 2. graphql 信息流（visionFeedList）
```
POST https://www.kuaishou.com/graphql
```
- 尝试组合：无参数直调、URL 带 `client_key=3c2cd3f3d&kpf=PC_WEB&kpn=KUAISHOU_VISION`、带 did Cookie、简化 query——**全部 400 Bad Request（空响应体）**
- 结论：未登录直调不可用；需要完整请求链（设备 did 签名、请求指纹头、完整 query 结构），**逆向成本高且易失效**

### 3. 视频详情页
```
GET https://www.kuaishou.com/short-video/{photoId}
```
- 未实测（无 photoId 样本）；预期与首页相同为 JS 渲染，直链提取需页面内接口

## 可行入口评估

| 方案 | 可行性 | 说明 |
|------|--------|------|
| graphql 信息流/搜索（未登录直调） | ❌ 400 | 需签名逆向，暂缓 |
| 分享链接解析（v.kuaishou.com 短链 → 详情页） | ⚠️ 待验证 | 需真实分享链接样本（实施阶段用户提供） |
| 详情页 HTML 提取 | ⚠️ 待验证 | 需 photoId 样本；JS 渲染预期需走页面内接口 |

## 实施建议（P10 引用）

- **降级为主**：分享链接/详情页解析（实验性），与抖音同一降级路径实现
- 信息流（visionFeedList）在签名逆向可行前不做
- 需用户提供样本：1 条真实 `v.kuaishou.com` 分享链接（实施阶段实测）
