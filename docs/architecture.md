# DSH-Tavern 架构与进度

> 本文是这个插件项目的唯一架构与进度说明，每次改动同步更新。
> 最后更新：2026-10-22 ｜ 插件版本：0.1.0 ｜ 依赖 dsh `>=0.2.1-rc.2 <0.3.0`

## 一、它是什么

用 DeepSeek Harness 的插件机制实现 SillyTavern 式角色扮演。一个**酒馆 = 一个带标记文件的工作区**，酒馆里的每个聊天是一条 DSH 会话，一次用户输入由**导演**决定发生了什么，再由**角色**分别回应。

插件分两半交付：

- **宿主半**（Node）：一个 Cordis Service，提供工作区标记、提示词装配、模型调用拦截与编排、HTTP 路由。
- **浏览器半**（Web）：侧栏「酒馆」面板、会话内悬浮工具箱，以及提示词编排 / Agent 编排 / 角色卡 / 世界书 / 用量统计五个子窗口。

## 二、运行形态

`package.json` 的清单决定插件如何被 DSH 装载：

| 字段 | 值 | 作用 |
|---|---|---|
| `main` | `lib/index.js` | 宿主入口（酒馆本体） |
| `exports["./client"]` | `lib/client.js` | 浏览器入口 |
| `exports["./stats"]` | `lib/stats/index.js` | 用量统计子插件入口 |
| `dsh.bundle.patch` | `cordis.patch.yml` | 装载时向 profile 插入的层 |
| `dsh.client.platform` | `web` | 浏览器半运行平台 |
| `dsh.client.inject` | layout、sidebar | 注入依赖的客户端 UI 包 |

`cordis.patch.yml` 插入 4 行：`dshtavern` 本体、`dshtavern-stats` 子插件，以及 `preset-tavern-rp`、`preset-tavern-novel` 两个内部 preset。两个 preset 都从全局 preset 名单中隐藏，由宿主按工作区 `mode` 自动绑定。

旧版的 `preset-tavern`（`id: tavern`）已移除：宿主只绑定 `tavern-rp` / `tavern-novel`，且该 id 在本机所有会话的 `agentPreset` 投影中从未出现，没有遗留会话依赖它。

浏览器半用 tsdown 打成 `lib/client.js`：CJS 闭包工厂，React 从外部注入，由客户端的模块系统加载。

## 三、模块划分

宿主半：

| 文件 | 职责 |
|---|---|
| `src/index.ts` | `TavernWorkspaceService`（服务名 `tavernWorkspaces`，注入 `workspaceRegistry`、`llm`）：标记 CRUD、路由注册、preset 绑定、请求拦截与编排入口 |
| `src/orchestrator.ts` | 一次 beat 的编排：导演提示词、角色提示词、导演回复解析、beat 渲染 |
| `src/prompt-layout.ts` | 角色 12 块 / 导演 7 块目录，顺序与启停的持久化、占位符替换 |
| `src/worldbook.ts` | 世界书条目的匹配与预算裁剪 |
| `src/stage.ts` | 舞台（append-only）与导演私有的世界状态 |
| `src/character-card.ts` | 角色卡 schema 与文件读写 |
| `src/preview.ts` | 不调用模型的提示词预览 |
| `src/http.ts` | loopback 校验与 JSON 响应 |
| `src/stats/index.ts` | 子插件 `dshtavern-stats`：用量聚合与 `/tavern-stats/*` 路由 |
| `src/session.ts` | 备选的 preset 行实现，**当前 profile 未挂载**（见「未完成」） |

浏览器半：

| 文件 | 职责 |
|---|---|
| `src/client/index.ts` | 面板注册：`main`、`sidebar.panellist`、`conversation.input.left`、`shell.overlay`；酒馆列表与新建/收编/取消标记 |
| `src/client/toolbox.ts` | 悬浮启动器、图标浮层、子窗口容器；每 15 秒刷新酒馆列表 |
| `src/client/characters.ts` | 角色卡列表与编辑表单 |
| `src/client/worldbook.ts` | 世界书条目编辑与触发预览 |
| `src/client/prompt.ts` | 提示词编排：角色/导演切换、拖拽排序、启停、编辑、预览、恢复默认 |
| `src/client/stats.ts` | 用量面板：工作区/会话 token、上下文占用、缓存命中率 |
| `src/client/styles.ts` | 面板、工具箱、故事文本（对白/旁白）样式 |

