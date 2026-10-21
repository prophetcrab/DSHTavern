# 05 提示词编排（设计）

> 状态：草案 v0.3（拖拽排序与 A 路线装配已实现）
> 依据：D002（A 路线起步）、D005（工作区级固定装配）、03 上下文与角色卡（草案）、04 酒馆外壳（草案）
> 范围：提示词编排面板的可见范围、编辑能力、数据与生效方式；不含模板文案、不含卡片/世界书读取实现。

## 已实现（v0.3）

- **A 路线装配**：profile 新增 `preset-tavern`（`@deepseek-ai/dsh-agent-preset`，唯一插件行 `dshtavern/session`）。会话行在 `agent/created` 时给该 agent 注册 `complete` PromptSection 并 `suppressRuntimeContext()`；每次 `agent/pre-step` 通过 `ctx.tavernWorkspaces.assemblePromptText(sessionCwd)` 刷新文本，因此编辑后下一条消息即生效。只读取 cwd 所属酒馆工作区的 `prompts/prompt.json`，不混入全局或其他工作区内容（D005）；DSH required 的 cwd 上下文保留。
- 宿主：`src/prompt-layout.ts` 提供系统提示词块目录（12 块）、默认顺序、校验与按工作区持久化（`<workspace>/prompts/prompt.json`）；`renderPromptText()` 把启用且非空的块按顺序拼成 system prompt；`assemblePromptText(cwd)` 负责目录 → 酒馆工作区 → 文本。
- 接口：`GET /tavern/prompt?workspaceId=…` 读取顺序，`POST /tavern/prompt` 保存顺序 / 文本 / `{reset:true}` 恢复默认。
- **位置：酒馆会话里可拖动的悬浮工具箱图标**。一个圆形图标悬浮在会话上（位置可拖动并记住，默认在输入框左下侧空档）；点击后弹出只含工具图标的浮层，再点「提示词编排」才在居中的**子弹窗**里打开编排页面（背景点击 / 关闭按钮 / Esc 关闭）。
- 编排页：可拖拽卡片调整顺序、启停、恢复默认、保存状态提示；选择工作区由当前会话决定。
- **内容编辑**：目录中标记为 `editable` 的块（主提示词模板 / 用户人设 / 作者笔记 / 历史后指令）点击卡片会弹出**独立的编辑弹窗**（多行 textarea + 保存 / 取消 / 恢复默认文本；Esc 或点背景取消；叠在工具子弹窗之上）；保存后覆盖文本写进 `prompts/prompt.json`，卡片显示「已修改」标记，只有与默认文本不同才写入文件；其他块（角色字段、世界书、DSH 运行时）只读，内容来自资料层。
- **角色卡条件显示**：宿主在 `/tavern/prompt` 返回 `hasCharacterCard`（扫描 `<workspace>/characters/*.png|json`）；为 false 时面板只显示非角色卡来源的块，角色块保持原有槽位、不显示也不参与拖拽。
- 子弹窗布局：窗口层挂载 `dshtavern-panel` 提供 `--tv-*` 变量；标题栏 + 工具条（说明 / 保存胶囊 / 恢复默认）+ 卡片列表，内容不横向溢出。
- 创建页（侧栏「酒馆」）不再包含编排标签页，只负责酒馆工作区的创建/列表/收编。
- 暂未做：消息序列/深度注入、实际 preset 装配投递（按 D005 的唯一来源规则；A 路线需接受 DSH required 上下文残留）；按聊天覆盖已决定 v1 不做。


## 装配归属（D005）

- **唯一来源**：酒馆会话的系统提示词只由 `<workspace>/prompts/prompt.json` 中「启用块的顺序与文本」装配；没有全局默认、没有跨工作区回退。
- **工作区级作用域**：编排属于工作区，不属于聊天/profile/preset 公共配置；v1 不做按聊天覆盖。
- **排他装配**：`tavern` preset 只挂本插件的会话行，注册 `complete: true` 的 PromptSection 并 `suppressRuntimeContext()`；不挂 persona / agent-instructions / skills / plan-mode / 工具等任何其它提示词贡献。
- **资料块同源**：角色卡字段、世界书命中、示例对话等内容填入编排块，不绕开编排单独注入。
- **DSH 残留**：A 路线下 required 上下文（如执行目录）以只读块显式展示并说明来源；要求零残留则升级 B 路线（D002）。

## 一句话

编排面板要暴露**这一次请求可能发给模型的全部提示词**，并且每一块都可以自由启停、编辑、排序、增删，改动立即作用于后续请求。

## 目标能力

1. **全量暴露**：列出所有可能进入请求的提示词块（来源、顺序、角色、token），没有隐藏项；DSH 侧不可移除的部分也显示为「锁定/只读」并说明原因。
2. **自由编辑**：改文本、启停、排序、新增自定义块、删除、覆盖默认模板、使用变量/条件。
3. **动态生效**：保存后下一次请求就生效；支持实时预览、diff、恢复默认。
4. **作用域**：工作区默认 + 按聊天覆盖（可再讨论是否需要「只对下一条消息生效」）。
5. **可观测**：预览最终 system prompt 与消息序列、token、警告（超预算、未知宏、锁定块、被禁用项）。

## 提示词清单（候选，按 D002 路线裁剪）

