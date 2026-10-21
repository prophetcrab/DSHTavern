# D002 提示词自主权：独立 agent preset

- 状态：讨论中（倾向方案 A 起步，预留 B）
- 日期：2026-10-21

## 背景

需求方明确要求：酒馆会话要完全使用自写的系统提示词，不使用 DSH 的任何系统提示词。因此「酒馆模式」首先是一套独立的 agent 组合，其次才是界面皮肤。

## 关键事实（来自 DSH 源码调研）

| 事实 | 对方案的影响 |
|---|---|
| Web 端已把全局 agent plane（tools、agent-instructions、skills、plan-mode 等）全部置于 agent preset 之后 | 新增 `tavern` preset 即可完全决定一个 agent 能看到的提示词与工具 |
| `PromptSection.complete: true` 会成为唯一 system prompt，其它 section 全部被丢弃 | 系统提示词可以 100% 自控 |
| `suppressRuntimeContext()` 可以关闭可选运行时上下文 | harness/审批/沙箱等可选上下文可以去掉 |
| `working-directory` 注册了 required 上下文 `Current working directory: "…"`，装配结束后强制补回 | 原生路线一定残留一执行目录提示 |
| 同会话中途切换 provider/model 会注入一条 `[model changed: …]` 用户消息 | 原生路线会残留；路线 B 可以消除 |
| `llm/stream` 的请求是深冻结的，不能在出口改 messages | 「重建整条请求」必须走包装 adapter，而不是流事件 |

## 候选方案

| 方案 | 描述 | 能得到什么 | 代价 |
|---|---|---|---|
| A 原生组合 | tavern preset + 自注册的 complete section + 关闭可选上下文；ST 全部提示词合成一段 system prompt | 零 DSH 系统提示词；零工具；保留 DSH session/流式/取消 | 一执行目录提示；不支持 in-chat depth 注入与精确 token 裁剪 |
| B 请求级接管 | preset 把会话路由到保留 provider，插件 adapter 用 prompt builder 重建整个 messages | 模型收到的每一条消息都由我们决定；支持 depth 注入、token 预算、stop 序列 | 需要包装 adapter；session 日志与实际请求不一致，需自定义事件记录真实 prompt |
| C 自建聊天引擎 | 不使用 DSH agent/session，直接调用 `ctx.llm` | 完全自由 | 丢掉 session 持久化、流式、取消、工作区分组、fork |

## 倾向结论

v1 走 A，但 prompt builder 独立成模块、投递层可替换；如果确认需要 depth 注入或 token 级控制，直接升级到 B。

> 实施顺序：工作区基础模块（D004）不依赖本决策，先按路线 A 起步实现；本决策定稿后再写会话侧 prompt 插件。

## 待定

1. 严格程度：只要求 system prompt 自主（A），还是要求整条请求都由我们重建（B）？
2. SillyTavern 的 in-chat depth 注入（author's note、世界书按深度插入）和 token 预算裁剪，v1 是否需要？
3. 是否允许同一聊天中途换模型？

## 影响

- 设计文档 [`01-交互界面.md`](../design/01-interface.md)：工作区与 preset 的绑定、提示词管理器界面
- 后续「提示词装配」设计文档（待写）