## 四、数据布局

全部落在酒馆工作区内：

```text
<tavern>/
  .dshtavern/
    tavern.json              # 标记：schema 1 / kind / tavernId / createdAt / mode / title
    worldbook.json           # 工作区级世界书
    state/last-request.json  # 最近一次最终请求快照（调试用）
    state/agent.json         # Agent 编排设置；缺失即使用默认值
    stories/<session>/
      stage.jsonl            # 舞台，append-only，每行一条 narration/speech
      world.json             # 导演私有：scene / facts / hidden
      beats/<timestamp>.json # 每次 beat 的完整证据（导演与角色提示词、回复、决策）
  characters/<id>.charc      # 角色卡，一卡一文件
  prompts/prompt.json        # 角色提示词编排
  prompts/director.json      # 导演提示词编排
```

标记文件是唯一的酒馆判据：删除标记即退出酒馆，目录与会话保留。`mode` 创建时二选一（`rp` / `novel`），创建后不可更改。

## 五、请求链路

1. 会话的 `cwd` 是酒馆目录时，宿主在 `agent/created` 绑定 preset（`rp` → `tavern-rp`，`novel` → `tavern-novel`）。
2. 每次装配 system prompt 时，用工作区 `prompts/prompt.json` 渲染出**唯一**的完整 system 段（`complete: true`）；运行时上下文被抑制，只保留 `working-directory:current` 一条；工具列表清空。
3. 用户发言后，`llm/stream` 拦截**带 agent-loop 标记**的请求，转入编排；导演和角色的辅助调用不带该标记，直接放行。
4. `orchestrateBeat` 的循环（最多 3 次发言）：
   - 读标记、角色卡、世界书、舞台、世界状态、两套编排；
   - 调导演，期望返回 `{"narration","inner","nextSpeaker"}`；
   - 旁白入舞台；解析出的说话人按 id 或名字匹配；
   - 为该角色单独发起一次调用：它自己的卡 + 激活的世界书 + 舞台 + 本轮旁白与玩家输入；
   - 角色台词入舞台，继续下一轮，直到 `nextSpeaker` 为空或触顶。
5. beat 结束后落盘 `stage.jsonl`、`world.json`、`beats/*.json`，并把结构化结果渲染成 Markdown 返回给 agent loop：旁白为引用块，台词为 `**角色名**` 加粗。

## 六、HTTP 路由

全部 loopback-only（校验 socket 地址，并拒绝 `sec-fetch-site: cross-site`）。

| 路由 | 方法 | 用途 |
|---|---|---|
| `/tavern/state` | GET | 酒馆列表 + 全部工作区及其酒馆标记 |
| `/tavern/create` | POST | 建目录、写标记、注册工作区 |
| `/tavern/adopt` | POST | 把已有工作区标记为酒馆 |
| `/tavern/untag` | POST | 删除标记（保留目录与会话） |
| `/tavern/prompt` | GET/POST | 读/写角色或导演编排（`?scope=director`） |
| `/tavern/characters` | GET/POST | 角色卡列表、创建、保存、删除 |
| `/tavern/characters/transfer` | GET/POST | 导出单张卡为 `.charc`（`?id=`）／导入 `.charc` |
| `/tavern/worldbook` | GET/POST | 读/写世界书 |
| `/tavern/worldbook/transfer` | GET/POST | 导出整本世界书为 `.world`／导入 `.world`（替换） |
| `/tavern/agent` | GET/POST | 读/写/重置工作区的 Agent 编排设置 |
| `/tavern/models` | GET | 供应商路由与其模型列表，供模型选择器使用 |
| `/tavern/preview` | GET | 不调用模型的提示词预览 |
| `/tavern-stats/ping` | GET | 子插件存活探测（客户端据此判断是否启用） |
| `/tavern-stats/state` | GET | 用量快照：`?workspaceId=`、可选 `?sessionId=` |
| `/tavern/debug/presets` | GET | **临时**：查看 preset 组合，用于诊断 |

