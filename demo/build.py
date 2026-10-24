#!/usr/bin/env python3
"""Build the screenshot gallery page, with every capture inlined as base64."""
import base64
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent
ASSETS = ROOT / "assets"

SHOTS = [
    ("01-conversation", "对话推演", "一幕之内多人接话：缇亚、格里芬、塞拉菲娜依次登场。旁白为引用块，台词带角色名。"),
    ("02-toolbox", "工具箱", "七个工具：提示词编排、Agent 编排、角色卡、世界书、用量统计、剧情回顾、玩家人设。"),
    ("03-characters", "角色卡", "三张卡各自持有描述、性格、场景、自带提示词和示例对话，另有卡内私有世界书条目。"),
    ("04-worldbook", "世界书", "按可见性分组。这条「圣骸」设为指定角色可见，只勾选了塞拉菲娜。"),
    ("05-persona", "玩家人设", "玩家自己的身份：外观、性格、背景、说话方式，外加独立的角色设定栏（能力与持有物）。"),
    ("06-prompt", "提示词编排", "角色提示词与导演台分开编排，可拖拽排序、可停用，每块显示是否运行时填入。"),
    ("07-preview", "装配预览", "用宿主真实装配函数生成，选一张卡、输入测试台词，直接看到命中的世界书与最终 system。"),
    ("08-usage", "用量统计", "15 轮共 501.2K token，缓存命中 12.1%，上下文占用 3.33%。"),
    ("09-tracker", "剧情回顾", "自动生成 11352 字的剧情摘要，分世界、你、角色三段，逐角色记录已知与未知。"),
    ("10-trajectory", "轨迹视图", "每轮拆成导演、用户、角色多次独立调用——这是「隔离调用」最直接的证据。"),
]

images = {}
for name, _, _ in SHOTS:
    path = ASSETS / f"{name}.jpg"
    images[name] = base64.b64encode(path.read_bytes()).decode("ascii")

# card data for the JS carousel
cards = [{"id": name, "title": title, "desc": desc} for name, title, desc in SHOTS]

