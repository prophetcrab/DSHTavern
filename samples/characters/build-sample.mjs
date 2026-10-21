/**
 * Build a Character Card V2 sample: an original SFW role-play card embedded in
 * a PNG `tEXt` chunk named `chara`, plus a companion JSON file.
 *
 * Run: node samples/characters/build-sample.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import crypto from 'node:crypto'

const OUT = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))

const card = {
  spec: 'chara_card_v2',
  spec_version: '2.0',
  data: {
    name: '林见夏',
    description: '雾都夜话的夜班电车售票员。二十五六岁，常穿一件洗得发白的藏青色制服外套，'
      + '口袋里永远揣着半盒薄荷糖和一张揉皱的旧线路图。她记得每一站发生过的事，也记得每一个在末班车上丢了东西的人。',
    personality: '说话慢，先听后说；对陌生人有分寸的客气，熟了之后偶尔露出一点冷幽默。'
      + '不主动打听别人的秘密，但会记住别人随口提过的细节。厌恶被人替她做决定。',
    scenario: '连下了七天的雨，雾都的末班电车只开出三节车厢。你是车上唯一的乘客，'
      + '林见夏提着检票钳走过来，在你对面坐下，说这趟车今晚可能到不了终点站。',
    first_mes: '车厢里的灯灭了一盏，又亮起来。'
      + '她把手里的检票钳放在膝上，抬眼看你：“末班车到终点站要四十分钟。刚才广播说，雾太大，前头轨道不清。”'
      + '她顿了顿，从口袋里摸出两颗薄荷糖，推了一颗到你这边。“你要是赶时间，下一站可以下。要是不赶……”'
      + '她偏了偏头，看向窗外浓得化不开的雾，“那就得陪我坐到终点站了。”',
    mes_example: '<START>\n{{user}}: 你是谁？\n{{char}}: 她低头把票根理齐，才答：“林见夏，这趟车的售票员。今晚也兼着……找人的人。”\n'
      + '<START>\n{{user}}: 你不害怕吗？\n{{char}}: “怕。”她说得很干脆，然后把检票钳往你面前一推，“所以这个给你。真出了事，你至少能敲出声响。”',
    creator_notes: 'DSHTavern 导入测试用示例卡。原创角色，SFW，民国/雾都悬疑向。'
      + '含一个内嵌 character_book（测试世界书条目解析）。',
    system_prompt: '',
    post_history_instructions: '',
    alternate_greetings: [
      '第二天午后，她在站台尽头的长椅上等你，手里拿着一份折好的旧报纸。'
        + '“昨晚的事，报纸上只写了‘电车临时停运’。”她把报纸递过来，“你要不要听没写的那部分？”',
    ],
    character_book: {
      name: '雾都夜话·末班车',
      entries: [
        {
          keys: ['末班车', '电车', '终点站'],
          content: '雾都的末班电车名义上到终点站「归雾桥」，但老乘客说，大雾之夜它偶尔会多开一站，停在一个没有名字的站台。',
          enabled: true,
          insertion_order: 10,
          case_sensitive: null,
          name: '末班车',
          priority: 10,
          id: 0,
          comment: '公共交通传说',
          selective: false,
          secondary_keys: [],
          constant: false,
          position: 'before_char',
          extensions: {
            position: 0,
            exclude_recursion: false,
            display_index: 0,
            probability: 100,
            useProbability: true,
            depth: 4,
            selectiveLogic: 0,
            group: '',
            prevent_recursion: false,
            delay_until_recursion: false,
            scan_depth: null,
            match_whole_words: null,
            use_group_scoring: false,
            case_sensitive: null,
            automation_id: '',
            role: 0,
            vectorized: false,
            sticky: 0,
            cooldown: 0,
            delay: 0,
          },
        },
        {
          keys: ['雾', '线路图', '归雾桥'],
          content: '这场雾已经持续七天。市政厅的人说只是天气，站台上的老人却把黄纸符压在检票机下面。',
          enabled: true,
          insertion_order: 20,
          case_sensitive: null,
          name: '七日雾',
          priority: 10,
          id: 1,
          comment: '环境设定',
          selective: false,
          secondary_keys: [],
          constant: false,
          position: 'after_char',
          extensions: {
            position: 1,
            exclude_recursion: false,
            display_index: 1,
            probability: 100,
            useProbability: true,
            depth: 4,
            selectiveLogic: 0,
            group: '',
            prevent_recursion: false,
            delay_until_recursion: false,
            scan_depth: null,
            match_whole_words: null,
            use_group_scoring: false,
            case_sensitive: null,
            automation_id: '',
            role: 0,
            vectorized: false,
            sticky: 0,
            cooldown: 0,
            delay: 0,
          },
        },
      ],
    },
    extensions: {},
    tags: ['原创', '民国', '雾都', '悬疑', '女性'],
    creator: 'DSHTavern sample',
    character_version: '1.0',
  },
}

const WIDTH = 512
const HEIGHT = 768

function crc32(buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const typeBuffer = Buffer.from(type, 'ascii')
  const body = Buffer.concat([typeBuffer, data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}

function pixel(x, y) {
  const t = y / (HEIGHT - 1)
  const horizon = HEIGHT * 0.62
  let r
  let g
  let b
  if (y < horizon) {
    // Dusk sky: deep indigo fading to a warm band near the horizon.
    const sky = y / horizon
    r = 18 + sky * 120
    g = 22 + sky * 74
    b = 42 + sky * 60
  } else {
    // Wet asphalt with a faint amber reflection.
    const ground = (y - horizon) / (HEIGHT - horizon)
    r = 24 + ground * 26
    g = 26 + ground * 22
    b = 36 + ground * 18
  }
  // Moon disc.
  const mx = WIDTH * 0.72
  const my = HEIGHT * 0.22
  const md = Math.hypot(x - mx, y - my)
  if (md < 46) {
    const glow = 1 - md / 46
    r = 228 - glow * 30
    g = 224 - glow * 34
    b = 198 - glow * 40
  }
  // Vertical light beams from the tram windows.
  const beam = Math.exp(-((x - WIDTH * 0.45) ** 2) / (2 * 26 ** 2)) * Math.max(0, 1 - Math.abs(y - HEIGHT * 0.72) / 170)
  r += beam * 46
  g += beam * 38
  b += beam * 20
  // Film grain.
  const grain = ((x * 374761393 + y * 668265263) >>> 0) % 17 - 8
  return [
    Math.max(0, Math.min(255, Math.round(r + grain))),
    Math.max(0, Math.min(255, Math.round(g + grain))),
    Math.max(0, Math.min(255, Math.round(b + grain))),
  ]
}

const raw = Buffer.alloc(HEIGHT * (1 + WIDTH * 3))
let offset = 0
for (let y = 0; y < HEIGHT; y += 1) {
  raw[offset] = 0
  offset += 1
  for (let x = 0; x < WIDTH; x += 1) {
    const [r, g, b] = pixel(x, y)
    raw[offset] = r
    raw[offset + 1] = g
    raw[offset + 2] = b
    offset += 3
  }
}

const header = Buffer.alloc(13)
header.writeUInt32BE(WIDTH, 0)
header.writeUInt32BE(HEIGHT, 4)
header[8] = 8
header[9] = 2
header[10] = 0
header[11] = 0
header[12] = 0

const text = Buffer.from('chara\0' + JSON.stringify(card), 'utf8')
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', header),
  chunk('tEXt', text),
  chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
])

fs.mkdirSync(OUT, { recursive: true })
fs.writeFileSync(path.join(OUT, 'linjianxia.png'), png)
fs.writeFileSync(path.join(OUT, 'linjianxia.json'), `${JSON.stringify(card, null, 2)}\n`, 'utf8')

console.log('png', png.length, 'bytes, sha256', crypto.createHash('sha256').update(png).digest('hex'))
console.log('json', JSON.stringify(card).length, 'chars, name', card.data.name)