## 七、用量统计子插件

`dshtavern-stats` 是独立的插件行（`cordis.patch.yml` 中 `name: 'dshtavern/stats'`），删掉该行即整体下线：路由消失，工具箱的「用量统计」入口显示为不可用，酒馆本体不受影响。

数据全部来自 DSH 已有的持久化投影，不另做计数：

| 指标 | 来源 |
|---|---|
| 工作区 / 会话 token 总量 | `tokenUsage` 投影的四个互斥桶（未缓存输入、缓存读、缓存写、输出） |
| 输入 / 输出拆分 | 同上；输入 = 未缓存输入 + 缓存读 + 缓存写 |
| 上下文使用 | `contextPressure` 投影的 `projectedTokens` 与 `contextWindow` |
| 缓存命中率 | `cacheRead / (cacheRead + uncachedInput)` |
| 会话标题 | `title` 投影 |

工作区归属按会话 `header.cwd` 判定：等于工作区目录或位于其下即计入。面板每 10 秒刷新一次，只统计运行中的会话。

**关键前提**：编排器接管了 agent loop 自己的模型调用，因此必须把各次调用上报的 `usage` 累加后作为 `usage` chunk 转发给 loop，否则 loop 记录的 assistant 消息不带用量，`tokenUsage` 投影会一直是 0。`complete()` 收集每次调用的用量，`textReply()` 在 `finish` 前发出一个合并后的 `usage` chunk。

## 八、开发进度

已完成并实测：

