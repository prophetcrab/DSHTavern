# DSH-Tavern

用 DeepSeek Harness 的插件机制实现 SillyTavern 式角色扮演。

**一个酒馆 = 一个带标记的工作区；每个聊天 = 一条会话；每轮 = 一次导演调用 + 每位开口角色各一次独立调用。** 导演决定旁白、节奏和谁说话，角色只看到自己的卡和可观察的舞台——两个角色不会互相污染语气，也不会看到导演的私有剧情。

**会话里有三个酒馆专属动作**：开场回合（新会话在玩家开口前先由模型生成整段开场，作为独立的第一轮写进对话）、重新生成（回退这一幕的舞台与世界状态后重演，旧回复标记为已被取代），以及点击气泡里的角色名直接对这个人说话。

- 架构与开发进度（唯一事实来源，随改动更新）：[docs/architecture.md](docs/architecture.md)
- 决策文档（为什么这样设计）：[docs/decisions/](docs/decisions/)
- 设计文档（准备采用的方案）：[docs/design/](docs/design/)

## 组成

插件包含三个可独立启停的组件，以及两个内部预设：

| 组件 | 作用 |
|---|---|
| `dshtavern` | 酒馆本体：工作区标记、提示词装配、模型调用拦截与编排、HTTP 路由 |
| `dshtavern/stats` | 用量统计：工作区与会话的 token、上下文占用、缓存命中率 |
| `dshtavern/tracker` | 剧情回顾：后台按计划把剧情重述成摘要，已回顾的轮次在导轨标绿 |
| `tavern-rp` / `tavern-novel` | 内部 Agent 预设，按工作区模式自动绑定，不出现在全局预设名单 |

后两个组件各自占一个插件行，删掉对应行即整体下线：路由消失、工具箱入口报告不可用，酒馆本体不受影响。内部预设也各占一行（`dshtavern/preset-rp` / `dshtavern/preset-novel`），这样插件列表里能分别显示自己的名字与说明。

## 工具箱

酒馆会话里有一个可拖动的悬浮工具箱图标，包含六个可用面板（「设置」入口有意置灰）：

| 面板 | 内容 |
|---|---|
| 提示词编排 | 15 个角色块 / 8 个导演块；拖拽排序、启停、编辑、预览、恢复默认 |
| Agent 编排 | 这一幕 / 上下文 / 模型 / 回复长度四个子页：每幕发言上限、上下文预算（四档一键预设，最大按 1M 窗口标定）、玩家点名优先、导演与角色各自的模型、统一/逐角色回复长度、推理预留 |
| 角色卡 | 角色卡 CRUD，导入/导出单文件 `.charc`；新会话会先由模型生成一段完整开场（场景 + 角色开口） |
| 世界书 | 工作区级条目编辑与触发预览，整本导入/导出 `.world` |
| 用量统计 | 工作区/会话 token、输入输出拆分、上下文占用、缓存命中率 |
| 剧情回顾 | 最新回顾 / 历史记录 / 设置三个子页；见下 |

**剧情回顾**在后台独立运行，不占用当前回合的模型调用。每次运行都从开场读到目标轮次的**完整剧情**，重写成一份当前状态摘要：

- 触发方式二选一：**每新增 N 轮** 或 **每 N 分钟**（不是两个条件竞速，配了哪个就只看哪个）
- 摘要按三段组织：**世界**现状、**你**（玩家）的处境、**每个角色**各自的进展
- 篇幅按三段各自配置，另有四档一键预设：精简 / 标准 / 详细 / 详尽
- 已回顾的轮次在右侧轮次导轨上标绿；被重新生成覆盖的轮次会撤销标记，并提示摘要已过期

侧栏的工作区列表里，酒馆工作区的文件夹图标会着色，标题后带一个「酒」徽章。

## 数据布局

全部落在酒馆工作区内：

```text
<tavern>/
  .dshtavern/
    tavern.json              # 标记：schema / mode / title / tavernId / createdAt
    worldbook.json           # 工作区级世界书
    agent.json               # Agent 编排设置（缺失即用默认值）
    state/last-request.json  # 被拦截的 loop 请求（只有工作区提示词）
    stories/<session>/
      opening.json           # 生成的开场脚本（含当时的 prompt 与模型）
      stage.jsonl            # 舞台：追加写的旁白与台词
      world.json             # 导演私有：场景 / 事实 / 未揭示剧情
      beats/<timestamp>.json # 每次 beat 的完整证据（含回退所需的舞台长度与世界快照）
      regenerations.json     # 被重新生成取代的回合 → 替代回合
    tracker/
      config.json            # 回顾设置（触发方式 / 间隔 / 篇幅预算）
      state.<session>.json   # 该聊天上次回顾到第几轮
      summaries/<session>/   # 每次回顾一份，文件名是它覆盖到的轮次
  characters/<id>.charc      # 角色卡
  prompts/prompt.json        # 角色提示词编排
  prompts/director.json      # 导演提示词编排
```

