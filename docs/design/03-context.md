# 03 上下文与角色卡（设计）

> 状态：草案 v0.1（讨论中：外部内容兼容的范围与程度均未定）
> 依据：D002（讨论中，提示词自主权）、D004（已定，工作区标记）
> 范围：角色卡与世界书的格式调研、候选兼容方案、导入与展示的候选设计。是否只读、支持哪些格式、导入哪些内容、是否导出，均**尚未下结论**（见文末「待定」）。

## 一句话

酒馆每次请求的上下文 = **工作区里的资料（角色卡 / 世界书 / 模板）+ 聊天绑定 + 预算策略**，由 `tavern` preset 的会话侧插件在请求前装配；卡片读取属于资料层，先于装配层落地。

## 术语映射

| 酒馆概念 | DSH 对应 | 存放位置 |
|---|---|---|
| 酒馆 | 工作区（目录 + `.dshtavern/tavern.json`） | `<workspace>/` |
| 聊天 | DSH session | DSH session 日志 |
| 角色卡 | 文件（PNG / JSON） | `<workspace>/characters/` |
| 世界书 | 文件（JSON） | `<workspace>/lorebooks/` |
| 提示词模板 | 文件（JSON/JS） | `<workspace>/prompts/` |
| 运行模式 | Agent preset `tavern` | preset 插件树 |
| 上下文装配 | preset 内的会话侧插件 | 每个 agent 一份 |

## 设计前提（DSH 0.2.1-rc.2 已确认事实）

| 事实 | 对本设计的影响 |
|---|---|
| `systemPrompt.section({ complete: true, text: (assembleContext) => string })` 成为唯一 system prompt，其它 section 丢弃 | 自写提示词可以 100% 自控，这是装配层的落点 |
| `systemPrompt.suppressRuntimeContext()` 可去掉可选运行时上下文 | A 路线可以做到「除一执行目录提示外无 DSH 内容」 |
| `agent/pre-step` 是 waterfall，payload 有 `{ agent, messages, turn, step, signal }`，可返回 `{ kind: 'enter', messages }` | 可改写「本步刚认领的用户消息」，可在此做每步钩子（世界书激活、预算计算） |
| 历史消息由 DSH 从 session 日志回放；`agent/request` / `llm/stream` 不能改 messages | **A 路线下历史不可裁剪、不能做 depth 注入**；这些能力属于 B 路线 |
| `session.requestContext()` 返回 `{ provider, model, contextWindow? }` | 预算可用真实模型窗口 |
| `ctx.tokenMeter.measure(session)` 返回 `totalTokens / surfaceTokens / nodes[].tokens` | 可做预算估算、丢弃决策、上下文检查器 |
| 会话侧插件以 preset 行形式挂载，可通过 `inject` 使用宿主服务 | 资料读取在宿主，装配在会话侧，二者走 Cordis 服务而不是互相 import |
| preset 是一段 YAML：`@deepseek-ai/dsh-agent-preset` 的 `config.plugins` | `tavern` preset 可以只挂我们自己的行，工具可以为零 |

## 数据模型

### CharacterCard（归一化后）

```ts
interface CharacterCard {
  schema: 1
  id: string                 // 文件名 slug，稳定标识
  sourceFile: string         // characters/<id>.png | .json
  avatarPath?: string        // PNG 原图；JSON 卡可选内嵌头像
  name: string
  description: string
  personality: string
  scenario: string
  firstMes: string
  mesExample: string
  alternateGreetings: string[]
  systemPrompt?: string      // 角色自带 system
  postHistoryInstructions?: string
  creatorNotes: string
  tags: string[]
  characterBook?: Lorebook   // 卡内嵌世界书；导入时拆到 lorebooks/，原样保留引用
  extensions: unknown        // 未知字段原样保留，便于将来兼容/导出
  sourceSpec: 'v1' | 'v2' | 'v3'
}
```

