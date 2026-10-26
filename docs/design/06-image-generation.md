# 06 生图（设计）

> 状态：草案 v0.1（Phase 1 已实现）
> 依据：D006（已定）、D003（单包 + 插件树）、D005（提示词装配）
> 范围：场景插画、角色立绘、提示词工作台、provider 适配器、数据与路由。不含自动生图与图生图。

## 一句话

酒馆生图是一个可选的 `dshtavern/image` 子插件：玩家编辑提示词，可选让模型细化，批准后手动调用第三方生图 API；场景图挂在回合下方，立绘进入角色卡并作为聊天气泡头像。

## 用户流程

### 场景插画

1. 在工具箱打开「生图」，或点最新一条回复下方的「画一张」。
2. 宿主读取该回合的 beat，生成一份草稿：旁白、玩家输入、公开场景、出场角色与外观。导演私记和未揭示剧情不进入草稿。
3. 玩家编辑草稿；可以点「LLM 细化」让模型按当前 provider 的限制再写一版，细化不触发生图。
4. 点「批准这条提示词」：宿主校验 provider 配置与凭据，签发一次性 `approvalId`。审批不产生生图费用。
5. 点「生成图片」：宿主按审批记录调用 provider；成功后写入图片与元数据，回合下方出现缩略图。
6. 玩家改了 prompt / 负向词 / 比例 / 风格 / seed 后，客户端丢弃 `approvalId`，必须重新批准。

### 角色立绘

1. 角色卡编辑面板的「立绘」区点「生成立绘」。
2. 草稿来自角色卡的 `name / appearance（回退 description 第一段）/ personality / scenario`。
3. 同样的细化、批准、生成流程。
4. 新图只加入历史；玩家点「设为头像」才切换 active，聊天头像随之更新。

## UI

### 工具箱三态

| 状态 | 工具箱 | 面板 |
|---|---|---|
| 子插件行被禁用 | 灰色「生图（未启用）」，可点开看启用指引 | 提示到插件页启用 `dshtavern-image` |
| 行启用、酒馆未开启 | 正常「生图」 | 首次配置清单 + 「去设置」 |
| 两者都开启 | 正常 | 场景 / 图库 / 设置三个子页 |

### 面板

- **场景**：提示词工作台 + 当前会话的场景图库。
- **图库**：当前会话所有场景图，按生成时间倒序，显示回合与 provider/model。
- **设置**：启用开关、provider 选择、provider 配置、细化模型、凭据状态/写入、场景与立绘模板、默认负向词、比例/风格。

### 回合下方

- 只对 `closed` 回合渲染；已有图始终显示缩略图。
- 只有最新回合且酒馆已开启生图时显示「画一张 / 再画一张」。
- 工作台在回合下方原地展开，与面板共用组件。

### 聊天头像

- 台词气泡的结构是 `blockquote > p:first-child > strong:only-child`。
- 头像 `<img>` 作为第一个 `<p>` 的**兄弟**追加到 blockquote 末尾，不能放进 `<p>`，否则会破坏现有气泡选择器。
- 角色名 → active 立绘的映射来自 `GET /tavern-image/portraits?workspaceId=`；重名角色不贴头像。
- `MutationObserver` 在虚拟滚动重建后重贴；`data-dshtavern-avatar-for` 防止重复插入。

## 数据

```text
.dshtavern/
  image.json                       # 工作区生图设置（无密钥）
  stories/<session>/
    images/<id>.<png|jpg|webp>
    images/index.jsonl             # 场景图元数据
  characters/<cardId>/
    portraits/<id>.<png|jpg|webp>
    portraits/index.json           # { schema, activeId, items }
```

- 场景元数据：`turn / draftPrompt / refinedPrompt? / finalPrompt / provider / model / seed? / aspect / style / refineModel? / approvedAt / createdAt`。
- 立绘索引：一个角色可有多张历史，`activeId` 决定角色卡展示和聊天头像。
- `.charc` 保持纯文本；`appearance` 是可选字符串（最多 16,000 字），schema 仍为 1。

## 配置

```json
{
  "schema": 1,
  "enabled": false,
  "provider": "openai-images",
  "providers": {
    "openai-images": { "baseUrl": "https://api.openai.com/v1", "model": "gpt-image-1", "quality": "" },
    "jimeng": { "endpoint": "https://visual.volcengineapi.com", "region": "cn-north-1", "reqKey": "jimeng_t2i_v40", "promptExpansion": false }
  },
  "refineModel": null,
  "scene": { "aspect": "3:2", "style": "anime", "customStyle": "", "template": "…", "negative": "…" },
  "portrait": { "aspect": "2:3", "style": "anime", "customStyle": "", "template": "…", "negative": "…" },
  "timeoutMs": 180000,
  "maxImageBytes": 26214400
}
```