html = """<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>DSH-Tavern 产品演示</title>
<style>
  :root {
    --bg: #0d0d0f;
    --panel: #17171a;
    --panel-2: #1f1f23;
    --line: #ffffff1a;
    --ink: #f2f3f5;
    --ink-2: #a8adb8;
    --accent: #7aaaff;
    --warn: #f59e0b;
    --ok: #22c55e;
    --radius: 14px;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: var(--bg);
    color: var(--ink);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
    line-height: 1.7;
    -webkit-font-smoothing: antialiased;
  }
  .wrap { max-width: 1120px; margin: 0 auto; padding: 56px 28px 96px; }

  header.hero { padding: 24px 0 40px; border-bottom: 1px solid var(--line); }
  .eyebrow {
    font-size: 12px; letter-spacing: .18em; text-transform: uppercase;
    color: var(--accent); margin-bottom: 14px; font-weight: 500;
  }
  h1 { font-size: 38px; font-weight: 500; margin: 0 0 14px; letter-spacing: -.02em; line-height: 1.25; }
  .lede { font-size: 16px; color: var(--ink-2); max-width: 62ch; margin: 0; }
  .meta { margin-top: 22px; display: flex; flex-wrap: wrap; gap: 10px; }
  .chip {
    font-size: 12px; padding: 4px 11px; border-radius: 999px;
    border: 1px solid var(--line); color: var(--ink-2); background: var(--panel);
  }

  section { margin-top: 64px; }
  h2 { font-size: 22px; font-weight: 500; margin: 0 0 8px; letter-spacing: -.01em; }
  .sub { color: var(--ink-2); font-size: 14px; margin: 0 0 26px; }

  /* pipeline animation */
  .pipe { display: flex; flex-direction: column; gap: 14px; }
  .beat {
    border: 1px solid var(--line); border-radius: var(--radius); background: var(--panel);
    padding: 18px 20px; display: flex; align-items: center; gap: 16px; flex-wrap: wrap;
  }
  .beat-label { font-size: 12px; color: var(--ink-2); min-width: 72px; }
  .steps { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; flex: 1; }
  .step {
    display: inline-flex; align-items: center; gap: 8px;
    padding: 7px 13px; border-radius: 9px; font-size: 13px;
    border: 1px solid var(--line); background: var(--panel-2);
    opacity: .35; transform: translateY(3px);
    transition: opacity .45s ease, transform .45s ease, border-color .45s ease, background .45s ease;
  }
  .step.on { opacity: 1; transform: none; }
  .step.director.on { border-color: #7aaaff66; background: #7aaaff1f; color: var(--accent); }
  .step.actor.on { border-color: #22c55e4d; background: #22c55e14; color: #6ee7a0; }
  .step .dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; flex: none; }
  .arrow { color: var(--ink-2); font-size: 12px; opacity: .5; }

  /* carousel */
  .stage {
    border: 1px solid var(--line); border-radius: var(--radius);
    background: var(--panel); overflow: hidden;
  }
  .stage-head {
    display: flex; align-items: center; justify-content: space-between; gap: 16px;
    padding: 14px 18px; border-bottom: 1px solid var(--line); flex-wrap: wrap;
  }
  .stage-title { font-size: 14px; font-weight: 500; }
  .stage-desc { font-size: 13px; color: var(--ink-2); padding: 12px 18px 0; }
  .stage-img { display: block; width: 100%; height: auto; margin-top: 12px; }
  .pill { font-size: 12px; padding: 3px 10px; border-radius: 999px; border: 1px solid var(--line); color: var(--ink-2); }
  .nav { display: flex; gap: 6px; flex-wrap: wrap; padding: 14px 18px; border-top: 1px solid var(--line); }
  .nav button {
    font: inherit; font-size: 12px; padding: 6px 11px; cursor: pointer;
    border-radius: 8px; border: 1px solid var(--line); background: transparent; color: var(--ink-2);
    transition: color .15s, border-color .15s, background .15s;
  }
  .nav button:hover { color: var(--ink); border-color: #ffffff33; }
  .nav button[aria-pressed="true"] { color: var(--accent); border-color: #7aaaff66; background: #7aaaff14; }

  /* feature grid */
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 14px; }
  .card {
    border: 1px solid var(--line); border-radius: var(--radius); background: var(--panel);
    padding: 18px 20px;
  }
  .card h3 { font-size: 14px; font-weight: 500; margin: 0 0 6px; display: flex; align-items: center; gap: 8px; }
  .card p { font-size: 13px; color: var(--ink-2); margin: 0; line-height: 1.65; }
  .glyph {
    display: inline-grid; place-items: center; width: 22px; height: 22px; flex: none;
    border-radius: 6px; background: #7aaaff1f; color: var(--accent);
    font-size: 12px; font-weight: 500;
  }

  /* table */
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { text-align: left; padding: 9px 12px; border-bottom: 1px solid var(--line); }
  th { color: var(--ink-2); font-weight: 500; }
  td.num { text-align: right; font-variant-numeric: tabular-nums; }

  .note {
    border-left: 2px solid #f59e0b66; background: #f59e0b0f;
    padding: 12px 16px; border-radius: 0 8px 8px 0; font-size: 13px; color: var(--ink-2);
    margin-top: 18px;
  }
  .note strong { color: var(--warn); font-weight: 500; }

  footer { margin-top: 72px; padding-top: 24px; border-top: 1px solid var(--line); font-size: 12px; color: var(--ink-2); }

  @media (prefers-reduced-motion: reduce) {
    .step { transition: none; }
  }
  @media (max-width: 640px) {
    .wrap { padding: 32px 16px 64px; }
    h1 { font-size: 27px; }
    .beat { padding: 14px; }
  }
</style>
</head>
<body>
<div class="wrap">

  <header class="hero">
    <div class="eyebrow">DeepSeek Harness · Plugin Demo</div>
    <h1>DSH-Tavern</h1>
    <p class="lede">
      一个用「导演 + 独立角色」实现的多角色扮演插件。导演负责旁白和调度，每个角色用自己那张卡单独生成台词，
      人格在结构上无法互相污染。下面是一次 15 轮真实推演的完整记录。
    </p>
    <div class="meta">
      <span class="chip">3 个角色 Agent</span>
      <span class="chip">20 条世界书</span>
      <span class="chip">15 轮推演</span>
      <span class="chip">501.2K token</span>
      <span class="chip">410 项测试</span>
    </div>
  </header>

  <section>
    <h2>一轮是怎么跑起来的</h2>
    <p class="sub">一次玩家输入，拆成多次独立模型调用。演示按真实顺序播放。</p>
    <div class="pipe">
      <div class="beat">
        <span class="beat-label">第 1 拍</span>
        <div class="steps" data-beat="1">
          <span class="step director"><span class="dot"></span>导演·旁白</span>
          <span class="arrow">→</span>
          <span class="step director"><span class="dot"></span>导演·选人</span>
          <span class="arrow">→</span>
          <span class="step actor"><span class="dot"></span>缇亚·台词</span>
        </div>
      </div>
      <div class="beat">
        <span class="beat-label">第 2 拍</span>
        <div class="steps" data-beat="2">
          <span class="step director"><span class="dot"></span>导演·旁白</span>
          <span class="arrow">→</span>
          <span class="step director"><span class="dot"></span>导演·选人</span>
          <span class="arrow">→</span>
          <span class="step actor"><span class="dot"></span>格里芬·台词</span>
        </div>
      </div>
      <div class="beat">
        <span class="beat-label">收尾</span>
        <div class="steps" data-beat="3">
          <span class="step director"><span class="dot"></span>导演·旁白</span>
          <span class="arrow">→</span>
          <span class="step director"><span class="dot"></span>导演判定无人接话</span>
        </div>
      </div>
    </div>
    <div class="note">
      <strong>为什么拆开：</strong>角色 A 的请求里只有 A 自己的卡和舞台记录，看不到 B 的设定，也看不到导演的私有剧情。
      所以语气不会串，秘密不会漏。
    </div>
  </section>

  <section>
    <h2>界面与功能</h2>
    <p class="sub">全部截图来自这次真实推演，没有摆拍。</p>
    <div class="stage">
      <div class="stage-head">
        <span class="stage-title" id="shotTitle"></span>
        <span class="pill" id="shotIndex"></span>
      </div>
      <div class="stage-desc" id="shotDesc"></div>
      <img class="stage-img" id="shotImg" alt="">
      <div class="nav" id="shotNav" role="group" aria-label="截图切换"></div>
    </div>
  </section>

  <section>
    <h2>七个工具</h2>
    <p class="sub">工具箱从一个悬浮按钮展开，只在酒馆会话里出现。</p>
    <div class="grid">
      <div class="card"><h3><span class="glyph">卡</span>角色卡</h3><p>描述、性格、场景、自带提示词、示例对话、开场白，外加卡内私有的世界书条目。</p></div>
      <div class="card"><h3><span class="glyph">书</span>世界书</h3><p>关键词 + 次要词四则逻辑 + 扫描深度 + 大小写 / 整词。按可见性分为公开、仅导演、指定角色。</p></div>
      <div class="card"><h3><span class="glyph">我</span>玩家人设</h3><p>玩家自己的身份，工作区级共享。含独立的角色设定栏，记录能力、持有物与立场。</p></div>
      <div class="card"><h3><span class="glyph">编</span>提示词编排</h3><p>角色提示词与导演台分开编排，拖拽排序、逐块启停，运行时块标注「运行时」。</p></div>
      <div class="card"><h3><span class="glyph">演</span>Agent 编排</h3><p>一幕最多几人说话、舞台窗口、世界书预算、是否轮换发言人，都可调。</p></div>
      <div class="card"><h3><span class="glyph">追</span>剧情回顾</h3><p>分段生成 1 万字级摘要，逐角色记录「已知道什么、还蒙在鼓里什么」。</p></div>
      <div class="card"><h3><span class="glyph">量</span>用量统计</h3><p>按会话统计 token、缓存命中率、上下文占用，数据来自会话投影，可重放。</p></div>
    </div>
  </section>

  <section>
    <h2>这次范例的规模</h2>
    <p class="sub">「灰烬航路」——日式轻小说风格的浮空岛冒险。</p>
    <table>
      <thead><tr><th>项目</th><th class="num">数量</th><th>说明</th></tr></thead>
      <tbody>
        <tr><td>角色卡</td><td class="num">3 张</td><td>6121 字，每人 4 组示例对话</td></tr>
        <tr><td>世界书条目</td><td class="num">20 条</td><td>5706 字；公开 13、仅导演 5、指定角色 2</td></tr>
        <tr><td>推演轮数</td><td class="num">15 轮</td><td>88 条舞台记录</td></tr>
        <tr><td>台词分布</td><td class="num">—</td><td>缇亚 10 · 格里芬 19 · 塞拉菲娜 12</td></tr>
        <tr><td>token 消耗</td><td class="num">501.2K</td><td>缓存命中 12.1%</td></tr>
      </tbody>
    </table>
  </section>

  <footer>
    截图与数据来自本机一次真实推演会话 · DSH-Tavern · MIT
  </footer>
</div>

<script>
const SHOTS = __SHOTS__;
const IMAGES = __IMAGES__;
let current = 0;

const img = document.getElementById('shotImg');
const title = document.getElementById('shotTitle');
const desc = document.getElementById('shotDesc');
const index = document.getElementById('shotIndex');
const nav = document.getElementById('shotNav');

SHOTS.forEach((s, i) => {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = s.title;
  b.setAttribute('aria-pressed', String(i === 0));
  b.addEventListener('click', () => select(i));
  nav.appendChild(b);
});

function select(i) {
  current = i;
  const s = SHOTS[i];
  img.src = 'data:image/jpeg;base64,' + IMAGES[s.id];
  img.alt = s.title + ' 截图';
  title.textContent = s.title;
  desc.textContent = s.desc;
  index.textContent = (i + 1) + ' / ' + SHOTS.length;
  [...nav.children].forEach((b, n) => b.setAttribute('aria-pressed', String(n === i)));
}

// Pipeline animation: reveal steps in reading order, then hold and restart.
const steps = [...document.querySelectorAll('.step')];
const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function playPipeline() {
  steps.forEach(s => s.classList.remove('on'));
  if (reduce) { steps.forEach(s => s.classList.add('on')); return; }
  steps.forEach((s, i) => {
    setTimeout(() => s.classList.add('on'), 260 * i);
  });
}

select(0);
playPipeline();
setInterval(playPipeline, 260 * steps.length + 2600);
</script>
</body>
</html>
"""

html = html.replace("__SHOTS__", json.dumps(cards, ensure_ascii=False))
html = html.replace("__IMAGES__", json.dumps(images))

out = ROOT / "index.screenshots.html"
out.write_text(html, encoding="utf-8")
print(f"wrote {out} — {out.stat().st_size / 1024:.0f} KB")