### Lorebook / LorebookEntry

```ts
interface Lorebook {
  schema: 1
  id: string
  name: string
  entries: LorebookEntry[]
  source: 'standalone' | 'embedded'   // 内嵌时记录所属 characterId
}

interface LorebookEntry {
  id: string
  keys: string[]
  secondaryKeys: string[]
  selectiveLogic: 'and' | 'or' | 'not'
  constant: boolean
  content: string
  order: number
  position: 'before_char' | 'after_char' | 'at_depth' | 'at_end'  // v1 仅使用排序列
  depth?: number
  probability: number
  group?: string
  enabled: boolean
}
```

### ChatBinding

```ts
interface ChatBinding {
  schema: 1
  sessionId: string
  characterId: string
  lorebookIds: string[]        // 空表示使用角色卡内嵌世界书
  greetingIndex?: number       // alternate_greetings 选择
  createdAt: string
  // 作者笔记与模板文本归工作区编排所有（D005），不在聊天绑定里
}
```

## 文件布局

```text
<workspace>/.dshtavern/
├─ tavern.json                  # 标记（D004）
├─ state/                       # 可重建缓存（角色卡解析结果、token 缓存）
└─ chats/<sessionId>.json       # ChatBinding
<workspace>/characters/         # 角色卡原文件（不改写）
<workspace>/lorebooks/          # 世界书 JSON（含从卡内拆出的）
<workspace>/prompts/            # 工作区级提示词编排（D005）
```

原则：**用户资料文件可读可备份，插件只写自己的 `.dshtavern/`**；`state/` 随时可删。

## 卡片读取

### 支持格式（候选，未定）

| 格式 | 解析方式 | 候选优先级 |
|---|---|---|
| PNG（V2/V3） | 遍历 PNG chunk 的 `tEXt` / `zTXt` / `iTXt`，关键字 `ccv3`（V3）或 `chara`（V2/V1），base64 解码 JSON | 高 |
| JSON（V2/V3） | 按 `spec: chara_card_v2/v3` 识别，`data` 为字段根 | 高 |
| JSON（V1/旧版） | 顶层扁平字段，缺 spec 时按 V1 处理 | 高 |
| CHARX（zip） | 解压 `card.json` + `embeded://` 资源映射 | 待定 |

读取规则：

- 同一 PNG 同时有 `chara` 与 `ccv3` 时 **`ccv3` 优先**（ST 导出会两个都写）。
- `spec_version` 按数值比较；高于支持的版本只读并在界面提示，不静默降级。

### SillyTavern 兼容矩阵（角色卡）

| ST 字段 | 归一化到 | 说明 |
|---|---|---|
| `data.name` | `CharacterCard.name` | 必填；V1 取顶层 `name` |
| `description` / `personality` / `scenario` | 同名字段 | V1 顶层同名字段 |
| `first_mes` / `mes_example` | `firstMes` / `mesExample` | 空串保留 |
| `alternate_greetings[]` | `alternateGreetings` | |
| `system_prompt` / `post_history_instructions` | 同名字段 | 保留 `{{original}}` 原文 |
| `creator_notes` / `creator` / `character_version` | `creatorNotes` / `creator` / `characterVersion` | |
| `tags[]` | `tags` | 大小写不敏感匹配由 UI 处理 |
| `character_book` | 拆成 `Lorebook`（`source: embedded`） | 原文保留在卡上 |
| `extensions` | `extensions` | **未知键原样保留** |
| V3 `nickname` / `group_only_greetings` / `creator_notes_multilingual` / `assets` / `creation_date` / `modification_date` | 同名字段或 `extensions` | v1 只解析保留，不使用 |
| V1 扁平对象 | 按 V1 归一化 | 其余字段进 `extra` |

### 解析流程

