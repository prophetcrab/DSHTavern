import { describe, expect, it } from 'vitest'
import { buildCharacterCard } from '../src/character-card.ts'
import { defaultImageConfig } from '../src/image/config.ts'
import {
  ImagePromptError,
  cardAppearance,
  parseRefineReply,
  portraitPreview,
  renderImageTemplate,
  scenePreview,
} from '../src/image/prompt.ts'
import type { StoredBeat } from '../src/regenerate.ts'

const card = buildCharacterCard('card-1', {
  name: '林见夏',
  description: '夜班售票员。\n\n总穿深色制服。',
  appearance: '深蓝制服，黑色短发，右眼下有一颗小痣',
  personality: '说话慢',
  scenario: '末班车',
}, { createdAt: '2026-10-26T00:00:00.000Z', updatedAt: '2026-10-26T00:00:00.000Z' })

const beat: StoredBeat = {
  file: '/tmp/beat.json',
  record: {
    at: '2026-10-26T00:00:00.000Z',
    playerInput: '我推开门。',
    directorSystem: '',
    directorReply: '',
    decision: { narration: '', inner: '' },
    turns: [{
      directorSystem: '',
      directorReply: '',
      decision: { narration: '雨落在车窗上。', inner: '导演私记：她是失踪者的女儿。', nextSpeaker: 'card-1' },
      effectiveSpeaker: { id: 'card-1', name: '林见夏' },
      speech: '你来了。',
    }],
    turn: 3,
    stageCountBefore: 0,
    worldBefore: { scene: '末班车车厢', facts: [], hidden: ['她其实知道账本在哪'] },
  },
}

describe('image prompts', () => {
  it('builds a scene draft from visible material and never leaks private notes', () => {
    const preview = scenePreview(beat, [card], defaultImageConfig())
    expect(preview.turn).toBe(3)
    expect(preview.scene).toContain('雨落在车窗上')
    expect(preview.scene).toContain('你来了')
    expect(preview.scene).toContain('末班车车厢')
    expect(preview.draft).toContain('林见夏')
    expect(preview.draft).toContain('深蓝制服')
    expect(preview.draft).not.toContain('导演私记')
    expect(preview.draft).not.toContain('账本')
  })

  it('falls back to the description first paragraph for appearance', () => {
    const bare = buildCharacterCard('card-2', {
      name: '白鹭',
      description: '实习记者。\n\n总带一台旧相机。',
    }, { createdAt: '2026-10-26T00:00:00.000Z', updatedAt: '2026-10-26T00:00:00.000Z' })
    expect(cardAppearance(bare)).toBe('实习记者。')
    const preview = portraitPreview(bare, defaultImageConfig())
    expect(preview.draft).toContain('实习记者。')
    expect(preview.draft).toContain('白鹭')
  })

  it('renders placeholders case-insensitively', () => {
    expect(renderImageTemplate('{{Scene}} / {{ name }} / {{missing}}', { scene: '雨', name: '她' }))
      .toBe('雨 / 她 / {{missing}}')
  })

  it('parses a JSON refinement and falls back to raw text', () => {
    expect(parseRefineReply('```json\n{"prompt":"雨夜车厢","negative":"水印"}\n```', 800))
      .toEqual({ prompt: '雨夜车厢', negative: '水印', parsed: true })
    expect(parseRefineReply('只是一段普通的提示词', 4))
      .toEqual({ prompt: '只是一段', parsed: false })
    expect(() => parseRefineReply('   ', 800)).toThrow(ImagePromptError)
  })
})