## 使用

安装并加载后，侧栏出现「酒馆」入口：

1. **新建酒馆**：填名称（可再指定绝对目录）→ 创建目录、原子写入标记、注册为 DSH 工作区；
2. 列表显示所有酒馆工作区，按最近刷新时间自动更新。

创建是进入酒馆的唯一入口，面板上也没有退出的按钮：想让一个目录成为酒馆，就在新建表单里把路径指向它；想撤销，删掉该目录下的 `.dshtavern/tavern.json` 即可——目录本身和已有的聊天记录都不受影响。

创建时必须选择模式（角色扮演 / 小说），创建后不可更改。面板自动刷新（挂载时、每 4 秒、窗口重新获得焦点时、每次操作后）。

**点击气泡里的角色名**，输入框会预填「对白鹭说：」并把光标停在冒号后——补完这句话发出去，这一轮就由该角色回应。点击本身不会发送任何东西，也不会消耗模型调用。

每幕的提示词可在会话的 **轨迹** 页查看：每次导演调用（含续幕与格式修复）和每位角色的 system / user / 回复都按顺序记进会话日志，折叠行显示「第 N 轮 · 导演 + 角色名」。它们不是 DSH 的 `system/message`（编排器绕过 loop 自己发请求），只是插件的 `ignorable` 记录，不进模型历史。

最新一条回复下方有 **重新生成**：回退到这一幕开始前的舞台与世界状态，让导演和角色重演一次。新回复作为下一轮追加，旧回复保留并标记「这一条已被第 N 轮重新生成取代」——DSH 的转写只追加，无法原地改写，所以旧回复不会消失。只有最新的回复能重生成。

## 开发

```sh
pnpm install
pnpm build      # 宿主 tsc + 浏览器半 tsdown
pnpm test       # 380 项，全离线
pnpm typecheck
```

对运行中的 `dsh web` 跑接口自测（只读 52 项 / 写入 68 项，可重复执行）：

```sh
node scripts/selftest-http.mjs  --base http://127.0.0.1:3080
node scripts/selftest-write.mjs --base http://127.0.0.1:3080
```

## 安装

安装在当前运行的 `web` profile：

```sh
cd <deepseek-harness checkout>
pnpm dsh plugin --profile web add D:/project/DSHTavern
```

注意两点：

- `dsh plugin` 自建的 profile 以 `@deepseek-ai/dsh-base` 为底，不含 workspace registry。本插件的 `ctx.tavernWorkspaces` 依赖 web 层，所以自定义 profile 必须用 `--from-default-profile web` 创建。
- 路径用正斜杠。Git Bash 会把反斜杠当转义符，写成 `D:\project\DSHTavern` 会被解析成不存在的 `D:projectDSHTavern`。

### 改了源码之后

1. `pnpm build` 重新生成 `lib/`；
2. 浏览器半由 client-hmr 按 `lib/client.js` 的改动自动热替换；
3. 宿主半在 profile HMR 的下一次 reconcile 时替换（用 `plugin_manager set_plugin` 禁用再启用，或重启 DSH）。

## 安装到桌面版（Electron）

桌面版的 `desktop` profile 由应用独占管理，CLI 会拒绝：

```text
error: profile "desktop" is managed exclusively by the Electron application
```

在 GUI 里安装：侧栏打开「插件」→「添加插件」→ 输入本地绝对路径 → 确认信任后安装。桌面版启用了 HMR，通常无需重启。

## 已知限制

- **小说模式**：能创建工作区并绑定 `tavern-novel`，但提示词块与编排尚未实现，发消息不会有回复。
- **角色卡格式**：只认原生 `.charc`，SillyTavern 的 PNG / V2 JSON 卡需先转换。
- **只能重生成最新一幕**：更早的回合要连同其后所有回合一起回退，而只追加的转写无法表达。
- **缓存命中率偏低**：导演与角色提示词里，会变化的世界状态和舞台记录紧接在静态前缀之后，缓存只能复用到断点。这是当前提示词结构的直接结果。

## 许可证

[MIT](LICENSE)。

`samples/characters/upstream/` 下的示例角色卡来自 [teknium1/character-cards](https://github.com/teknium1/character-cards)，版权归原作者，不适用本项目的许可证；详见该目录的 [README](samples/characters/README.md)。