1. 读文件字节；按魔数判断 PNG 或 JSON。
2. PNG：校验签名 → 顺序读取 chunk（length/type/data/crc）→ 取 `tEXt`/`zTXt`/`iTXt` 的文本值 → base64 → JSON。
3. 判定 spec，选择字段映射；V2/V3 取 `data`。
4. 归一化到 `CharacterCard`；未知字段进 `extensions`。
5. 若存在 `character_book`：同时生成一个 `Lorebook`（source=embedded），写入 `lorebooks/`，并在卡上保留引用。
6. 返回并缓存（key = 文件路径 + mtime + size）。

### 导入与安全

- 上限：PNG ≤ 8MB、JSON ≤ 2MB；base64 解码前先校验长度，解码后再次限制。
- 文件名 slug 化，拒绝路径分隔符与 `..`；已存在同名卡时默认拒绝（不覆盖），改为 `name-2`。
- 写入走临时文件 + rename 原子写。
- 解析失败返回明确错误（缺 chunk / base64 非法 / JSON 非法 / spec 不支持），不落缓存。
- 卡片内容只作为文本拼进 prompt，不执行其中任何脚本；`extensions` 不参与渲染。

### 宿主接口（新服务 `ctx.tavernLibrary`）

| 方法 | 作用 |
|---|---|
| `listCharacters(workspacePath)` | 扫描 `characters/`，返回卡片摘要（id/name/avatar/tags） |
| `readCharacter(workspacePath, id)` | 返回完整归一化卡 |
| `importCharacter(workspacePath, bytes, filename)` | 校验 + 落盘 + 生成内嵌世界书 + 返回卡 |
| `deleteCharacter(workspacePath, id)` | 删除原文件（与关联 sidecar）；默认需 UI 二次确认 |
| `listLorebooks(workspacePath)` / `readLorebook(...)` | 世界书读取 |
| `readChatBinding(workspacePath, sessionId)` / `writeChatBinding(...)` | 聊天绑定 |
| `previewContext(workspacePath, sessionId)` | 装配结果预览（供检查器） |

对外仍走现有模式：`/tavern/*` 的 loopback JSON 路由（`GET /tavern/characters`、`POST /tavern/characters/import` 等），面板直接调用。

### 面板（v1 范围）

- 角色画廊：卡片网格（头像 + 名称 + 标签），按名称排序/搜索。
- 导入：文件选择 → 上传（base64 POST，带进度与错误提示）。
- 详情：只读展示归一化字段（不编辑原卡）；操作「开始聊天」「删除」。
- 空态：引导导入第一张卡。

## 世界书

v1 激活规则（确定性、可测试）：

1. `enabled` 的 `constant` 条目始终激活；
2. 其余条目按 `keys` 在「匹配文本」中做子串匹配（大小写不敏感，先不做正则/整词）；
3. 按 `order` 升序排列，同序按 id 稳定排序；
4. `secondaryKeys`、`selectiveLogic`、`probability`、`group` 解析进模型但 v1 不参与决策（保留字段，避免以后改文件格式）。

匹配文本（v1）：最近 N 条 user/assistant 消息的纯文本 + 本步新认领的用户消息（N 可配置，默认 6）。

内嵌世界书：导入角色时拆出为独立文件，`ChatBinding.lorebookIds` 为空时默认使用它。

### SillyTavern 兼容矩阵（世界书）

支持三种文档形态：

| 形态 | 结构 |
|---|---|
| ST 世界书文件 `worlds/*.json` | 顶层 `{ "entries": { "<uid>": entry } }`（map，非数组） |
| 卡内嵌 `character_book` | `{ "entries": [entry…] }`，条目用 `insertion_order` |
| V3 独立包裹 | `{ "spec": "lorebook_v3", "data": { … } }` |

字段映射（ST → 内部）：

