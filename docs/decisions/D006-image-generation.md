# D006 生图：可选子插件、手动审批与方言适配

- 状态：已定
- 日期：2026-10-26
- 关联：D003（单包 + 插件树）、D005（提示词装配）

## 背景

酒馆需要配图能力：场景插画和角色立绘，并允许接入第三方生图 API。最初讨论过把图片直接作为 assistant 内容返回，也讨论过由导演自动决定何时配图；调研 DSH 适配器与现有插件结构后，这两条都不可靠或不合适。

## 关键事实

| 事实 | 影响 |
|---|---|
| DSH 的 assistant `ImageBlock` 在 UI 上能渲染，但 DeepSeek 与 pi-ai 适配器拒绝 assistant 图片输出；图片还会进入模型历史 | 生成图不能作为 assistant 消息内容 |
| `conversation.chat.turnTail` 是列表插槽，DSHTavern 已用于「重新生成」 | 可以在回合下方增加图片条，不改转写 |
| 插件可以提供 loopback 二进制路由 | 图片由宿主自己的路由提供，不把 provider URL 暴露给浏览器 |
| DSH 有 `ctx.credentials`，但工作区目录是用户可见的 | 密钥必须放凭据服务，不能写 `.dshtavern/image.json` |
| 即梦是异步任务 API（提交 + 轮询），GPT Image 是同步 b64 | 中立层必须允许适配器内部轮询，不能只定义一次 POST |
| 聊天没有「每个说话人一个头像」的插槽 | 立绘头像只能做客户端 DOM 装饰，或不做 |

## 决策

1. **图片是剧情侧车，不是消息内容。** 场景图存 `stories/<session>/images/`，立绘存 `characters/<cardId>/portraits/`；浏览器通过 `/tavern-image/file` 取图。客户端在 `turnTail` 和角色卡面板里渲染，不改 assistant 消息、不进模型历史。
2. **生图是可选子插件行。** 同一个 `dshtavern` 包新增 `dshtavern/image` 行，默认启用；每个酒馆的 `image.json` 默认 `enabled: false`。行被禁用时路由消失，工具箱显示灰色「生图（未启用）」。
3. **永远手动。** 生图子插件不挂 beat、不监听 `llm/stream`、不做自动配图。唯一调用第三方生图 API 的路径是用户批准后点击「生成图片」。
4. **提示词走工作台。** 草稿 → 用户编辑 →（可选）LLM 细化 → 用户批准 → 生成。细化默认跟随当前会话模型，也可单独配置；细化不生成图片。审批由宿主签发一次性 `approvalId`，绑定 prompt/参数/provider/目标，10 分钟有效；生成只接受 `approvalId`，不再接受客户端临时改写 prompt。
5. **中立层 + 方言适配器。** 统一请求/结果与能力表；第一版实现 GPT Image（同步 b64）和即梦 4.0（火山 AK/SK 异步）。ComfyUI 与 Gemini banana 后续以适配器接入，不改核心。
6. **密钥按 provider 固定引用。** GPT Image 用 `DSHTAVERN_IMAGE_OPENAI_API_KEY`；即梦用 `DSHTAVERN_IMAGE_JIMENG_ACCESS_KEY` / `DSHTAVERN_IMAGE_JIMENG_SECRET_KEY`。面板只写不读，不提供读取路径。
7. **立绘头像用 DOM 装饰。** 图片作为 speech bubble 的兄弟节点插入（不放进第一个 `<p>`，保留现有 `strong:only-child` 选择器）；角色名唯一时才贴，虚拟滚动后由 `MutationObserver` 重贴。

## 影响

- 新子插件：`src/image/`、`locale-image/`、`exports["./image"]`、`cordis.patch.yml` 一行。
- 客户端：工具箱第 8 个工具、生图面板、提示词工作台、回合下方图片条、角色卡立绘区、聊天头像装饰。
- 角色卡新增可选 `appearance` 字段（schema 1 不变），只给生图使用，不影响角色扮演提示词。
- 文档：06 生图设计；README/architecture 增加功能、路由和数据布局。

## 暂不做

自动生图、批量多图、图生图/参考图、ComfyUI、Gemini banana、即梦临时 AKTP token、删除/收藏/保留策略、把图片写进 assistant 消息或会话日志。

## 参考

- 即梦官方接口：<https://docs.volcengine.com/docs/85621/1791184>
- 即梦 4.0：<https://www.volcengine.com/docs/85128/1554673>
