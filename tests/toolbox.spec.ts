import { describe, expect, it } from 'vitest'
import { PromptCardView, PromptEditorDialog, moveBlock, reorderVisibleBlocks } from '../src/client/prompt.ts'
import type { PromptCardProps, PromptEditorDialogProps, PromptBlockView } from '../src/client/prompt.ts'
import {
  FAB_SIZE,
  LAUNCHER_DRAG_THRESHOLD_PX,
  clampFabPosition,
  defaultFabPosition,
  launcherGestureMoved,
  matchTavernWorkspace,
  publishStation,
  readToolboxState,
  setActiveTool,
  setToolboxOpen,
} from '../src/client/toolbox.ts'
import type { TavernWorkspaceRef } from '../src/client/toolbox.ts'

const block = {
  id: 'main-template',
  label: '主提示词模板',
  source: 'template' as const,
  description: '整体框架与规则',
  enabled: true,
  editable: true,
  content: '默认模板内容',
  defaultContent: '默认模板内容',
  overridden: false,
}

function renderCard(overrides: Partial<PromptCardProps> = {}): string {
  const props: PromptCardProps = {
    block,
    index: 0,
    dragging: false,
    over: false,
    disabled: false,
    onDragStart: () => {},
    onDragOver: () => {},
    onDrop: () => {},
    onDragEnd: () => {},
    onToggle: () => {},
    onOpen: () => {},
    ...overrides,
  }
  return JSON.stringify(PromptCardView(props))
}

function renderEditor(overrides: Partial<PromptEditorDialogProps> = {}): string {
  const props: PromptEditorDialogProps = {
    block,
    draft: '自定义系统提示词',
    disabled: false,
    onDraftChange: () => {},
    onSave: () => {},
    onCancel: () => {},
    onResetContent: () => {},
    ...overrides,
  }
  return JSON.stringify(PromptEditorDialog(props))
}

describe('prompt card', () => {
  it('renders the block name, source badge, order, drag handle, and switch', () => {
    const card = renderCard()
    expect(card).toContain('主提示词模板')
    expect(card).toContain('模板')
    expect(card).toContain('整体框架与规则')
    expect(card).toContain('dshtavern-drag-handle')
    expect(card).toContain('dshtavern-switch')
    expect(card).toContain('"draggable":true')
    expect(card).toContain('"type":"checkbox"')
    expect(card).toContain('"checked":true')
    expect(card).toContain('"data-source":"template"')
  })

  it('marks dragging and drop-target states with distinct classes', () => {
    expect(renderCard({ dragging: true })).toContain('dshtavern-prompt-card-dragging')
    expect(renderCard({ over: true })).toContain('dshtavern-prompt-card-over')
    expect(renderCard()).toContain('"className":"dshtavern-prompt-card"')
  })

  it('marks a disabled block visually and in data', () => {
    const card = renderCard({ block: { ...block, enabled: false } })
    expect(card).toContain('dshtavern-prompt-card-off')
    expect(card).toContain('"data-enabled":false')
    expect(card).toContain('已停用')
    expect(renderCard()).not.toContain('已停用')
  })

  it('shows the text size and an edit button for editable blocks', () => {
    expect(renderCard()).toContain('6 字')
    expect(renderCard()).toContain('dshtavern-prompt-edit')
    expect(renderCard({ block: { ...block, editable: false } })).not.toContain('dshtavern-prompt-edit')
  })

  it('labels a runtime-filled block instead of showing a false size', () => {
    const card = renderCard({ block: { ...block, content: '' } })
    expect(card).toContain('运行时')
    expect(card).not.toContain('0 字')
  })

  it('opens a separate edit dialog for editable blocks', () => {
    expect(renderCard()).toContain('编辑')
    expect(renderCard({ block: { ...block, editable: false } })).not.toContain('dshtavern-prompt-edit')
    const dialog = renderEditor()
    expect(dialog).toContain('dshtavern-editor-layer')
    expect(dialog).toContain('dshtavern-editor-textarea')
    expect(dialog).toContain('自定义系统提示词')
    expect(dialog).toContain('保存')
    expect(dialog).toContain('恢复默认文本')
  })
})