| ST 字段 | 内部字段 | 说明 |
|---|---|---|
| `key` / `keysecondary` | `keys` / `secondaryKeys` | 内嵌形态里叫 `keys` / `secondary_keys`，两者都认 |
| `content` / `comment` | `content` / `comment` | `comment` 不进 prompt |
| `constant` / `disable` / `enabled` | `constant` / `disabled` | 内嵌形态用 `enabled`（取反） |
| `order` / `insertion_order` | `order` | **两者都映射为「升序插入位置」**：内嵌 `insertion_order` 小=靠前；独立 `order` 大=靠后，数值直接沿用（升序即正确语义） |
| `position`（数字 0–7）/ `position`（字符串） | `position` 枚举 | 数字：`0 before_char / 1 after_char / 2 top_an / 3 bottom_an / 4 at_depth / 5 before_examples / 6 after_examples / 7 outlet`；字符串：`before_char / after_char` |
| `extensions.position/depth/role/probability/...` | 对应字段 | ST 把自有字段写在 `entries[].extensions`，与顶层字段**同时认，extensions 优先** |
| `selective` / `selectiveLogic`（0–3） | `selective` / `selectiveLogic` | |
| `group` / `groupWeight` / `groupOverride` / `useGroupScoring` | `group` / `groupWeight` | v1 解析保留、不参与决策 |
| `scanDepth` / `caseSensitive` / `matchWholeWords` | 同名字段 | `null` = 跟随全局 |
| `excludeRecursion` / `preventRecursion` / `delayUntilRecursion` | 同名字段 | v1 解析保留 |
| `sticky` / `cooldown` / `delay` | 同名字段 | Timed Effects，v1 解析保留 |
| `probability` / `useProbability` | 同名字段 | v1 保留，暂不掷骰 |
| `ignoreBudget` / `vectorized` / `automationId` / `outletName` / `triggers` | `raw` 原样保留 | 不参与 v1 行为 |
| 未知字段 | `raw` | **原样保留**，不丢弃 |

条目上的未知字段一律进 `raw`，保持未来可扩展；v1 不写回、不导出，因此不需要无损 round-trip，但保留原文便于以后加导出。

## 上下文装配

### 装配单元

```text
[system: 主模板]
[system: 角色定义]        description / personality / scenario
[system: 世界书激活]      before_char 条目（A 路线合并进 system）
[system: 示例对话]        mesExample
[system: 作者笔记]        authorNote
------------ 历史（history）------------
[user/assistant ...]      DSH session 回放（A 路线不可改）
[post-history 指令]       postHistoryInstructions（B 路线可放到历史后）
```

### 路线 A（v1）

- 一个 `complete: true` 的 PromptSection，`text` 为函数，每次装配时由 prompt builder 生成。
- 历史由 DSH 回放；装配层只控制 system prompt 内容与顺序。
- 世界书激活状态由 `agent/pre-step` 钩子更新（读最近消息），写进插件内存缓存，供 section provider 读取；session 日志仍是唯一真相。
- 预算不足时：按「常驻 → order → 命中数量」优先级丢弃世界书条目，并记录丢弃清单供检查器/告警。

### 路线 B（后续，需 D002 升级）

- 包装 provider adapter，重建整条 messages：
  `system` → 角色/世界书（可 `before/after/depth` 插入）→ 示例 few-shot → 历史窗口（新→旧填预算）→ 本条输入。
- 历史裁剪、depth 注入、stop 序列、精确 token 预算都在这一层。
- 需要自定义记录「真实请求」以便回放与检查器。

### 首条问候

- v1 方案候选：仅放进 system prompt 的「示例」区，不伪造 session 事件。
- 备选方案：聊天创建时写入一条真实 assistant 消息（需要能写 session 事件，待验证必要性）。

## 预算

- 窗口：`session.requestContext()?.contextWindow`；未声明的模型回退到配置的默认窗口。
- 已用：`ctx.tokenMeter.measure(session)`；装配前用 `nodes[].tokens` 估算历史占用。
- 预留：completion 预算 = 模型 `maxTokens`（读不到则配置 `reservedCompletionTokens`）。
- 可用预算 = 窗口 − 预留 − 历史估算 − 固定 system 开销；不足时按优先级丢弃世界书条目并在检查器标红。
- A 路线只对「我们可控的部分」做预算；历史超限交由 DSH 的 compaction/告警，不自行裁剪。

