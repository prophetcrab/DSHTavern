# DSHTavern 文档

架构与开发进度见 [architecture.md](architecture.md)；它是唯一事实来源，随每次改动更新。

## 两类文档

| 类型 | 目录 | 回答的问题 | 写法 |
|---|---|---|---|
| 决策文档 | `decisions/` | 我们是怎么想的、为什么这样选 | 记录背景、候选方案、取舍、结论。**只增不改**；推翻旧决策时新开一篇并标注 supersedes。讨论中的决策也可以先记录，状态标为「讨论中」。 |
| 设计文档 | `design/` | 准备采用什么方案 | 面向实现，**简约易读**：目标、结构、流程、模块、待定。只写已确定或推荐采用的内容；未定的放「待定」。 |

## 编号与命名

- 决策：`D001-<slug>.md`，按讨论顺序递增。
- 设计：`01-<slug>.md`，按主题递增。
- 每篇文档顶部给出：编号、状态、日期。

## 状态取值

- 讨论中：还在比较方案，未定。
- 已定：结论生效，可作为设计依据。
- 已废弃：被更新的决策取代（写明 superseded by）。

## 索引

### 决策

| 编号 | 标题 | 状态 |
|---|---|---|
| D001 | [酒馆的承载形态：工作区 + 专用界面](decisions/D001-tavern-workspace.md) | 已定 |
| D002 | [提示词自主权：独立 agent preset](decisions/D002-prompt-sovereignty.md) | 讨论中 |
| D003 | [插件形态：单包 + 插件树](decisions/D003-plugin-tree.md) | 已定 |
| D004 | [工作区标记](decisions/D004-workspace-marker.md) | 已定 |
| D005 | [提示词装配：工作区级固定装配](decisions/D005-workspace-prompt-assembly.md) | 已定 |

### 设计

| 编号 | 标题 | 状态 |
|---|---|---|
| 01 | [交互界面](design/01-interface.md) | 草案 v0.5 |
| 02 | [工作区标记](design/02-workspace.md) | 已定 |
| 03 | [上下文与角色卡](design/03-context.md) | 草案 v0.1（待讨论） |
| 04 | [酒馆外壳：调整面板与工具箱](design/04-shell.md) | 草案 v0.2（工具箱首版已落地） |
| 05 | [提示词编排](design/05-prompt-orchestration.md) | 草案 v0.3（A 路线装配已实现） |

## 阅读顺序

先看决策文档理解取舍，再看设计文档了解实现方案。设计文档不重复决策理由，只在开头引用对应决策编号。
