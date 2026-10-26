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
| `dshtavern/image` | 生图：场景插画与角色立绘，先编辑/细化/批准提示词，再手动调用第三方 API |
| `tavern-rp` / `tavern-novel` | 内部 Agent 预设，按工作区模式自动绑定，不出现在全局预设名单 |

后两个组件各自占一个插件行，删掉对应行即整体下线：路由消失、工具箱入口报告不可用，酒馆本体不受影响。内部预设也各占一行（`dshtavern/preset-rp` / `dshtavern/preset-novel`），这样插件列表里能分别显示自己的名字与说明。

## 工具箱

酒馆会话里有一个可拖动的悬浮工具箱图标，包含八个可用面板：

| 面板 | 内容 |
|---|---|
| 提示词编排 | 13 个角色块 / 8 个导演块；拖拽排序、启停、编辑、预览、恢复默认 |
| Agent 编排 | 这一幕 / 上下文 / 模型 / 回复长度四个子页：每幕发言上限、上下文预算（四档一键预设，最大按 1M 窗口标定）、玩家点名优先、导演与角色各自的模型、统一/逐角色回复长度、推理预留 |
| 角色卡 | 角色卡 CRUD，导入/导出单文件 `.charc`；新会话会先由模型生成一段完整开场（场景 + 角色开口） |
| 世界书 | 工作区级条目编辑与触发预览，整本导入/导出 `.world` |
| 玩家人设 | 工作区级人设库；角色提示词里的「玩家人设」块可指定具体人设 |
| 用量统计 | 工作区/会话 token、输入输出拆分、上下文占用、缓存命中率 |
| 剧情回顾 | 最新回顾 / 历史记录 / 设置三个子页；见下 |
| 生图 | 场景 / 图库 / 设置三个子页；场景插画与角色立绘，提示词工作台见下 |

**生图**是可选功能：子插件默认加载，但每个酒馆的 `image.json` 默认关闭。开启后，场景插画从最新回合的旁白、公开场景和出场角色生成草稿；角色立绘从角色卡的外观/描述生成。流程固定为「编辑草稿 →（可选）LLM 细化 → 批准提示词 → 手动生成」：细化只调用一次模型，不生图；批准由宿主签发 10 分钟有效的一次性 `approvalId`；只有点「生成图片」才会调用第三方 API。第一版接入 GPT Image（OpenAI 兼容）和即梦 4.0（火山引擎 AK/SK 异步）。密钥保存在 DSH 凭据里，工作区配置不写密钥；行被禁用时工具箱显示灰色「生图（未启用）」。

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
    image.json               # 生图设置（provider / 模板 / 开关；不含密钥）
    state/last-request.json  # 被拦截的 loop 请求（只有工作区提示词）
    stories/<session>/
      opening.json           # 生成的开场脚本（含当时的 prompt 与模型）
      stage.jsonl            # 舞台：追加写的旁白与台词
      world.json             # 导演私有：场景 / 事实 / 未揭示剧情
      beats/<timestamp>.json # 每次 beat 的完整证据（含回退所需的舞台长度与世界快照）
      regenerations.json     # 被重新生成取代的回合 → 替代回合
      images/<id>.png        # 场景图原图（jpg / webp 同目录）
      images/index.jsonl     # 场景图元数据：回合 / 最终提示词 / provider
    tracker/
      config.json            # 回顾设置（触发方式 / 间隔 / 篇幅预算）
      state.<session>.json   # 该聊天上次回顾到第几轮
      summaries/<session>/   # 每次回顾一份，文件名是它覆盖到的轮次
  characters/<id>.charc      # 角色卡
  characters/<id>/portraits/ # 角色立绘 + index.json（activeId）
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
pnpm test       # 434 项，全离线
pnpm typecheck
```

对运行中的 `dsh web` 跑接口自测（只读 52 项 / 写入 68 项，可重复执行）：

```sh
node scripts/selftest-http.mjs  --base http://127.0.0.1:3080
node scripts/selftest-write.mjs --base http://127.0.0.1:3080
```

## 安装

### 一条命令（推荐，无需 npm 账号）

```sh
npx @deepseek-ai/dsh plugin --profile web add github:prophetcrab/DSHTavern
```

仓库里提交了编译好的 `lib/`，所以这条命令不需要 clone、不需要构建、也不需要 npm 账号——pnpm 直接从 GitHub 拉取并安装。国内网络慢时，先给 git 配镜像：

```sh
git config --global url."https://gh-proxy.com/https://github.com/".insteadOf "https://github.com/"
```

配好密钥再启动：

```sh
echo "DEEPSEEK_API_KEY=<你的密钥>" >> ~/.dsh/.env
npx @deepseek-ai/dsh web
```

侧栏出现「酒馆」入口即安装成功。

需要 Node ≥ 24.9 和 pnpm（`corepack enable pnpm` 即可获得）。密钥按「继承的环境变量 > 启动目录的 `.env` > `~/.dsh/.env`」的顺序读取，后者是用户级、不随仓库走，所以推荐写在那里。可选 `DEEPSEEK_BASE_URL` 同法配置。

### 备选：tarball 地址

不想让 pnpm 走 git 时，直接装打包好的文件：

```sh
npx @deepseek-ai/dsh plugin --profile web add \
  https://raw.githubusercontent.com/prophetcrab/DSHTavern/master/dist/dshtavern-0.3.0.tgz
