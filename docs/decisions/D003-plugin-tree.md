# D003 插件形态：单包 + 插件树

- 状态：已定（方案 B）
- 日期：2026-10-21

## 背景

DSHTavern 同时涉及宿主侧存储、会话侧提示词、浏览器侧界面。问题是：应该做成一个大插件，还是做成"插件树"（多个插件行）？

## 关键事实（来自 DSH 源码调研）

| 事实 | 对方案的影响 |
|---|---|
| DSH 里一切皆插件；agent preset 的 `config.plugins` 本身就是一棵插件树，且 Web 端只有 preset 能决定单个 agent 的提示词与工具 | 宿主能力留在 host plane；会话侧能力**必须**做成 preset 子插件，不能用宿主插件代替 |
| 三层生命周期不同：宿主进程级 / 浏览器页面级 / 每个 agent 一份 | 至少拆成 3 个插件行，这是语义要求，不是偏好 |
| 一个包可以提供多个入口：preset 行可以引用子路径（仓库里已有 `@deepseek-ai/dsh-plugin-manager/tools`、`@deepseek-ai/dsh-subagent-control/list-agents` 先例） | 一个 npm 包就能同时提供根入口、`/session` 入口 |
| bundle 包本身也可以被挂成插件行（`@deepseek-ai/dsh-web-app` 同时是 bundle 和 `web-runtime` 行） | 发行可以是一个包：bundle patch + 插件代码 |
| 跨插件的运行时值 import 被禁止（协作走 Cordis 服务） | 共享逻辑放包内共享模块或独立 util 包，不能在一个插件里直接 import 另一个插件的实现 |

## 候选方案

| 方案 | 描述 | 问题 |
|---|---|---|
| A 单体单插件 | 一个插件行包办宿主、会话、界面 | 会话侧插件必须能单独挂进 preset；浏览器半必须挂在宿主行上。**不可行** |
| B 单包 + 三个面的插件树 | 一个 npm 包，根入口=宿主+浏览器半，子路径入口=preset 子插件 | 需验证同包同时声明 `dsh.client` 与 bundle patch |
| C 多包 monorepo | host / session / ui / bundle 各自成包 | v1 过度拆分，构建与发布成本高 |
| D 仅 preset 内部拆行 | 宿主+界面一个包，preset 内多行 | 与 B 的差别只在打包；B 更完整 |

## 倾向方案：B

```text
@dshtavern/tavern            (一个包：bundle patch + 根插件 + 浏览器半)
├─ 根入口（host row）        工作区标记、角色卡/世界书/提示词模板存储、Remote
├─ 浏览器半（dsh.client）    酒馆主面板、侧栏入口、模式切换、提示词管理器
└─ preset "tavern"           会话侧插件树（每个 agent 一份）
   ├─ /session              提示词装配：complete section、运行时上下文策略  ← v1
   ├─ /session-commands     酒馆命令：/continue、/impersonate 等            ← v1.1
   └─ /session-context      上下文裁剪 / 摘要                                ← v1.1
```

## 理由

1. **语义正确**：三层生命周期不同，合并成一个插件行在 DSH 的 scope 模型里不成立。
2. **可组合**：preset 内每一行都能在 Web 的 preset 编辑器里单独启停/替换；用户想换提示词实现时，不必禁用整个酒馆插件。
3. **发行简单**：一个 npm 包 + 一个 bundle patch，`dsh plugin add` 一步安装。
4. **避免过早拆包**：v1 只保留 3 个插件行（host、client、preset-prompt）；只有当某一块需要独立版本或被别的插件复用时，再拆成 monorepo 包。

## 注意 / 待验证

1. 同一个包同时声明 bundle patch 与 `dsh.client` 是否被当前加载器接受（仓库里 bundle 包挂 host row 有先例，但同包 `dsh.client` 没有先例）。若不行，把浏览器半拆为第二个包 `@dshtavern/ui`。
2. 同一包的多个子路径行是否各自实例化模块；共享状态必须通过 Cordis 服务传递，不能依赖模块级变量。
3. 若某个会话侧插件需要独立服务（如自定义 compaction），在 preset 里用 `cordis:group` + `isolate` 隔离。
4. v1 控制行数，避免配置面膨胀。

## 影响

- 后续「打包与发行」设计文档（待写）
- 设计文档 `01-交互界面.md` 的插件落点（不改界面内容）
