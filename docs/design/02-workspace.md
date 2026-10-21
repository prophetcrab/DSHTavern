# 02 工作区标记（设计）

> 状态：已定（宿主模块已实现，面板已接入）
> 依据：D004
> 范围：标记文件、检测规则、生命周期、宿主 API。不含提示词。

## 一句话

酒馆身份由工作区目录里的 `.dshtavern/tavern.json` 决定；插件按需扫描，不修改 DSH 的 workspace 记录。

## 标记文件

- 路径：`<目录>/.dshtavern/tavern.json`
- 结构：

```json
{ "schema": 1, "kind": "dshtavern", "tavernId": "<uuid>", "createdAt": "<ISO>", "title": "可选", "mode": "rp" }
```

- `mode`：`rp`（角色扮演）或 `novel`（小说），**创建前二选一，创建后不可更改**；旧标记没有该字段时按 `rp` 处理。两种模式拥有各自独立的提示词块目录（小说块尚未实现）。
- 校验：`kind` / `schema` / `tavernId` 必填；`mode` 若存在必须是 `rp` 或 `novel`；未知字段忽略；损坏视为未标记。
- 版本：`schema` 高于当前支持值时只读提示，不覆盖。

## 检测规则

| 判断对象 | 依据 |
|---|---|
| 酒馆会话 | `session.header.cwd` 目录下有标记 |
| 酒馆工作区 | `workspace.path` 目录下有标记 |

- 只看目录本身，不向上查找；不靠标题/命名判定。
- DSH 没有工作区事件，按需扫描：启动、创建/收编动作、`session/created`、客户端刷新。

## 生命周期

| 场景 | 行为 |
|---|---|
| 新建酒馆 | 建目录 → 写标记 → 注册工作区 |
| 收编已有工作区 | 在目标目录写标记（需确认） |
| 取消标记 | 删除标记文件，保留数据；已有会话保持 preset |
| 删除工作区 | 只注销注册；重新添加同目录时标记自动恢复 |
| 移动/换机 | 重新注册新路径后靠标记识别，不依赖 WorkspaceId |
| 目录缺失 | 视为标记未知，界面显示目录缺失 |
| 标记损坏 | 视为未标记，提供修复入口 |

## 宿主 API（`ctx.tavernWorkspaces`）

| 方法 | 作用 |
|---|---|
| `list()` | 扫描全部工作区，返回酒馆工作区列表 |
| `overview()` | 返回面板读模型：默认根目录、酒馆工作区、全部工作区及酒馆标记 |
| `create(input)` | 建目录 → 写标记 → 注册工作区，返回酒馆工作区 |
| `isTavernDirectory(path)` | 目录是否有标记 |
| `isTavernSessionCwd(cwd)` | 会话 cwd 是否为酒馆目录 |
| `adopt(workspaceId)` | 给已有工作区写标记 |
| `untag(workspaceId)` | 移除工作区标记 |

标记的写入由导出函数 `ensureMarker(path, title?, { force? })` 提供，新增酒馆流程复用它。

无事件、无持久化缓存；客户端通过宿主 `/tavern/*` JSON 路由读取（浏览器半已接入）。

## 实现状态

- `src/index.ts`：标记读写、`TavernMarkerRegistry`、`ctx.tavernWorkspaces` 服务。
- 创建闭环：`createTavernWorkspace()`（建目录 → 写标记 → 注册工作区）、`overviewTaverns()`；宿主服务新增 `overview()` / `create()`，并注册 `/tavern/state|create|adopt|untag` 路由。
- `src/http.ts`：loopback-only JSON 路由 helper。
- `src/client/index.ts`：酒馆面板（列表 / 新建 / 收编 / 取消标记），自动刷新与响应式字号。
- 单元测试 38 项通过；`pnpm build` 通过；已在运行中的 web profile 实测新建酒馆工作区。

## 写安全

- 宿主侧原子写（临时文件 + rename），UTF-8 JSON。
- 只写 `.dshtavern/`，不碰用户其他文件。
- 只在「新建酒馆 / 收编」两个显式动作里写。

## 待办

- 会话 preset 兜底（等 D002 定稿）
- 目录权限异常的用户提示
- 「进入酒馆工作区自动切换面板」