| 分类 | 块 | 来源 | 默认位置 | 可编辑性（A 路线） |
|---|---|---|---|---|
| 系统 | 主模板 | 工作区模板 | system 开头 | 完全可编辑 |
| 系统 | 角色定义 | 角色卡 description/personality/scenario | 系统块内 | 可编辑/覆盖 |
| 系统 | 角色自带 system_prompt | 角色卡 | 系统块内 | 可编辑/覆盖 |
| 系统 | 世界书 before/after | 世界书条目 | 按 position | 可编辑/启停 |
| 系统 | 示例对话 | 角色卡 mes_example | 示例区 | 可编辑/启停 |
| 系统 | 用户人设 | persona | 系统块内 | 可编辑/启停 |
| 系统 | 作者笔记（系统位置） | 聊天/工作区 | 可调 | 可编辑/启停 |
| 系统 | post-history instructions | 角色卡/模板 | 历史末尾 | 可编辑/覆盖 |
| 系统 | 自定义块 | 用户新增 | 可指定 | 完全自由 |
| 消息 | 首条问候 first_mes / alternate | 角色卡 | 历史开头 | A 路线只读/可选用 |
| 消息 | 历史消息 | DSH session | 历史 | **A 路线只读** |
| 消息 | @Depth 注入 | 世界书/作者笔记/角色 depth_prompt | 历史内 | **A 路线不可做** |
| 消息 | 当前用户输入 | 用户 | 末尾 | A 路线可改写（pre-step） |
| 消息 | continue / impersonate 提示 | 命令 | 末尾 | 待定 |
| 非提示词 | 工具 schema | preset | 请求头 | 默认无（tavern preset 不挂工具） |
| 非提示词 | 运行时上下文（执行目录等） | DSH | 系统末尾 | A 路线可能锁定只读 |
| 非提示词 | 采样参数 / stop 序列 | 模型设置 | 请求头 | 可编辑（不影响消息内容） |

每个块在面板里展示：id、名称、来源、位置、角色、可编辑性、启用状态、估算 token、当前内容摘要。

## 编辑模型

```ts
type PromptBlock = {
  id: string
  label: string
  source: 'template' | 'character' | 'lorebook' | 'persona' | 'user' | 'dsh'
  role: 'system' | 'user' | 'assistant'
  position: 'system' | 'before_history' | 'after_history' | 'at_depth' | 'custom'
  depth?: number
  order: number
  enabled: boolean
  content: string
  template?: boolean          // 内容中含变量/条件
  locked?: boolean            // 只读，附原因
  origin: 'builtin' | 'character' | 'lorebook' | 'user' | 'override'
}
```

- 默认 blocks 由资料自动派生（角色卡字段、命中的世界书条目等）。
- 用户覆盖以 `id` 为键保存：改文本、启停、排序、增删、新增自定义块。
- 保存位置（候选）：工作区默认 `prompts/prompt.json`；按聊天覆盖进 `chats/<sessionId>.json`（与 ChatBinding 同文件或并列）。
- 资料变化时保留用户覆盖；删除自动块用 override 记录「禁用」而不是删数据。
- 面板需要「恢复默认」与「与上次对比」。

## 完全自由的边界（关键讨论点，直接决定 D002）

- **A 路线**：system prompt 内部全部可自由编排（complete section），但**消息序列是 DSH 回放的**——历史、首条问候、@Depth 注入都只能看不能改；「全部提示词 + 完全自由修改」不成立。
- **B 路线**：包装 provider adapter 重建整条请求，才能把消息序列、depth 注入、历史裁剪、最终角色/内容都纳入编排；代价是 prompt 不再等于 DSH session 的直接投影，需要记录「真实请求」。
- 中间方案：A 先实现「系统提示词完全自由 + 消息序列只读展示」，B 作为下一阶段。
- **需要先回答：是否接受中间方案，还是直接 B。** 这条不敲定，编排面板的数据模型和实现都无法定稿。

## 预览与生效

- 预览必须调用与真实请求**同一个 builder**，不能有第二套渲染逻辑。
- 面板内实时重排/重算 token；展示禁用项、被丢弃项、锁定项与原因。
- 保存后下一次请求生效；进行中的请求不变。
- diff 与恢复默认；超预算只警告不自动裁剪（裁剪策略属于 03 的预算设计）。
- 03 里的「上下文检查器」与本面板的预览本质是同一功能，合并为「编排面板的预览模式」。

## 动态性（模板/变量/条件）

- 支持变量求值（当前角色/用户/时间/随机/历史摘要等）与条件块；具体模板语言待定。
- 是否兼容 ST 宏（`{{char}}`/`{{user}}`/`{{original}}` 等）与 ST 的 prompt_order 语义，待定。
- 「完全自由」不等于执行任意代码：模板能力要有明确边界，避免把插件变成脚本执行环境。

## 与 DSH 的关系

- 编排结果由 `tavern` preset 的会话侧插件投递：A 路线用 complete PromptSection；B 路线用 adapter。
- 工具默认不挂；将来若有工具，需在清单中作为可开关项展示。
- 运行时上下文、执行目录等 A 路线下的锁定项要显式展示原因（而不是隐藏）。

## 待定（需要讨论）

1. **路线**：接受 A 的「system prompt 全自由 + 消息只读」，还是直接 B？这是本设计的前置。
2. **「所有提示词」的范围**：只列我们自己的块，还是把 DSH 的运行时上下文/工具 schema 也列进清单（只读也列）？
3. **编辑粒度**：工作区默认 + 聊天覆盖是否够？是否要「只对下一条消息临时生效」？
4. **原始编辑能力**：是否允许直接编辑最终消息序列（原始文本/JSON），还是只允许结构化 blocks？
5. **模板语言**：变量/条件/宏支持到什么程度；是否兼容 ST 宏与 Handlebars 子集。
6. **版本与撤销**：是否要历史版本与 diff 存档。
7. **面板形态**：按 04 的工具箱分栏，还是复杂到需要整页。

## 影响

- **D002 必须为此定稿（A/B）**；本设计依赖该结论。
- 03 的检查器/预算与本文重叠，后续合并到「编排面板」。
- 04 的工具箱第 1 项即本面板；调整面板（创建后）也可直接跳转到这里。
