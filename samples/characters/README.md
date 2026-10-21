# 角色卡示例（导入用）

## 文件

| 文件 | 来源 | 说明 |
|---|---|---|
| `linjianxia.png` | 本项目原创 | 符合 Character Card V2 规范的示例卡：PNG 图片 + `tEXt` 块（关键字 `chara`）内嵌 V2 JSON。原创角色「林见夏」，SFW，含 1 个内嵌世界书（2 条目）、另 1 条 alternate greeting。 |
| `linjianxia.json` | 同上 | 与 PNG 内嵌内容完全相同的 V2 JSON，便于直接阅读/编辑。 |
| `upstream/teknium1-linda-thompson-v1.json` | [teknium1/character-cards](https://github.com/teknium1/character-cards) | 社区仓库里的真实角色卡（V1 裸字段格式，SFW 编程团队角色），用于对照 V1/V2 差异。内容版权归原作者，仓库 LICENSE 见上游。 |
| `build-sample.mjs` | 本项目 | 生成 `linjianxia.*` 的脚本（纯 Node，无外部依赖）。 |
| `inspect-card.mjs` | 本项目 | 读取 PNG 的 chunk、解出 `chara`/`ccv3` 并解析 JSON 的小工具。 |

## PNG 里的角色卡长什么样

- 图片本身是普通 PNG；角色卡数据放在 PNG 的文本块里：
  - `tEXt`（关键字 `chara`）：SillyTavern V2 卡；
  - 部分 V3 工具写 `ccv3`（`iTXt`/`tEXt`），内容为 `{"spec":"chara_card_v3","data":{...}}`。
- 文本内容是 UTF-8 编码的 JSON；解析顺序通常是 `ccv3` → `chara` → 图片同名 `.json`。
- V2 JSON 顶层是 `{ spec: "chara_card_v2", spec_version: "2.0", data: {...} }`；`data` 里是 `name/description/personality/scenario/first_mes/mes_example/alternate_greetings/character_book/tags/creator/character_version/extensions` 等字段。
- V1 卡（`upstream/` 里那份）没有包装层，`name/description/...` 直接在顶层。

## 备注

- 生成环境的 shell 无法直连外网（`curl` 返回 000），因此 PNG 是我用脚本按规范生成的原创示例，而不是从网上下载的现成卡；`upstream/` 里的 JSON 通过 GitHub API 取回。
- 文件名里的中文/空格不影响解析，但建议导入后按角色名归档，避免 `characters/` 目录里出现同名覆盖。