```

同样不需要构建。改动插件后重新生成这两者：

```sh
node scripts/pack.mjs
```

它会构建、跑测试、刷新 `lib/`、写出 `dist/dshtavern-<version>.tgz` 并清掉旧版本。**改了源码要记得跑**——`lib/` 现在是提交进仓库的，忘了更新，别人装到的还是旧代码。

### 安装报 `ERR_PNPM_EPERM`

如果这个 profile 之前用 `link:` 指向过本地源码目录，再改装 git 版本会失败：

```text
ERR_PNPM_EPERM [importPackage ...\node_modules\dshtavern]
EPERM: operation not permitted, symlink 'D:\...\DSHTavern\node_modules\...'
```

原因不在包本身：`dsh plugin remove` 只删清单里的条目，`node_modules/dshtavern` 那个符号链接会留下，pnpm 于是顺着它去解析本地项目的 peer 依赖，试图把源码树里的链接搬进 profile——Windows 和 macOS 都会拒绝。

删掉残留再装一次即可：

```sh
rm ~/.dsh/profiles/web/node_modules/dshtavern     # Windows: rmdir /s /q ...
npx @deepseek-ai/dsh plugin --profile web add github:prophetcrab/DSHTavern
```

`node_modules/.pnpm` 里没有残留时不必清它。

### 从源码开发（宿主 checkout）

```sh
# 1. 下载并编译插件
git clone https://github.com/prophetcrab/DSHTavern.git
cd DSHTavern
pnpm install && pnpm build

# 2. 装进 web 配置（在插件目录里执行）
npx @deepseek-ai/dsh plugin --profile web add .

# 3. 启动
npx @deepseek-ai/dsh web
```

在插件目录之外执行第 2 步时，把 `.` 换成绝对路径，用正斜杠（`D:/project/DSHTavern`）。Git Bash 会把反斜杠当转义符，写成 `D:\project\DSHTavern` 会被解析成不存在的 `D:projectDSHTavern`。

### 发布到 npm（可选，需要 npm 账号）

上面两条路都不依赖 npm 注册表。如果想让用户用 `add dshtavern` 这种最短形式，再走这一步：脚本依次构建、跑测试、发布，并把 `market/index.json` 里的版本号与真实发布时间同步。

```sh
npm login --registry https://registry.npmjs.org/
node scripts/publish.mjs
```

先预演（只构建、测试、打包，不发布）：

```sh
node scripts/publish.mjs --dry-run
```

注意两点：

- **本机 npm 默认指向 `registry.npmmirror.com`**，那是只读镜像，不能发布。脚本里把 `--registry https://registry.npmjs.org/` 写死了，绕开这个默认值；`npm login` 也要显式指定同一个源。
- 包名 `dshtavern` 目前未被占用；一旦发布，版本号不可复用，再发必须升 `version`。