- 工作区标记的新建、收编、取消标记；三者与磁盘标记、DSH 工作区注册、面板读模型一致。
- 酒馆面板：列表、自动刷新（挂载 / 每 4 秒 / 窗口聚焦 / 操作后）、二次确认、响应式字号。
- 角色卡：原生格式 CRUD（`characters/<id>.charc`，schema 1，单卡上限 256KB）；导入/导出为单文件 `.charc`，导入时重新分配 id 与时间戳，因此导入到来源工作区得到的是副本而非覆盖。
- 世界书：工作区级条目编辑、关键词触发预览；四种次要词逻辑、三种插入位置、`director` 专属条目、8 条 / 6000 字预算。整本导出为 `.world`（带 `kind: dshtavern.worldbook` 的封套，含全部条目），导入替换当前整本；也接受裸条目数组便于手写。
- 两个侧栏头部采用「标题行 + 操作行」两行结构：标题与计数占一行，操作按钮等分下一行。加按钮不会再把标题挤成 0 宽。
- 侧栏工作区列表里的酒馆标记：酒馆工作区行的文件夹图标着色，标题后追加一个「酒」徽章。DSH 侧栏没有工作区行插槽（只有会话行的 `leading` / `hover` 两个装饰位），因此客户端观察已渲染的 `[data-row-key="workspace:<id>"]` 行并按 registry 的 workspace id 打 `data-dshtavern-workspace` 属性，样式由一张注入的样式表提供；`MutationObserver` 让侧栏重渲染后自动重新标记。按 id 而非标题匹配，重命名不会把标记挪到别的行。
- Agent 编排面板：按「这一幕 / 上下文预算 / 角色分工模型 / 回复长度」四组暴露运行时旋钮。每幕发言上限、角色可见舞台行数、世界书扫描行数与预算、玩家输入上限、轮换发言、玩家点名优先、无法解析时是否让首位角色顶替、导演 / 角色各自的模型与推理等级，以及统一回复长度（含一键档位）、导演回复长度、逐角色回复长度与推理预留。设置存于 `<workspace>/.dshtavern/agent.json`，缺失时使用与旧常量完全一致的默认值。
- 回复长度按「字」配置、按 token 下发：字数 × 0.6 换算成 `maxTokens`。因为 provider 的 `max_tokens` 同时约束思考与正文，默认再加 512 token 推理预留；实测在最高推理等级下，240 token 的纯正文上限会让模型把预算全花在思考上、正文返回 0 字，加上预留后同一预算恢复正常产出。任一调用触顶时该轮回复末尾追加截断提示。
- 上下文预算上限按 1M token 窗口重新标定：舞台 4–2000 行、扫描 4–2000 行、世界书 1–200 条 / 200–400000 字、玩家输入 200–120000 字。四个一键预设 `精简 / 标准 / 充裕 / 极限` 分别对应旧默认、中等、偏大和接近窗口上限；`极限` 约 420k token，仍留有系统提示词与回复的余量。新增可选的「舞台字数上限」，因为行数放大后单行长度会让总字数不可预测，超出时从最旧记录开始丢弃。
- 提示词编排：角色 12 块、导演 7 块；拖拽排序、启停、编辑、预览、恢复默认；只持久化与默认值的差异。卡片显示块的来源、字数与编辑入口，停用块以虚线边框和「已停用」标签区分；运行时填充的块标注「运行时」而非字数。预览面板的角色卡下拉直接读 `/tavern/characters`，打开即列出全部真实角色卡并默认选中第一张。
- 角色扮演编排：导演决策 → 角色独立调用 → 分段渲染；实测多角色登场、线索按世界书逐层释放、跨轮舞台累积。
- 导演 JSON 合规：输出格式块从目录位置抽出，**固定拼在 system 提示词最末**（`buildDirectorSystem` / `buildDirectorContinuation` 都如此）。依据是实测 33 个 beat / 67 个回合：首轮失败率 24%，后续轮只有 2.9%——差别就在后者恰好以重申输出契约结尾。格式文本也改为明确「第一个字符是 `{`，最后一个字符是 `}`」。另加一道修复调用：解析不出 JSON 且未被截断时，把原回复和格式要求再发一次，让模型把已有决定转写成 JSON（不重新决策，只有失败时才多这一次调用）。改后 6 个回合全部合规。
- 开场脚本：空会话在输入框上方显示一张卡片（`conversation.input.dock`，仅 `session.blank` 时渲染），玩家一开口即消失。内容是**一次真实模型调用生成的整段开场**，而不是卡里的静态字段：
  - 生成发生在 `GET /tavern/greeting?sessionId=` 首次请求时，用 `agentDefaultModel.currentSelection()` 取 provider/model（冷会话还没有请求头，这是唯一来源），提示词要求「1–2 段旁白铺陈场景 + 1–2 位角色开口」，并强制 `{"segments":[...]}` 的 JSON 输出。
  - 结果按会话存到 `.dshtavern/stories/<session>/opening.json`，重开不再生成；舞台已有内容时不再生成（迟到的开场会读成第二个开头）。
  - 生成完成后，卡片调用 `POST /tavern/opening` 排队一个**开场回合**：宿主用 `sessionController.resolveAgent()` 取回 Agent，投递一条 `source.kind = 'tavern-opening'` 的 followup 消息。回合由 agent loop 打开（turn 编号归它所有），编排器识别这个来源后不调用导演，直接把脚本分段写进本回合回复与舞台，因此开场出现在玩家第一句话**之前**，并进入模型的派生历史。
  - **不能从插件里直接 append turn 事件**：v4 会话格式要求 turn 从 1 开始，且 `system/message` 必须是 surface 第一个节点。手工写的 turn 0 能进内存日志，但重载时会报 `turn/start does not open the expected turn` 或 `system/message requires a protected first surface head`，整个会话变成不可读——本次就是这么发现并修复的。
  - 开场回合落盘后舞台必然已有内容，`requestOpening` 先看舞台长度再看 `turnBoundary`，第二次触发直接返回，不会写出第二个开头。
  - 同时按旁白/台词顺序写进**舞台**（导演与角色读到的历史）。只有 `stage` 为空时才会走到兜底路径（玩家在脚本生成完成前就发言），此时开场并入本回合回复。
  - 生成失败或解析不出可用段落时，回退到静态开场：`scenario` 作旁白、`greetings.first` 作台词，各取「名册顺序里第一个真正有内容的卡」。`greetings.alternates` 尚未使用（重开需搭配重生成）。
  - **样式归属**：开场卡的规则放在 `PANEL_CSS`，由侧栏标记那个常驻 effect 注入；不能放 `TOOLBOX_CSS`——它只在工具箱浮层打开时挂载，会让卡片完全没有样式。`--tv-*` 设计变量同时声明在 `.dshtavern-panel`、`.dshtavern-greeting` 和 `.dshtavern-regenerate-row` 上，因为后两者渲染在会话里、不在面板内，只声明在面板上会让它们的所有 `calc()` 失效。
  - **生成中状态与并发**：一次生成通常十几秒，卡片在此期间显示转圈、「正在生成开场…」和一行说明（尊重 `prefers-reduced-motion`）。按 story 目录去重：预聊天卡片与第一个 beat 请求同一次生成，玩家在转圈期间直接发言也不会触发第二次调用，更不会让静态兜底抢在生成前面。