## 上下文检查器

面板内一页（或抽屉），展示**最近一次请求**的装配结果：

- 每个块：名称、来源（模板/卡/世界书条目/示例/笔记）、顺序、估算 token；
- 被丢弃的世界书条目与原因；
- 历史占用、可用预算、模型窗口；
- 原始 system prompt 文本（可折叠），便于逐字校对；
- 数据来源：`previewContext()`（用当前 session 重新跑一遍 builder，不触达模型）。

## 接口与插件落点

| 插件行 | 职责 | 阶段 |
|---|---|---|
| 宿主根插件（现有 `dshtavern`） | 工作区标记 + `tavernLibrary` 资料服务 + `/tavern/*` 路由 | M1 扩展 |
| preset 行 `@dshtavern/context` | complete system prompt、世界书激活、预算、检查器数据 | M2 |
| 浏览器半（现有面板） | 角色画廊、导入、检查器、后续聊天入口 | M1/M2 |

## 分阶段

| 阶段 | 内容 | 依赖 |
|---|---|---|
| M1 | 卡片读取 + 世界书读取 + 角色画廊/导入 | 无（现在可做） |
| M2 | `tavern` preset + prompt builder（A）+ 世界书激活 + 预算 + 检查器 | D002 确认 A |
| M3 | 聊天绑定 + 新建聊天（agentPreset/首条问候策略） | M1/M2 |
| M4 | B 路线：adapter 包装、历史裁剪、depth 注入、few-shot 实际消息 | D002 升级 |

## 暂定非目标（待确认）

- 若最终只做只读兼容，则不实现编辑、写回 PNG/JSON、导出；
- 不解析/执行 ST 的预设、正则脚本、STscript、聊天记录、Quick Replies、扩展（是否纳入待讨论）；
- 不做图片生成、语音、向量检索/RAG 世界书；
- 不做多人角色群聊；
- 不改 DSH 的 session/workspace 契约（资料一律放工作区文件）。

## 待定（需要讨论）

1. **路线边界**：v1 只做 A（system prompt 自主 + 世界书激活 + 预算告警），还是要直接上 B（请求级重建）？这是 D002 的核心待定项。
2. **兼容程度**：只读导入（能读、能用于 prompt）是否够？还是需要编辑、写回、导出？是否保留原始文件以便未来导出？
3. **卡片格式范围**：PNG + JSON 的 V1/V2/V3 是否够？CHARX（zip）要不要进 v1？
4. **导入内容范围**：只导入「角色扮演相关字段」，还是把 `extensions` 里的卡级 regex、绑定的世界书目等也一并接管？（只解析保留 vs 参与行为）
5. **世界书 v1 规则**：只做「常驻 + 主关键词 + order」，还是 v1 就要 secondary keys / 概率 / 分组？
6. **聊天绑定存放**：工作区文件 `.dshtavern/chats/<id>.json`（可携带、可备份）还是插件 storage domain（更私密、但换机丢）？
7. **首条问候**：只进 system prompt，还是作为真实 assistant 消息落进 session？
8. **预算基准**：用真实 `contextWindow`（模型/提供方不同则行为不同），还是固定配置预算（行为稳定、但可能浪费窗口）？预留 completion 的比例？
9. **模板形态**：内置 JS 模板 + 配置覆盖，还是 v1 就做工作区文件/面板编辑器？
10. **检查器粒度**：只读预览即可，还是需要「保存每次请求快照」以便事后对比？

## 影响

- 后续新增设计文档：提示词模板与模板管理器、聊天界面与消息流。
- 现有 `01-interface.md` 的「创建与进入」流程需要补「选角色 → 建聊天」。