- `enabled` 只表示这个酒馆允许打开生图工具，不是自动生图开关。
- `refineModel` 为空时按 `session.requestContext()` → `modelSelection` 投影 → `agentDefaultModel` 解析。
- 凭据固定引用，见 D006；配置里没有密钥字段。

## 中立层与 provider

```ts
interface ImageRequest {
  mode: 'scene' | 'portrait'
  prompt: string
  negative?: string
  aspect: '1:1' | '3:2' | '2:3' | '16:9'
  count: 1
  seed?: number
}

interface ImageResult {
  images: { bytes: Uint8Array; mime: string }[]
  provider: string
  model: string
  seed?: number
  revisedPrompt?: string
}
```

每个适配器声明能力（负向词、seed、可用比例、异步、最大张数、prompt 上限），UI 只显示支持的字段。

### GPT Image

- `POST {baseUrl}/images/generations`，Bearer key，`redirect: 'error'`。
- `response_format: 'b64_json'`；只返回 URL 时做受限下载（HTTPS、无凭据、不跟随重定向、字节上限、magic bytes）。
- 无独立负向词，合并到 prompt 末尾。
- 尺寸：1:1 → 1024x1024；3:2 → 1536x1024；2:3 → 1024x1536；不支持 16:9。

### 即梦 4.0

- 端点 `https://visual.volcengineapi.com`，AWS SigV4（HMAC-SHA256），Region `cn-north-1`，Service `cv`。
- 提交 `CVSync2AsyncSubmitTask`（Version 2022-08-31），body `req_key: 'jimeng_t2i_v40'`、`prompt`、`seed`、`width/height`、`force_single: true`、`use_pre_llm`；返回 `task_id`。
- 轮询 `CVSync2AsyncGetResult`，状态 `in_queue → generating → done`；2 秒间隔，由统一超时中止。
- 结果图片 URL 24 小时有效，宿主立即下载、校验、落盘。
- 无独立负向词，合并到 prompt；第一版仅长期 AK/SK。

## 路由

全部 loopback-only：

| 路由 | 方法 | 作用 |
|---|---|---|
| `/tavern-image/ping` | GET | 存活探测 |
| `/tavern-image/config` | GET/POST | 配置、凭据状态、会话模型 |
| `/tavern-image/credentials` | POST/DELETE | 固定引用写/清 |
| `/tavern-image/preview` | GET | 上下文与草稿 |
| `/tavern-image/refine` | POST | 一次 LLM 细化 |
| `/tavern-image/approve` | POST | 一次性 `approvalId` |
| `/tavern-image/generate` | POST | 按审批记录生成 |
| `/tavern-image/list` | GET | 场景图列表 |
| `/tavern-image/portraits` | GET | 立绘历史 / active 映射 |
| `/tavern-image/portrait-active` | POST | 切换 active |
| `/tavern-image/file` | GET | 二进制图片 |

## 安全与成本

- 审批一次性、10 分钟有效；生成只接受 `approvalId`。
- 生图永远手动，没有 beat 钩子或自动任务。
- provider 请求 `redirect: 'error'`；响应体 32 MiB；图片 25 MiB；校验 PNG/JPEG/WebP magic bytes；拒绝 SVG。
- 图片下载不携带 API 凭据；错误信息脱敏。
- 同一工作区同时只生成一张；默认 1 张。
- 面板分别提示细化（模型调用）和生成（第三方 API，可能计费）。

## 已实现与后续

**Phase 1 已实现**：中立层、配置/凭据、审批、场景图、角色立绘、GPT Image、即梦 4.0、工具箱面板、回合下方工作台、聊天头像。

**后续**：ComfyUI（内置默认 workflow）、Gemini banana、图生图/参考图、批量多图、删除/收藏/保留策略、自动生图（若未来要做，必须另行决策并默认关闭）。

## 待确认

- 即梦响应字段以官方文档/真实请求为准；适配器已兼容常见 `data.task_id` / `data.status` / `data.image_urls` 与 inline base64。
- 角色名必须唯一，聊天头像才能按名字映射；重名角色第一版不贴。
- DOM 装饰依赖 DSH 气泡结构；上游改结构时头像静默不显示，不影响剧情。
