# DSHTavern

用 DeepSeek Harness 的插件机制实现一个 SillyTavern 式的酒馆。

- 架构与开发进度（唯一事实来源，随改动更新）：[docs/architecture.md](docs/architecture.md)
- 决策文档（为什么这样设计）：[docs/decisions/](docs/decisions/)
- 设计文档（准备采用的方案）：[docs/design/](docs/design/)

## 当前进度

| 模块 | 状态 |
|---|---|
| 工作区标记（`.dshtavern/tavern.json` + 宿主服务） | 已完成（单测 + web profile 启动验证） |
| 酒馆面板 / 浏览器半 | v0.6：酒馆列表、新建/收编/取消标记；**创建前必须选择模式（角色扮演 / 小说，创建后不可更改）**；整页单卡片、自动刷新、二次确认、宽屏双栏、2K 响应式字号、轻量交互动效（宿主 `/tavern/*` 路由已联调） |
| 提示词编排 | v0.7：会话内可拖动的悬浮工具箱图标 → 只含工具图标的浮层 → 子弹窗；块卡片拖拽排序、启停、恢复默认；可编辑块（主模板/用户人设/作者笔记/历史后指令）点击卡片弹出**独立编辑弹窗**（保存/取消/恢复默认文本）；覆盖内容存 `prompts/prompt.json`；未导入角色卡时隐藏角色卡来源块（v1 编排仅用于角色扮演模式，小说模式块待实现） |
| `tavern` agent preset / 提示词装配 | v0.3 A 路线 + B-lite 清洗：内部 preset `tavern-rp` / `tavern-novel`（旧 `tavern` 保留兼容），全部从手动名单隐藏；宿主在 `agent/created` 直接注册 complete system prompt（同步读工作区 `prompts/prompt.json`，仅角色扮演模式），`suppressRuntimeContext()`；再在 `llm/stream` 把最终请求清洗为「编排 system + cwd 一行 + 历史 + 本轮输入」，删除 required 的 team identity、system-reminder 与全部工具 schema，并把最终请求写入 `.dshtavern/state/last-request.json`；按工作区 mode 自动绑定；修改 preset 树需要重启 DSH 才生效 |

测试：`pnpm test`（88 项通过）；构建：`pnpm build`（宿主 `tsc` + 浏览器半 `tsdown`）。

## 使用

安装并加载后，侧栏出现「酒馆」入口。打开面板即可：

1. **新建酒馆**：填名称（可再指定绝对目录）→ 创建目录、原子写入 `.dshtavern/tavern.json`、注册为 DSH 工作区；
2. 列表里显示所有酒馆工作区，可**取消标记**（二次确认；保留目录与会话）；
3. 「收编已有工作区」把已有目录标记为酒馆。

面板会自动刷新（挂载时、每几秒、窗口重新获得焦点时、每次操作后）；字号随视口宽度放大：1280 / 1600 / 1920 / 2300 / 2560px 各有一档，2K 屏比 1080p 明显更大。

宿主提供 `GET /tavern/state`、`POST /tavern/create|adopt|untag` 四个 loopback-only JSON 路由，浏览器半直接调用。

## 开发

```sh
pnpm install
pnpm build
pnpm test
```

## 安装到 DSH profile（本地链接）

先用 web 模板建一个自定义 profile，再安装本包：

```sh
cd <deepseek-harness checkout>
pnpm dsh --profile tavern --from-default-profile web --dump-config
pnpm dsh plugin --profile tavern add D:\GameProject\DSHTavern
pnpm dsh --profile tavern --dump-config
```

注意：`dsh plugin` 自己创建的 profile 以 `@deepseek-ai/dsh-base` 为底，不含 workspace registry；本插件的 `ctx.tavernWorkspaces` 需要 web 层，所以必须从 web 模板创建 profile。

如果目标就是当前运行的 `web` profile（本机开发常用），直接安装即可：

```sh
cd <deepseek-harness checkout>
pnpm dsh plugin --profile web add D:\GameProject\DSHTavern
```

或者让 agent 用 `plugin_manager` 的 `install_bundle` 安装同一个绝对路径。

### 改了源码之后

1. `pnpm build` 重新生成 `lib/`（宿主 `tsc` + 浏览器半 `tsdown`）；
2. 浏览器半由 client-hmr 按 `lib/client.js` 的改动自动热替换；
3. 宿主半在 profile HMR 的下一次 reconcile 时替换（例如用 `plugin_manager set_plugin` 把本插件禁用再启用，或重启 DSH）。

## 安装到桌面版（Electron）

桌面版的 `desktop` profile 由应用独占管理，CLI 会拒绝：

```text
error: profile "desktop" is managed exclusively by the Electron application
```

在 GUI 里安装：

1. 侧栏打开「插件 / Plugins」；
2. 点 **Add plugin / 添加插件**；
3. 输入本地绝对路径 `D:\GameProject\DSHTavern`，确认信任后安装；
4. 桌面版启用了 HMR，通常无需重启即可生效；若提示需要重启，重启应用。

安装后侧栏出现「酒馆」入口。桌面版与本地开发的 DSH 都是 0.2.1-rc.2，`engines.dsh` 与 peer 版本匹配。