- 自动绑定 preset（`rp` → `tavern-rp`，`novel` → `tavern-novel`）。
- 轨迹可见性：编排器自己拼请求，导演与角色的 system 从不过 loop 的 `system/message` 路径，所以轨迹里原先只有那份每轮不变的工作区提示词。现在每幕结束追加一条 `plugin:dshtavern/beat` 插件记录（`ignorable`，不进模型派生历史），内容是这一幕**每一次**调用的 `role / model / system / user / reply`，按执行顺序：导演、续幕导演、格式修复、每位开口角色。开场回合单独记一条 `opening`。单字段上限 64 KiB（常规一幕 2–3 KB，原样保留；超过上限的极端上下文只记截断副本并标记，全文仍在 `beats/*.json`）。浏览器半用 `uiConversation.events.register` 注册一个 `target: 'trajectory'` 的 Definition，把记录渲染成一行「第 N 轮 · 导演 + 角色名」，详情按调用分节展开。导演私记放在详情最末，因为折叠行显示的是正文开头。
- 重新生成：转写只追加，DSH 没有原地改写某条回复的机制，所以「重来」实现为**回退剧情状态后重演这一幕**：
  - 只有最新一幕能重生成。`/tavern/regenerate` 先比对调用方给的 turn 与最新 beat 记录的 turn，不一致就拒绝——更旧的回合之后每一幕都得一起丢弃，而界面无法撤回。
  - 回退点来自 beat 记录：`stageCountBefore`（这一幕开始前的舞台长度）与 `worldBefore`（当时的导演世界状态）。旧记录缺这两个字段时，用记录里描述的旁白/台词条数反推。
  - 裁切**只在内存里算**，落盘发生在重演结束之后：模型调用失败时剧情文件保持原样，不会「旧的删了、新的没写成」。
  - 重演推进一次正常 beat，新回复作为**下一轮**追加；被取代的回合写进 `regenerations.json`（`turn` → `replacement`），客户端据此把旧回复标成「这一条已被第 N 轮重新生成取代」，并沿替换链找到最终文本。旧回复仍留在转写里，这是只追加模型的必然结果。
  - 触发器是一条 `source.kind = 'tavern-regenerate'` 的 followup 消息，编排器靠它区分「重演」与「玩家真打了一模一样的字」；玩家输入从 beat 记录里取回。同一会话 120 秒内只接受一次排队，双击不会重演两次。
  - 重演期间舞台被原地追加（下一条 prompt 要读最新状态），落盘必须直接写这份数组，不能再拼一次 `staged`——否则每一行都会写两遍。
  - 客户端只在「最新已结束回合」且宿主报告它可重放时显示按钮；`GET /tavern/regenerate` 同时返回替换记录与 `replayableTurn`，开场刚结束、还没有 beat 的会话不会出现必然失败的按钮。
- 用量统计子插件：工作区总量、当前会话用量、输入/输出拆分、上下文占用条、缓存命中率条、会话明细表；每 10 秒刷新。面板内容限宽 720px 居中，两卡两表双列自适应（窄窗降为单列并隐藏次要列）。实测面板数值与 DSH 自身状态栏一致（12.2k tokens、命中率 12.3%、上下文 1.05%）。
- 测试与构建：`pnpm test` 316 项通过（24 个文件），`pnpm build` 产出宿主 `lib/*.js`、`lib/stats/index.js` 与浏览器 `lib/client.js`。