describe('moveBlock', () => {
  it('moves items to the target index', () => {
    expect(moveBlock(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a'])
    expect(moveBlock(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b'])
    expect(moveBlock(['a', 'b', 'c'], 1, 1)).toEqual(['a', 'b', 'c'])
  })

  it('returns a copy for out-of-bounds indices', () => {
    expect(moveBlock(['a', 'b'], 5, 0)).toEqual(['a', 'b'])
    expect(moveBlock(['a', 'b'], 0, -1)).toEqual(['a', 'b'])
  })
})

describe('reorderVisibleBlocks', () => {
  const block = (id: string, source: PromptBlockView['source']): PromptBlockView => ({
    id,
    label: id,
    source,
    description: '',
    enabled: true,
    editable: source === 'template',
    content: '',
    defaultContent: '',
    overridden: false,
  })
  const blocks = [block('char-1', 'character'), block('tpl-1', 'template'), block('char-2', 'character'), block('tpl-2', 'template')]

  it('moves only the visible subset while hidden blocks keep their relative order', () => {
    const visible = blocks.filter(item => item.source !== 'character')
    const moved = reorderVisibleBlocks(blocks, visible, 1, 0)
    expect(moved.map(item => item.id)).toEqual(['char-1', 'tpl-2', 'tpl-1', 'char-2'])
    const hidden = moved.filter(item => item.source === 'character').map(item => item.id)
    expect(hidden).toEqual(['char-1', 'char-2'])
  })

  it('returns a copy for a no-op drag', () => {
    const visible = blocks.filter(item => item.source !== 'character')
    expect(reorderVisibleBlocks(blocks, visible, 0, 0).map(item => item.id)).toEqual(blocks.map(item => item.id))
  })
})

describe('tavern station matching', () => {
  const taverns: TavernWorkspaceRef[] = [
    { workspaceId: 'w1', workspacePath: 'C:\\Users\\crab\\.dsh\\taverns\\雾都夜话', workspaceTitle: '雾都夜话' },
    { workspaceId: 'w2', workspacePath: 'D:/taverns/second', workspaceTitle: 'second' },
  ]

  it('matches the workspace directory itself', () => {
    expect(matchTavernWorkspace('C:\\Users\\crab\\.dsh\\taverns\\雾都夜话', taverns)?.workspaceId).toBe('w1')
    expect(matchTavernWorkspace('D:\\taverns\\second\\', taverns)?.workspaceId).toBe('w2')
  })

  it('ignores subdirectories, non-tavern directories, and empty cwd', () => {
    // D004: only the directory itself carries the marker, so a session opened in
    // a subdirectory is a normal DSH session and the toolbox must not appear.
    expect(matchTavernWorkspace('C:\\Users\\crab\\.dsh\\taverns\\雾都夜话\\characters', taverns)).toBeNull()
    expect(matchTavernWorkspace('C:\\Users\\crab\\.dsh\\taverns\\another', taverns)).toBeNull()
    expect(matchTavernWorkspace('C:\\Users\\crab\\.dsh\\taverns\\雾都夜话-2', taverns)).toBeNull()
    expect(matchTavernWorkspace(undefined, taverns)).toBeNull()
    expect(matchTavernWorkspace('', taverns)).toBeNull()
  })
})

describe('floating launcher position', () => {
  it('clamps the launcher inside the viewport', () => {
    expect(clampFabPosition({ left: -50, top: -50 }, 1000, 700)).toEqual({ left: 12, top: 12 })
    expect(clampFabPosition({ left: 5000, top: 5000 }, 1000, 700)).toEqual({
      left: 1000 - FAB_SIZE - 12,
      top: 700 - FAB_SIZE - 12,
    })
  })

  it('places the default launcher in the left gutter above the composer', () => {
    const position = defaultFabPosition(1600, 900)
    expect(position.left).toBe(12)
    expect(position.top).toBe(900 - 190)
  })
})

describe('launcher drag detection', () => {
  it('keeps a tiny jitter a click, not a drag', () => {
    expect(launcherGestureMoved(false, 100, 100, 101, 101)).toBe(false)
    expect(launcherGestureMoved(false, 100, 100, 102, 102)).toBe(false)
  })

  it('turns into a drag once the pointer clears the threshold', () => {
    expect(launcherGestureMoved(false, 100, 100, 100 + LAUNCHER_DRAG_THRESHOLD_PX + 1, 100)).toBe(true)
    expect(launcherGestureMoved(false, 100, 100, 100, 100 + LAUNCHER_DRAG_THRESHOLD_PX)).toBe(true)
  })

  it('stays a drag after the pointer returns to the press point', () => {
    // Otherwise releasing where the press started would fire the follow-up
    // click and open the popover mid-drag.
    expect(launcherGestureMoved(true, 100, 100, 100, 100)).toBe(true)
  })
})

describe('toolbox store', () => {
  it('publishes a station, opens the icon popover, and opens a tool window', () => {
    publishStation(null)
    expect(readToolboxState().station).toBeNull()
    publishStation({
      sessionId: 's1',
      workspaceId: 'w1',
      workspacePath: 'C:\\taverns\\one',
      workspaceTitle: 'one',
    })
    expect(readToolboxState().station?.workspaceId).toBe('w1')
    setToolboxOpen(true)
    expect(readToolboxState().open).toBe(true)
    setActiveTool('prompt')
    expect(readToolboxState().activeTool).toBe('prompt')
    expect(readToolboxState().open).toBe(false)
    publishStation(null)
    expect(readToolboxState().station).toBeNull()
    expect(readToolboxState().activeTool).toBeNull()
    expect(readToolboxState().open).toBe(false)
  })
})
