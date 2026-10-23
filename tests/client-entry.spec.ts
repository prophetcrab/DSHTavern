import { describe, expect, it } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { PANEL_ID, PanelView, apply, inject } from '../src/client/index.ts'
import type { PanelViewProps } from '../src/client/index.ts'

interface CapturedEntry {
  readonly name: string
  readonly options: Record<string, unknown>
  readonly component: (props: never) => unknown
}

function mount(): CapturedEntry[] {
  const entries: CapturedEntry[] = []
  const ctx = {
    // The entry registers the sidebar-marker observer through `ctx.effect`;
    // running the callback matches the real lifecycle and returns its disposer.
    effect: (callback: () => (() => void) | void) => callback(),
    // The Trajectory record rides a service injection so a profile without the
    // Conversation client half still loads; there is no such service here, so
    // the callback simply never runs.
    inject: (_names: string[], _callback: () => void) => {},
    slots: {
      inject: (_name: string, callback: () => () => void) => callback(),
      register: (options: Record<string, unknown>, component: (props: never) => unknown) => {
        entries.push({ name: String(options.name), options, component })
        return () => {}
      },
    },
  } as unknown as Context
  apply(ctx)
  return entries
}

function renderPanel(overrides: Partial<PanelViewProps> = {}): string {
  const props: PanelViewProps = {
    overview: null,
    loading: false,
    busy: false,
    error: null,
    notice: null,
    draftTitle: '',
    draftPath: '',
    draftMode: 'rp',
    lastRefreshed: null,
    confirmUntag: null,
    onTitleChange: () => {},
    onPathChange: () => {},
    onModeChange: () => {},
    onCreate: () => {},
    onRefresh: () => {},
    onAdopt: () => {},
    onRequestUntag: () => {},
    onConfirmUntag: () => {},
    onCancelUntag: () => {},
    onSubmitShortcut: () => {},
    ...overrides,
  }
  return JSON.stringify(PanelView(props))
}

const sampleOverview = {
  defaultRoot: 'D:/taverns',
  taverns: [{
    workspaceId: 'w1',
    path: 'D:/taverns/wudu',
    title: '雾都夜话',
    marker: { schema: 1, kind: 'dshtavern', tavernId: '01234567-aaaa', createdAt: '2026-10-21T12:00:00.000Z' },
  }],
  workspaces: [
    { id: 'w1', path: 'D:/taverns/wudu', title: '雾都夜话', tavern: true },
    { id: 'w2', path: 'D:/code/app', title: '编码项目', tavern: false },
  ],
} as const

const sampleBlocks = [
  { id: 'main-template', label: '主提示词模板', source: 'template', description: '整体框架与规则', enabled: true },
  { id: 'character-description', label: '角色描述', source: 'character', description: '角色卡 description', enabled: false },
] as const

describe('browser entry', () => {
  it('registers the main panel and the sidebar row', () => {
    expect(inject).toEqual(['slots'])
    const entries = mount()
    expect(entries.map(entry => entry.name)).toEqual([
      'main',
      'sidebar.panellist',
      'conversation.input.left',
      'shell.overlay',
      'conversation.input.dock',
      'conversation.chat.turnTail',
    ])
    expect(entries[0]?.options.key).toBe(PANEL_ID)
    expect(entries[1]?.options.id).toBe(PANEL_ID)
    expect(entries[1]?.options.label).toBe('酒馆')
  })

  it('renders the tavern panel shell and the create form', () => {
    const panel = renderPanel()
    expect(panel).toContain('酒馆工作区')
    expect(panel).toContain('新建酒馆')
    expect(panel).toContain('还没有酒馆工作区')
    expect(panel).toContain('创建酒馆')
  })

  it('ships a responsive type scale for large screens', () => {
    const panel = renderPanel()
    expect(panel).toContain('--tv-scale')
    expect(panel).toContain('min-width: 1920px')
    expect(panel).toContain('min-width: 2560px')
    expect(panel).toContain('min-width: 1120px')
  })

  it('includes subtle motion with a reduced-motion fallback', () => {
    const panel = renderPanel({ overview: sampleOverview })
    expect(panel).toContain('dshtavern-card-in')
    expect(panel).toContain('dshtavern-rise-in')
    expect(panel).toContain('dshtavern-fade-in')
    expect(panel).toContain('prefers-reduced-motion')
    expect(panel).toContain('dshtavern-button-pulse')
    expect(panel).toContain('animationDelay')
  })

  it('wraps the workspace page in one card', () => {
    const panel = renderPanel({ overview: sampleOverview })
    expect(panel).toContain('"dshtavern-card"')
    expect(panel).toContain('dshtavern-card-head')
    expect(panel).toContain('dshtavern-card-body')
    expect(panel).toContain('dshtavern-card-foot')
    expect(panel).toContain('dshtavern-pane')
    // Prompt orchestration moved to the session toolbox, not the creation page.
    expect(panel).not.toContain('提示词编排')
  })

  it('renders a tavern row and the adoptable workspace list', () => {
    const panel = renderPanel({ overview: sampleOverview })
    expect(panel).toContain('雾都夜话')
    expect(panel).toContain('tavernId 01234567')
    expect(panel).toContain('编码项目')
    expect(panel).toContain('收编为酒馆')
    expect(panel).toContain('D:/taverns')
  })

  it('asks for a second click before removing a marker', () => {
    expect(renderPanel({ overview: sampleOverview, confirmUntag: 'w1' })).toContain('确认取消')
    expect(renderPanel({ overview: sampleOverview, confirmUntag: 'w1' })).toContain('返回')
    expect(renderPanel({ overview: sampleOverview, confirmUntag: null })).not.toContain('确认取消')
    expect(renderPanel({ overview: sampleOverview, confirmUntag: null })).toContain('取消标记')
  })

  it('disables creation while the form is empty', () => {
    expect(renderPanel()).toContain('"disabled":true')
    expect(renderPanel({ draftTitle: '雾都夜话' })).not.toContain('"disabled":true')
    expect(renderPanel({ draftTitle: '雾都夜话', busy: true })).toContain('"disabled":true')
  })

  it('shows the last refresh time and request state', () => {
    expect(renderPanel({ lastRefreshed: '12:34:56' })).toContain('最近刷新 12:34:56')
    expect(renderPanel({ error: '接口不可用' })).toContain('接口不可用')
    expect(renderPanel({ error: '接口不可用' })).toContain('重试')
    expect(renderPanel({ notice: '已创建酒馆工作区' })).toContain('已创建酒馆工作区')
    expect(renderPanel({ loading: true })).toContain('加载中')
  })

  it('renders the sidebar glyph', () => {
    const icon = JSON.stringify(mount()[1]?.component({ size: 16, active: true } as never))
    expect(icon).toContain('酒')
    expect(icon).toContain('16')
  })
})