## 九、未完成与已知问题

**未实现**

- **小说模式**：能创建工作区、绑定 `tavern-novel`，但宿主对非 `rp` 模式返回空 system prompt，编排器直接返回空回复。消息发出后界面显示「已完成」但没有任何内容，也没有提示。
- **角色卡第三方格式**：只认原生 `.charc`。SillyTavern V2/V3（PNG `chara`/`ccv3` 块、V2 JSON）尚未支持，需要时得先转成原生格式。
- **工具箱「设置」**：入口有意置灰。
- **`src/session.ts`**：导出了 `./session` 子路径，但当前 `cordis.patch.yml` 的三个 preset 都是 `plugins: []`，该行未被挂载；提示词由宿主直接注册。
- **`/tavern/debug/presets`**、`session.ts` 的调试日志、部分 `TEMPORARY` 注释：诊断残留，未清理。

**已知缺陷**

- **`inner` 只取首轮**：多轮调度中，后续轮导演写出的剧情推进被丢弃，世界状态会落后于实际剧情。
- **`facts` 从不写入**：`writeWorld` 每次原样回写 `world.facts`，导演没有写事实的通道，只有 `hidden` 增长。
- **`stage.jsonl` 无修复机制**：与 DSH 会话日志不同，进程中断留下的半截行不会被截断。
- **DSH 会话记录的是编排后的整段回复**：一次 beat 中的多段旁白与台词在会话日志里是一条 assistant 消息；结构化细节只在 `beats/*.json` 与 `stage.jsonl` 中。
- **用量只统计运行中的会话**：重启后未打开的酒馆会话不出现在面板里，因为面板读的是 `sessions.list()` 的实时会话。历史会话的用量仍需读持久化投影缓存。
- **一个 beat 的用量合并成一条**：导演与各角色的多次调用累加后作为单条 `usage` chunk 上报，所以面板显示的是整轮总额，分不出哪次调用花了多少；分次明细只在 `beats/*.json` 的 `turns` 里。
- **不报告 tok/s**：编排器用一次 `block-end` 交付整轮文本，不产生 `text-delta`。DSH 的输出速度取「首个 token delta 到消息落盘」的窗口，而这一整轮实际包含多次串行模型调用；若合成一个 delta，会把几秒的工作算成几十万 tok/s。代价是状态栏不显示输出速度，token 数、缓存命中率与正文渲染都不受影响。
- **历史会话的旧 tok/s 不会自愈**：`sessionStats` 是贯穿整个会话的累计投影，修复前录下的异常 `decodeMs` 会保留在该会话里；新建会话即恢复正常。
- **重新生成会留下旧回复**：DSH 的转写只追加，旧回合不会被删除，只会被标成「已被第 N 轮取代」。它的 token 也照常计入用量。
- **只能重生成最新一幕**：按钮只出现在最新已结束回合下。更早的回合要求连同其后所有回合一起回退，而只追加的转写无法表达。
- **旧 beat 没有回退快照**：`stageCountBefore` / `worldBefore` 是这次才加的字段。旧记录靠条数反推裁切点，世界状态无法还原，重演会从当前世界起步。
- **开场/重生成回合的触发行标题是通用的**：开场与重新生成都表现为一条唤起回合的消息，`ui-chat` 的 `turn-trigger` 按 `source.kind` 取标题，未知 kind 一律显示「收到执行请求」。插件没有覆盖这个节点的插槽（覆盖会影响所有会话），所以只有展开后才看得到「生成开场」/「重新生成上一幕」的说明。对话页的 System 节点同理，仍然只显示工作区提示词——真实提示词在**轨迹**页的酒馆记录里。

## 十、验证方式

```sh
pnpm install
pnpm test        # 24 个文件、316 项，全离线
pnpm build       # 宿主 tsc + 浏览器 tsdown
```

装进正在运行的 `dsh web`：

```sh
pnpm dsh plugin --profile web add D:/project/DSHTavern
```

可复现的完整剧本（5 角色、16 条世界书、两套编排）在 `samples/projects/changye-huanxian/`，`install.mjs` 通过上述路由一键导入。