发布后要把 `market/index.json` 的 `source` 从 git 形式换回 `{ "type": "npm" }`，否则索引仍指向 git 提交。

### 插件市场索引（Discover 里点装）

DSH 没有官方市场，Discover 页读的是作者自己托管的 `index.json`。仓库里的 `market/` 就是成品，`.github/workflows/pages.yml` 会在 `market/` 有改动时自动发布到 GitHub Pages：

```text
market/
  index.json          # 列出 dshtavern 及其版本、来源、兼容范围
  icons/tavern.svg    # 相对 index.json 解析
```

**启用（只需一次）**：仓库 Settings → Pages → Source 选 **GitHub Actions**。之后每次推送 `market/` 的改动都会自动重新部署，索引地址是：

```text
https://prophetcrab.github.io/DSHTavern/index.json
```

**用户侧**：DSH 里打开「插件 → 实验性插件 → 自定义插件索引」，把这个地址添加为索引源，之后就能在 Discover 里看到插件并点装。

索引格式有三条硬性要求，缺一条整个文件会被拒绝：`engines.dsh` 必须是合法的 semver range（本插件为 `>=0.2.1-rc.2 <0.3.0`）、`dsh.bundle` 必须存在、`versions[].publishTimestamp` 必须是源发布时间的 Unix 秒。前两条已在 `package.json` 里声明，第三条在 git 来源下取该提交的 committer 时间。格式可用官方校验器自测：

```sh
node -e "
const { parseMarketIndex } = require('<deepseek-harness>/packages/util/plugin-market-index/lib/index.js')
parseMarketIndex(require('./market/index.json'), 'https://prophetcrab.github.io/DSHTavern/index.json')
console.log('valid')
"
```

索引锁定的是一个具体提交，不是分支——所以用户装到的代码不会在你不知情时改变。发新版本时更新 `versions` 里那一项的 `commit` 和 `publishTimestamp`（取新提交的 `git log -1 --format=%ct`）。

### 从源码开发（宿主 checkout）

```sh
# 1. 构建宿主（只需一次）
cd <deepseek-harness checkout>
pnpm install && pnpm build

# 2. 构建插件
cd <本插件目录>
pnpm install && pnpm build

# 3. 装进 web 配置（回到宿主目录）
cd <deepseek-harness checkout>
pnpm dsh plugin --profile web add <本插件目录>

# 4. 启动
pnpm dsh web
```

第 3 步必须在宿主目录执行：`dsh` 由宿主仓库提供（`pnpm dsh`），不在 PATH 上。

`dsh plugin` 自建的 profile 以 `@deepseek-ai/dsh-base` 为底，不含 workspace registry。本插件的 `ctx.tavernWorkspaces` 依赖 web 层，所以自定义 profile 必须用 `--from-default-profile web` 创建；`--profile web` 用的是官方预置模板，没有这个问题。

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
- **生图第一版**：只接入 GPT Image 与即梦 4.0；ComfyUI、Gemini banana、图生图和自动生图尚未实现。
- **聊天头像**：按角色名映射 active 立绘，重名角色第一版不贴头像；头像依赖 DSH 气泡 DOM 结构，上游改结构时会静默不显示。
- **角色卡格式**：只认原生 `.charc`，SillyTavern 的 PNG / V2 JSON 卡需先转换。
- **只能重生成最新一幕**：更早的回合要连同其后所有回合一起回退，而只追加的转写无法表达。
- **缓存命中率偏低**：导演与角色提示词里，会变化的世界状态和舞台记录紧接在静态前缀之后，缓存只能复用到断点。这是当前提示词结构的直接结果。

## 许可证

[MIT](LICENSE)。

`samples/characters/upstream/` 下的示例角色卡来自 [teknium1/character-cards](https://github.com/teknium1/character-cards)，版权归原作者，不适用本项目的许可证；详见该目录的 [README](samples/characters/README.md)。

