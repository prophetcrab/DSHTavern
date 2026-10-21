# D005 提示词装配：工作区级固定装配

- 状态：已定
- 日期：2026-10-22
- 关联：D002（提示词自主权）、D004（工作区标记）、05 提示词编排

## 背景

提示词编排已经按工作区保存在 `<workspace>/prompts/prompt.json`。需求方明确：

> 酒馆的提示词装配应该是工作区级别的，每个工作区都固定装配编辑好的自己的提示词，不使用任何其他的系统提示词。

即：酒馆会话的系统提示词只能来自它所在工作区的编排结果，不允许混入全局默认、其他工作区、或 DSH 自带的系统提示词。

## 决策

1. **唯一来源**：一个酒馆会话的系统提示词，只由 `<workspace>/prompts/prompt.json` 里「启用块的顺序与文本」装配；没有全局默认、没有跨工作区回退。
2. **工作区级作用域**：编排配置属于工作区，不属于聊天、不属于 profile、也不属于 preset 的公共配置。v1 不做「按聊天覆盖」。
3. **排他装配**：`tavern` preset 的会话行注册一个 `complete: true` 的 PromptSection（它成为唯一 system prompt），并调用 `suppressRuntimeContext()`；preset 不挂 persona / agent-instructions / skills / plan-mode / 工具等任何会贡献提示词的其它行。
4. **资料内容也在同一份编排里**：角色卡字段、世界书命中、示例对话等块的内容由资料层解析后填入对应块；它们不绕开编排单独注入。
5. **DSH 残留显式化（已确认保留）**：A 路线下 DSH 强制附加的 required 上下文（`Current working directory: …`）**保留**；编排页将其作为一个只读块展示并说明来源。理由是未来酒馆可能挂文件型工具，工作目录对相对路径与沙箱语义有实际意义。若将来要求字面零残留，再升级 B 路线（D002）。
6. **两种酒馆模式（规划）**：酒馆插件将提供「角色扮演模式」和「小说模式」。它们是酒馆内部的两种运行模式，各对应一个内部 preset（如 `tavern-rp` / `tavern-novel`），**不进入 DSH 全局 preset 选择器**（DSH 的 preset roster 是全局的，没有按工作区过滤的扩展点；放进全局列表会泄漏到非酒馆工作区）。模式选择放在酒馆自己的 UI 里（仅酒馆工作区可见），选择后写入工作区配置；新建会话时由宿主按工作区模式自动绑定对应内部 preset。DSH preset 在会话开始后锁定，因此切换模式对下一次新建会话生效。
7. **模式与编排的关系**：v1 两种模式共用同一份 `<workspace>/prompts/prompt.json`；后续小说模式需要不同的块集合/默认文本时，再演进为按模式存放（如 `prompts/rp.json`、`prompts/novel.json`），装配时按工作区当前模式读取。

## 影响

- 05 提示词编排：装配归属与生效方式按本决策；不再设计按聊天覆盖（至少 v1）；required 上下文作为只读块呈现。
- 03 上下文与角色卡：`ChatBinding` 只保留角色卡/世界书/问候选择等绑定，作者笔记与模板文本归工作区编排所有。
- 实现上需要 `tavern` agent preset 行 + 会话侧 prompt 插件；该插件只读取当前会话 cwd 所属酒馆工作区的编排文件。

## 实现补充：请求级清洗（B-lite）

A 路线下 DSH 仍会注入 preset 无法移除的内容：required runtime context（cwd、`team:identity`）、全局工具 schema、`<system-reminder>`。因此宿主在 `llm/stream` 做最后一道清洗，只对酒馆 session 生效：

- system 消息改写为**工作区编排渲染结果**（同步读 `prompts/prompt.json`）；
- runtime context 快照折叠成一行 `Current working directory: …`（保留 D005 的 cwd 决定）；
- 丢弃 `<system-reminder>` 注入；
- 清空 `tools` 与 `toolHistory`（酒馆 preset 未挂工具）；
- 把最终请求写入 `<workspace>/.dshtavern/state/last-request.json` 供核对（system、messages、model）。

这意味着 B-lite 之后，主请求 = 编排 system + cwd 一行 + 历史 + 本轮输入；`team:identity` 和工具不再进入请求。

## 待定

- 两种模式的内部 preset 命名、模式配置字段（建议存 `<workspace>/.dshtavern/tavern.json` 的 `mode: rp | novel`）、以及酒馆 UI 里模式切换的具体位置（工具箱内）。
- 未来酒馆工具的类型（纯逻辑 / 文件型）与启用策略；文件型工具启用时，required 工作目录上下文的意义正式成立。
