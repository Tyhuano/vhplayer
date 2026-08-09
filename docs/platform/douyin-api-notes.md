# 抖音接口探针笔记（2026-08-09，未登录态实测）

> 实测环境：Windows + PowerShell，UA=Mozilla/5.0 (Chrome/120)，Referer=https://www.douyin.com/。

## 实测结果

### 1. 推荐流 feed（无签名直调）
```
GET https://www.douyin.com/aweme/v1/web/tab/feed/?device_platform=webapp&aid=6383&channel=channel_pc_web&count=10
```
- HTTP **200 但响应体为空**——缺少 `a_bogus`（及 msToken）签名参数时服务端返回空，确认签名必需

### 2. 首页 HTML
```
GET https://www.douyin.com/
```
- HTTP 200，HTML 约 73KB，**无内嵌数据**（无 RENDER_DATA / _ROUTER_DATA / aweme 标记）——JS 渲染

### 3. 签名复杂度评估（a_bogus）
- a_bogus 为抖音 web 端混淆 JS 生成的请求签名（含 URL/参数/UA/指纹哈希），Node 侧移植需还原混淆算法（约 500-1500 行、含迭代更新），**维护成本高、接口收紧频繁**
- 决策：**不做 a_bogus 逆向**（不承诺信息流可用性）

## 可行入口评估

| 方案 | 可行性 | 说明 |
|------|--------|------|
| web feed 信息流（无签名） | ❌ 空响应 | 需 a_bogus 逆向，暂缓 |
| 分享链接解析（v.douyin.com 短链 → 详情页） | ⚠️ 待验证 | 需真实分享链接样本（实施阶段用户提供） |
| 详情页/页面数据提取 | ⚠️ 待验证 | 需 aweme_id 样本；JS 渲染预期需页面内接口 |

## 实施建议（P11 引用）

- **降级为主**：分享链接/页面 URL 解析（实验性，与快手同一降级路径实现）
- 需用户提供样本：1 条真实 `v.douyin.com` 分享链接（实施阶段实测）
- 若后续需要信息流：评估第三方已实现的开源 a_bogus（如 TikTokDownloader 系）再决定，不自行从零逆向
