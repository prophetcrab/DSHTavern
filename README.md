# DSH-Tavern

用 DeepSeek Harness 的插件机制实现 SillyTavern 式角色扮演。

**一个酒馆 = 一个带标记的工作区；每个聊天 = 一条会话；每轮 = 一次导演调用 + 每位开口角色各一次独立调用。** 导演决定旁白、节奏和谁说话，角色只看到自己的卡和可观察的舞台——两个角色不会互相污染语气，也不会看到导演的私有剧情。

**会话里有两个酒馆专属动作**：开场回合（新会话在玩家开口前先由模型生成整段开场，作为独立的第一轮写进对话）和重新生成（回退这一幕的舞台与世界状态后重演，旧回复标记为已被取代）。

- 架构与开发进度（唯一事实来源，随改动更新）：[docs/architecture.md](docs/architecture.md)
- 决策文档（为什么这样设计）：[docs/decisions/](docs/decisions/)
- 设计文档（准备采用的方案）：[docs/design/](docs/design/)

## 组成

插件包含两个可独立启停的组件，以及两个内部预设：

| 组件 | 作用 |
|---|---|
| `dshtavern` | 酒馆本体：工作区标记、提示词装配、模型调用拦截与编排、HTTP 路由 |
| `dshtavern/stats` | 用量统计：工作区与会话的 token、上下文占用、缓存命中率 |
| `tavern-rp` / `tavern-novel` | 内部 Agent 预设，按工作区模式自动绑定，不出现在全局预设名单 |

`preset-tavern`（旧版兼容 id）已移除。宿主只按工作区 mode 绑定 `tavern-rp` 或 `tavern-novel`，不会再产生该预设的新会话。

## 工具箱

酒馆会话里有一个可拖动的悬浮工具箱图标，包含六个面板：

| 面板 | 内容 |
|---|---|
| 提示词编排 | 15 个角色块 / 8 个导演块；拖拽排序、启停、编辑、预览、恢复默认 |
| Agent 编排 | 每幕发言上限、上下文预算（四档一键预设，最大按 1M 窗口标定）、玩家点名优先、导演与角色各自的模型、统一/逐角色回复长度 |
| 角色卡 | 角色卡 CRUD，导入/导出单文件 `.charc`；新会话会先由模型生成一段完整开场（场景 + 角色开口） |
| 世界书 | 工作区级条目编辑与触发预览，整本导入/导出 `.world` |
| 用量统计 | 工作区/会话 token、输入输出拆分、上下文占用、缓存命中率 |
| 剧情回顾 | 后台按「每 N 轮 / 每 N 分钟」把剧情重述成世界 + 逐角色进展摘要，已追踪的轮次在右侧导轨标绿 |

侧栏的工作区列表里，酒馆工作区的文件夹图标会着色，标题后带一个「酒」徽章；收编或取消标记后自动跟随。

## 数据布局

全部落在酒馆工作区内：

```text
<tavern>/
  .dshtavern/
    tavern.json              # 标记：mode / title / tavernId
    worldbook.json           # 工作区级世界书
    state/agent.json         # Agent 编排设置（缺失即用默认值）
    state/last-request.json  # 被拦截的 loop 请求（只有工作区提示词）
    stories/<session>/
      stage.jsonl            # 舞台：追加写的旁白与台词
      world.json             # 导演私有：场景 / 事实 / 未揭示剧情
      beats/<timestamp>.json # 每次 beat 的完整证据（含回退所需的舞台长度与世界快照）
      regenerations.json     # 被重新生成取代的回合 → 替代回合
  characters/<id>.charc      # 角色卡
  prompts/prompt.json        # 角色提示词编排
  prompts/director.json      # 导演提示词编排
```

## 使用

安装并加载后，侧栏出现「酒馆」入口：

1. **新建酒馆**：填名称（可再指定绝对目录）→ 创建目录、原子写入标记、注册为 DSH 工作区；
2. 列表显示所有酒馆工作区，可**取消标记**（二次确认；保留目录与会话）；
3. 「收编已有工作区」把已有目录标记为酒馆。

创建时必须选择模式（角色扮演 / 小说），创建后不可更改。面板自动刷新（挂载时、每 4 秒、窗口重新获得焦点时、每次操作后）。

每幕的提示词可在会话的 **轨迹** 页查看：每次导演调用（含续幕与格式修复）和每位角色的 system / user / 回复都按顺序记进会话日志，折叠行显示「第 N 轮 · 导演 + 角色名」。它们不是 DSH 的 `system/message`（编排器绕过 loop 自己发请求），只是插件的 `ignorable` 记录，不进模型历史。

最新一条回复下方有 **重新生成**：回退到这一幕开始前的舞台与世界状态，让导演和角色重演一次。新回复作为下一轮追加，旧回复保留并标记「这一条已被第 N 轮重新生成取代」——DSH 的转写只追加，无法原地改写，所以旧回复不会消失。只有最新的回复能重生成。

## 开发

```sh
pnpm install
pnpm build      # 宿主 tsc + 浏览器半 tsdown
pnpm test       # 378 项，全离线
pnpm typecheck
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
