import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { defaultPromptLayout, readPromptLayout, writePromptLayout } from '../src/prompt-layout.ts'
import { fromCardEntries } from '../src/worldbook.ts'
import { buildPreview } from '../src/preview.ts'
import {
  buildCharacterMessage,
  buildCharacterSystem,
  buildDirectorContinuation,
  buildDirectorSystem,
  parseDirectorReply,
  renderBeatMarkdown,
  resolveSpeaker,
  MAX_SPEECHES_PER_BEAT,
} from '../src/orchestrator.ts'
import { appendStage, readStage, readWorld, renderStage, writeWorld } from '../src/stage.ts'
import type { CharacterCard } from '../src/character-card.ts'

const roots: string[] = []

async function workspace(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'dshtavern-orch-'))
  roots.push(root)
  return root
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

function card(overrides: Partial<CharacterCard> = {}): CharacterCard {
  const now = '2026-10-22T00:00:00.000Z'
  return {
    schema: 1,
    kind: 'dshtavern.character',
    id: 'card-00000001',
    name: '月见',
    description: '夜里巡逻的魔法少女',
    personality: '嘴硬心软',
    scenario: '雨夜的旧书店',
    systemPrompt: '你害怕孤独',
    exampleDialogues: '【玩家】你是谁？\n【月见】不必知道。',
    greetings: { first: '', alternates: [] },
    tags: ['魔法少女'],
    entries: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

describe('director reply parsing', () => {
  it('reads narration, hidden plot, and the next speaker from JSON', () => {
    const decision = parseDirectorReply('{"narration":"雨更大了。","inner":"旧书店的灯灭了一盏。","nextSpeaker":"card-00000001"}')
    expect(decision.narration).toBe('雨更大了。')
    expect(decision.inner).toBe('旧书店的灯灭了一盏。')
    expect(decision.nextSpeaker).toBe('card-00000001')
  })

  it('tolerates a fenced JSON reply', () => {
    const decision = parseDirectorReply('```json\n{"narration":"风停了。","inner":"","nextSpeaker":null}\n```')
    expect(decision.narration).toBe('风停了。')
    expect(decision.nextSpeaker).toBeUndefined()
  })

  it('treats a prose reply as narration instead of failing the beat', () => {
    const decision = parseDirectorReply('远处传来钟声。')
    expect(decision.narration).toBe('远处传来钟声。')
    expect(decision.nextSpeaker).toBeUndefined()
  })

  it('splits a transcript-shaped prose reply into narration and a speaker', () => {
    const decision = parseDirectorReply([
      '[旁白] 顶灯闪了一下才稳住。',
      '[月见] *她把伞收起*',
      '',
      '别站在雨里。',
    ].join('\n'))
    expect(decision.narration).toBe('顶灯闪了一下才稳住。')
    expect(decision.narration).not.toContain('别站在雨里')
    expect(decision.nextSpeaker).toBe('月见')
  })

  it('strips narration tags when the director tags several lines', () => {
    const decision = parseDirectorReply('[旁白] 雨更大了。\n[旁白] 灯灭了一盏。')
    expect(decision.narration).toBe('雨更大了。\n灯灭了一盏。')
    expect(decision.nextSpeaker).toBeUndefined()
  })

  it('recovers a speaker embedded in the JSON narration field', () => {
    const decision = parseDirectorReply(JSON.stringify({
      narration: '[旁白] 车厢后部有人合上了包。\n[月见] 那晚的单子呢？',
      inner: '月见在试探。',
      nextSpeaker: null,
    }))
    expect(decision.narration).toBe('车厢后部有人合上了包。')
    expect(decision.nextSpeaker).toBe('月见')
    expect(decision.inner).toBe('月见在试探。')
  })

  it('keeps an explicit speaker over a tag in the narration', () => {
    const decision = parseDirectorReply(JSON.stringify({
      narration: '[旁白] 风停了。\n[月见] 走吧。',
      nextSpeaker: 'card-00000001',
    }))
    expect(decision.narration).toBe('风停了。')
    expect(decision.nextSpeaker).toBe('card-00000001')
  })

  it('resolves a speaker given by name as well as by id', () => {
    const cast = [{ id: 'card-00000001', name: '月见', brief: '魔法少女' }]
    expect(resolveSpeaker({ narration: '', inner: '', nextSpeaker: 'card-00000001' }, cast)?.name).toBe('月见')
    expect(resolveSpeaker({ narration: '', inner: '', nextSpeaker: '月见' }, cast)?.id).toBe('card-00000001')
    expect(resolveSpeaker({ narration: '', inner: '', nextSpeaker: 'unknown' }, cast)).toBeUndefined()
  })
})

describe('director prompt', () => {
  it('states the player and character autonomy boundaries', () => {
    const system = buildDirectorSystem({
      world: { scene: '', facts: [], hidden: [] },
      cast: [],
      stage: [],
      layout: defaultPromptLayout('director'),
    })
    expect(system).toContain('绝不替玩家')
    expect(system).toContain('绝不决定任何角色的选择')
    expect(system).toContain('nextSpeaker')
  })

  it('ends with the output contract, not with a pacing hint', () => {
    // Regression: the first turn used to end with the rotation hint, and 24% of
    // first turns answered in prose. Turns whose prompt happened to end with a
    // restatement of the contract failed only 3% of the time.
    const system = buildDirectorSystem({
      world: { scene: '雨夜', facts: [], hidden: [] },
      cast: [{ id: 'card-00000001', name: '月见', brief: '魔法少女' }],
      stage: [{ seq: 1, at: '', kind: 'speech', speaker: 'card-00000001', speakerName: '月见', text: '走吧。', scope: 'observable' }],
      layout: defaultPromptLayout('director'),
    })
    expect(system).toContain('上一个开口的是「月见」')
    const formatAt = system.indexOf('只输出一个 JSON 对象')
    const rotationAt = system.indexOf('上一个开口的是')
    expect(formatAt).toBeGreaterThan(rotationAt)
    // The contract is the final instruction, not merely later than the hint.
    expect(system.trimEnd().endsWith('输出 null。')).toBe(true)
  })

  it('keeps the output contract last in a continuation prompt too', () => {
    const system = buildDirectorContinuation(
      {
        world: { scene: '', facts: [], hidden: [] },
        cast: [{ id: 'card-00000001', name: '月见', brief: '魔法少女' }],
        stage: [],
        layout: defaultPromptLayout('director'),
      },
      [{ id: 'card-00000001', name: '月见', brief: '魔法少女' }],
    )
    expect(system).toContain('刚说完的是「月见」')
    const contextAt = system.indexOf('# 当前这一幕')
    const formatAt = system.indexOf('只输出一个 JSON 对象')
    expect(formatAt).toBeGreaterThan(contextAt)
  })

  it('drops the contract when the block is disabled', () => {
    const layout = defaultPromptLayout('director')
    const disabled = {
      ...layout,
      blocks: layout.blocks.map(block => block.id === 'director-format' ? { ...block, enabled: false } : block),
    }
    const system = buildDirectorSystem({
      world: { scene: '', facts: [], hidden: [] },
      cast: [], stage: [], layout: disabled,
    })
    expect(system).not.toContain('只输出一个 JSON 对象')
  })

  it('shows hidden plot to the director but never to a character', () => {
    const world = { scene: '雨夜', facts: ['店门锁着'], hidden: ['杀手在门外'] }
    const director = buildDirectorSystem({ world, cast: [], stage: [], layout: defaultPromptLayout('director') })
    expect(director).toContain('杀手在门外')
    const character = buildCharacterSystem({
      layout: defaultPromptLayout(),
      card: card(),
      stage: [],
    })
    expect(character).not.toContain('杀手在门外')
  })

  it('keeps director-only lore in its own block, separate from the world state', () => {
    const secret = {
      id: 's1', name: '月蚀封印', content: '三年前有人在此消失。',
      keys: ['月蚀'], secondaryKeys: [], logic: 'and_any' as const, constant: false,
      position: 'before' as const, order: 100, depth: 6, enabled: true,
      caseSensitive: false, wholeWords: false, audience: 'director' as const,
    }
    const withLore = buildDirectorSystem({
      world: { scene: '雨夜', facts: [], hidden: [] },
      cast: [],
      stage: [],
      layout: defaultPromptLayout('director'),
      worldbook: [secret],
      playerInput: '是月蚀。',
    })
    expect(withLore).toContain('三年前有人在此消失')

    const layout = defaultPromptLayout('director')
    const withoutLore = buildDirectorSystem({
      world: { scene: '雨夜', facts: [], hidden: [] },
      cast: [],
      stage: [],
      layout: {
        ...layout,
        blocks: layout.blocks.map(block => block.id === 'director-lore' ? { ...block, enabled: false } : block),
      },
      worldbook: [secret],
      playerInput: '是月蚀。',
    })
    // Disabling the lore block leaves the world state intact.
    expect(withoutLore).not.toContain('三年前有人在此消失')
    expect(withoutLore).toContain('雨夜')
  })
})

describe('character prompt', () => {
  it('injects the card fields into their catalogue blocks', () => {
    const system = buildCharacterSystem({ layout: defaultPromptLayout(), card: card(), stage: [] })
    expect(system).toContain('夜里巡逻的魔法少女')
    expect(system).toContain('嘴硬心软')
    expect(system).toContain('雨夜的旧书店')
    expect(system).toContain('你害怕孤独')
    expect(system).toContain('不必知道。')
  })

  it('substitutes the card name for {{char}}', () => {
    const layout = defaultPromptLayout()
    const system = buildCharacterSystem({ layout, card: card(), stage: [] })
    expect(system).not.toContain('{{char}}')
    expect(system).toContain('月见')
  })

  it('fires a keyed lore entry only when its key is on stage', () => {
    const withLore = card({
      entries: [{ id: 'e1', name: '雨伞', content: '她的伞是母亲留下的。', keys: ['伞'], position: 'before', constant: false, enabled: true }],
    })
    const quiet = buildCharacterSystem({ layout: defaultPromptLayout(), card: withLore, stage: [], worldbook: fromCardEntries(withLore.entries) })
    expect(quiet).not.toContain('母亲留下')
    const triggered = buildCharacterSystem({
      layout: defaultPromptLayout(),
      card: withLore,
      stage: [{ seq: 1, at: '', kind: 'narration', text: '她收起了伞。', scope: 'observable' }],
      worldbook: fromCardEntries(withLore.entries),
    })
    expect(triggered).toContain('母亲留下')
  })

  it('fires a keyed entry from the player input, which never enters the stage', () => {
    const withLore = card({
      entries: [{ id: 'e1', name: '缎带', content: '缎带是姐姐留下的遗物。', keys: ['缎带'], position: 'before', constant: false, enabled: true }],
    })
    const fromPlayer = buildCharacterSystem({
      layout: defaultPromptLayout(),
      card: withLore,
      stage: [],
      worldbook: fromCardEntries(withLore.entries),
      playerInput: '我看着那截褪色的缎带。',
    })
    expect(fromPlayer).toContain('姐姐留下的遗物')
  })

  it('fires a keyed entry from this beat narration before it is staged', () => {
    const withLore = card({
      entries: [{ id: 'e1', name: '焦痕', content: '焦痕是三年前留下的。', keys: ['焦痕'], position: 'before', constant: false, enabled: true }],
    })
    const system = buildCharacterSystem({
      layout: defaultPromptLayout(),
      card: withLore,
      stage: [],
      worldbook: fromCardEntries(withLore.entries),
      narration: '地砖上那圈焦痕还在。',
    })
    expect(system).toContain('三年前留下的')
  })

  it('keeps a lore entry silent when nothing mentions its key', () => {
    const withLore = card({
      entries: [{ id: 'e1', name: '缎带', content: '缎带是姐姐留下的遗物。', keys: ['缎带'], position: 'before', constant: false, enabled: true }],
    })
    const system = buildCharacterSystem({
      layout: defaultPromptLayout(),
      card: withLore,
      stage: [],
      worldbook: fromCardEntries(withLore.entries),
      playerInput: '今天天气不错。',
      narration: '风停了。',
    })
    expect(system).not.toContain('姐姐留下的遗物')
  })

  it('omits a block the layout disabled', () => {
    const layout = defaultPromptLayout()
    const blocks = layout.blocks.map(block => block.id === 'character-personality'
      ? { ...block, enabled: false }
      : block)
    const system = buildCharacterSystem({ layout: { ...layout, blocks }, card: card(), stage: [] })
    expect(system).not.toContain('嘴硬心软')
  })

  it('passes the beat narration and the player words to the character', () => {
    expect(buildCharacterMessage('雨更大了。', '我推开门。')).toBe('【旁白】雨更大了。\n\n【玩家】我推开门。')
    expect(buildCharacterMessage('', '我推开门。')).toBe('【玩家】我推开门。')
  })

  it('renders the stage, lore tail, and duty text through the layout', () => {
    const system = buildCharacterSystem({
      layout: defaultPromptLayout(),
      card: card(),
      stage: [{ seq: 1, at: '', kind: 'narration', text: '雨停了。', scope: 'observable' }],
    })
    expect(system).toContain('雨停了。')
    // The duty block names the character through the placeholder substitution.
    expect(system).toContain('你现在就是「月见」')
  })

  it('lets the layout disable the stage and duty blocks', () => {
    const layout = defaultPromptLayout()
    const blocks = layout.blocks.map(block => block.id === 'character-stage' || block.id === 'character-duty'
      ? { ...block, enabled: false }
      : block)
    const system = buildCharacterSystem({
      layout: { ...layout, blocks },
      card: card(),
      stage: [{ seq: 1, at: '', kind: 'narration', text: '雨停了。', scope: 'observable' }],
    })
    expect(system).not.toContain('你现在就是')
  })

  it('keeps a tail-position lore entry in the layout-controlled block', () => {
    const tailEntry = {
      id: 'tail-1', name: '夜巡规则', content: '午夜后不许开窗。',
      keys: ['午夜'], secondaryKeys: [], logic: 'and_any' as const, constant: false,
      position: 'tail' as const, order: 100, depth: 6, enabled: true,
      caseSensitive: false, wholeWords: false, audience: 'all' as const,
    }
    const withTail = buildCharacterSystem({
      layout: defaultPromptLayout(),
      card: card(),
      stage: [],
      worldbook: [tailEntry],
      playerInput: '午夜到了。',
    })
    expect(withTail).toContain('午夜后不许开窗')

    const layout = defaultPromptLayout()
    const withoutTail = buildCharacterSystem({
      layout: {
        ...layout,
        blocks: layout.blocks.map(block => block.id === 'lore-tail' ? { ...block, enabled: false } : block),
      },
      card: card(),
      stage: [],
      worldbook: [tailEntry],
      playerInput: '午夜到了。',
    })
    expect(withoutTail).not.toContain('午夜后不许开窗')
  })
})

describe('beat rendering', () => {
  it('renders narration as a blockquote and speech with a bold speaker', () => {
    const markdown = renderBeatMarkdown([
      { kind: 'narration', text: '风停了。' },
      { kind: 'speech', name: '月见', text: '……谁。' },
    ])
    expect(markdown).toBe('> 风停了。\n\n**月见**\n\n……谁。')
  })

  it('quotes every line of multi-line narration', () => {
    const markdown = renderBeatMarkdown([{ kind: 'narration', text: '第一句。\n第二句。' }])
    expect(markdown).toBe('> 第一句。\n> 第二句。')
  })

  it('keeps story order across several characters in one beat', () => {
    const markdown = renderBeatMarkdown([
      { kind: 'narration', text: '门开了。' },
      { kind: 'speech', name: '星奈', text: '谁呀！' },
      { kind: 'narration', text: '脚步声停了。' },
      { kind: 'speech', name: '结衣', text: '……出去。' },
    ])
    const positions = ['门开了', '星奈', '谁呀', '脚步声停了', '结衣', '出去']
      .map(part => markdown.indexOf(part))
    expect(positions.every(index => index >= 0)).toBe(true)
    expect([...positions].sort((left, right) => left - right)).toEqual(positions)
  })

  it('drops empty segments instead of emitting blank blocks', () => {
    expect(renderBeatMarkdown([
      { kind: 'narration', text: '   ' },
      { kind: 'speech', name: '月见', text: '' },
    ])).toBe('')
  })
})

describe('beat continuation', () => {
  it('names the previous speaker and asks for someone else', () => {
    const system = buildDirectorContinuation(
      { world: { scene: '', facts: [], hidden: [] }, cast: [], stage: [], layout: defaultPromptLayout('director') },
      [{ id: 'a', name: '小栗星奈', brief: '开朗' }],
    )
    expect(system).toContain('刚说完的是「小栗星奈」')
    expect(system).toContain('nextSpeaker: null')
  })

  it('caps how many characters may speak in one beat', () => {
    expect(MAX_SPEECHES_PER_BEAT).toBeGreaterThan(1)
    expect(MAX_SPEECHES_PER_BEAT).toBeLessThanOrEqual(5)
  })
})

describe('stage storage', () => {
  it('appends entries with monotonic sequence numbers', async () => {
    const directory = await workspace()
    const first = await appendStage(directory, [{ kind: 'narration', text: '雨夜。', scope: 'observable' }])
    const second = await appendStage(directory, [
      { kind: 'speech', speaker: 'card-00000001', speakerName: '月见', text: '谁？', scope: 'observable' },
    ])
    expect(first[0]?.seq).toBe(1)
    expect(second[0]?.seq).toBe(2)
    expect(await readStage(directory)).toHaveLength(2)
  })

  it('keeps each chat on its own stage', async () => {
    const directory = await workspace()
    await appendStage(directory, [{ kind: 'narration', text: '第一个故事。', scope: 'observable' }], 'session-a')
    await appendStage(directory, [{ kind: 'narration', text: '第二个故事。', scope: 'observable' }], 'session-b')
    expect((await readStage(directory, 'session-a'))[0]?.text).toBe('第一个故事。')
    expect((await readStage(directory, 'session-b'))[0]?.text).toBe('第二个故事。')
    expect(await readStage(directory, 'session-c')).toEqual([])
  })

  it('renders only observable lines and attributes speech', () => {
    const text = renderStage([
      { seq: 1, at: '', kind: 'narration', text: '雨夜。', scope: 'observable' },
      { seq: 2, at: '', kind: 'narration', text: '她不知道有人跟踪。', scope: 'omniscient' },
      { seq: 3, at: '', kind: 'speech', speaker: 'a', speakerName: '月见', text: '谁？', scope: 'observable' },
    ])
    expect(text).toContain('[旁白] 雨夜。')
    expect(text).toContain('[月见] 谁？')
    expect(text).not.toContain('她不知道有人跟踪')
  })

  it('keeps hidden plot in the world, out of the stage', async () => {
    const directory = await workspace()
    expect(await readWorld(directory)).toEqual({ scene: '', facts: [], hidden: [] })
    await writeWorld(directory, { scene: '雨夜', facts: ['店门锁着'], hidden: ['杀手在门外'] })
    const world = await readWorld(directory)
    expect(world.hidden).toEqual(['杀手在门外'])
    expect(world.updatedAt).toBeDefined()
    expect(await readStage(directory)).toEqual([])
  })
})

describe('director orchestration', () => {
  it('lets the director layout reorder and disable its own blocks', async () => {
    const directory = await workspace()
    const layout = defaultPromptLayout('director')
    const blocks = layout.blocks.map(block => block.id === 'director-rules'
      ? { ...block, enabled: false }
      : block)
    const reordered = [blocks[1]!, blocks[0]!, ...blocks.slice(2)]
    await writePromptLayout(directory, reordered, 'director')

    const stored = await readPromptLayout(directory, 'director')
    expect(stored.blocks[0]?.id).toBe('director-roster')

    const system = buildDirectorSystem({
      world: { scene: '', facts: [], hidden: [] },
      cast: [],
      stage: [],
      layout: stored,
    })
    // The disabled rules block contributes nothing; the enabled ones remain.
    expect(system).not.toContain('绝不替玩家')
    expect(system).toContain('主持人')
  })

  it('keeps the director and character layouts in separate files', async () => {
    const directory = await workspace()
    await writePromptLayout(directory, defaultPromptLayout('director').blocks, 'director')
    const character = await readPromptLayout(directory, 'character')
    // Writing the director layout must not create or overwrite the character one.
    expect(character.blocks[0]?.id).toBe('main-template')
    expect(character.savedAt).toBeUndefined()
  })

  it('rejects a character block id inside the director layout', async () => {
    const directory = await workspace()
    await expect(writePromptLayout(directory, defaultPromptLayout('character').blocks, 'director'))
      .rejects.toThrow()
  })
})

describe('prompt preview', () => {
  it('assembles the character prompt with the card and the lore the sample activates', () => {
    const withLore = card({
      entries: [{ id: 'e1', name: '缎带', content: '缎带是姐姐留下的遗物。', keys: ['缎带'], position: 'before', constant: false, enabled: true }],
    })
    const preview = buildPreview({
      scope: 'character',
      layout: defaultPromptLayout(),
      cards: [withLore],
      worldbook: [],
      sample: '我看向那条缎带。',
    })
    expect(preview.cardName).toBe('月见')
    expect(preview.system).toContain('夜里巡逻的魔法少女')
    expect(preview.system).toContain('姐姐留下的遗物')
    expect(preview.lore.map(hit => hit.name)).toEqual(['缎带'])
  })

  it('gives the director prompt director-only lore but not to the character', () => {
    const secret = {
      id: 's1', name: '月蚀封印', content: '三年前有人在此消失。',
      keys: ['月蚀'], secondaryKeys: [], logic: 'and_any' as const, constant: false,
      position: 'before' as const, order: 100, depth: 6, enabled: true,
      caseSensitive: false, wholeWords: false, audience: 'director' as const,
    }
    const director = buildPreview({
      scope: 'director',
      layout: defaultPromptLayout('director'),
      cards: [card()],
      worldbook: [secret],
      sample: '月亮被咬掉了一口，是月蚀。',
    })
    expect(director.system).toContain('三年前有人在此消失')
    const character = buildPreview({
      scope: 'character',
      layout: defaultPromptLayout(),
      cards: [card()],
      worldbook: [secret],
      sample: '月亮被咬掉了一口，是月蚀。',
    })
    expect(character.system).not.toContain('三年前有人在此消失')
    expect(character.lore).toHaveLength(0)
  })

  it('renders the requested card when several exist', () => {
    const other = card({ id: 'card-00000002', name: '小栗星奈', description: '开朗的魔法少女' })
    const preview = buildPreview({
      scope: 'character',
      layout: defaultPromptLayout(),
      cards: [card(), other],
      cardId: 'card-00000002',
      worldbook: [],
    })
    expect(preview.cardName).toBe('小栗星奈')
    expect(preview.system).toContain('开朗的魔法少女')
    expect(preview.system).not.toContain('夜里巡逻的魔法少女')
  })

  it('claims no activation for an empty sample', () => {
    const preview = buildPreview({
      scope: 'character',
      layout: defaultPromptLayout(),
      cards: [card()],
      worldbook: [],
    })
    expect(preview.lore).toHaveLength(0)
    expect(preview.loreChars).toBe(0)
  })

  it('refuses to preview a character prompt without a card', () => {
    expect(() => buildPreview({
      scope: 'character',
      layout: defaultPromptLayout(),
      cards: [],
      worldbook: [],
    })).toThrow()
  })
})
