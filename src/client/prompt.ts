/**
 * Prompt orchestration UI for the session toolbox.
 *
 * The toolbox drawer renders this component for the current tavern workspace:
 * a drag-to-reorder list of the system-prompt blocks, an enable switch per
 * block, save-state feedback and a reset action. Order and flags persist
 * through `/tavern/prompt` on the Host half.
 */
import { createElement, useCallback, useEffect, useState } from 'react'
import type { ReactElement } from 'react'
import { fetchCharacterCards } from './characters.js'
import { CLASS } from './styles.js'

/** Where a system-prompt block's content comes from. */
/** Which system prompt a block belongs to. */
export type PromptScope = 'director' | 'character'

export type PromptBlockSource =
  | 'template' | 'character' | 'worldbook' | 'persona' | 'chat' | 'dsh' | 'director' | 'state'

/** One system-prompt block in the assembly order. */
export interface PromptBlockView {
  readonly id: string
  /** Whether this block renders a chosen persona instead of its own text. */
  readonly selectsPersona?: boolean
  /** Persona the block renders; absent means "follow the preset". */
  readonly personaId?: string
  /** Which prompt this block belongs to. */
  readonly appliesTo?: PromptScope
  readonly label: string
  readonly source: PromptBlockSource
  readonly description: string
  readonly enabled: boolean
  /** Whether the block text can be edited here. */
  readonly editable: boolean
  /** Effective text (override or catalogue default). */
  readonly content: string
  /** Catalogue default text. */
  readonly defaultContent: string
  /** Whether the stored layout overrides the default text. */
  readonly overridden: boolean
}

/** One workspace's prompt assembly order. */
export interface PromptLayoutSnapshot {
  readonly workspaceId: string
  readonly workspaceTitle: string
  readonly workspacePath: string
  readonly blocks: readonly PromptBlockView[]
  readonly hasCharacterCard: boolean
  readonly savedAt?: string
}

/**
 * Map a drag among the rendered blocks onto the full stored ordering, so the
 * hidden character blocks keep their slots while the visible subset moves.
 * @param blocks - full stored ordering.
 * @param visible - rendered subset, in display order.
 * @param from - dragged index within `visible`.
 * @param to - target index within `visible`.
 * @returns a full ordering with the visible subset reordered.
 */
export function reorderVisibleBlocks(
  blocks: readonly PromptBlockView[],
  visible: readonly PromptBlockView[],
  from: number,
  to: number,
): PromptBlockView[] {
  if (from === to || from < 0 || to < 0 || from >= visible.length || to >= visible.length) {
    return [...blocks]
  }
  const visibleIds = new Set(visible.map(block => block.id))
  const indices = blocks.flatMap((block, index) => visibleIds.has(block.id) ? [index] : [])
  const source = indices[from]
  const target = indices[to]
  if (source === undefined || target === undefined) return [...blocks]
  const next = [...blocks]
  const [item] = next.splice(source, 1)
  if (item === undefined) return next
  next.splice(target, 0, item)
  return next
}

/** Human-facing badge for one prompt block source. */
const SOURCE_LABELS: Record<PromptBlockSource, string> = {
  template: '模板',  character: '角色卡',
  worldbook: '世界书',
  persona: '人设',
  chat: '聊天',
  dsh: 'DSH',
  director: '导演',
  state: '运行时',
}

/**
 * Move one array item, returning a new array.
 * @param items - source list.
 * @param from - current index.
 * @param to - target index.
 * @returns reordered copy; unchanged or out-of-bounds indices give a copy.
 */
export function moveBlock<T>(items: readonly T[], from: number, to: number): T[] {
  const next = [...items]
  if (from === to || from < 0 || to < 0 || from >= next.length || to >= next.length) return next
  const [item] = next.splice(from, 1)
  if (item === undefined) return next
  next.splice(to, 0, item)
  return next
}

/** Read failure as display text. */
function errorText(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

/** Parse one JSON response from a tavern route. */
async function readJsonResponse(response: Response): Promise<Record<string, unknown>> {
  let body: unknown
  try {
    body = await response.json()
  } catch {
    throw new Error(`酒馆接口不可用（HTTP ${response.status}）`)
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new Error('酒馆接口返回了非对象 JSON')
  }
  const record = body as Record<string, unknown>
  if (record.ok !== true) {
    throw new Error(typeof record.error === 'string' ? record.error : `酒馆请求失败（HTTP ${response.status}）`)
  }
  return record
}

/** Fetch one workspace's system-prompt assembly order. */
export async function fetchPromptLayout(
  workspaceId: string,
  scope: PromptScope = 'character',
): Promise<PromptLayoutSnapshot> {
  const response = await fetch(`/tavern/prompt?workspaceId=${encodeURIComponent(workspaceId)}&scope=${scope}`, {
    headers: { accept: 'application/json' },
    cache: 'no-store',
  })
  return (await readJsonResponse(response)) as unknown as PromptLayoutSnapshot
}

/** Persist a block order, or reset it to the catalogue default. */
export async function savePromptLayout(
  workspaceId: string,
  body: Record<string, unknown>,
  scope: PromptScope = 'character',
): Promise<PromptLayoutSnapshot> {
  const response = await fetch('/tavern/prompt', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ workspaceId, scope, ...body }),
  })
  return (await readJsonResponse(response)) as unknown as PromptLayoutSnapshot
}

/** One entry the sample line activated. */
export interface PreviewLoreHit {
  readonly id: string
  readonly name: string
  readonly visibility: 'all' | 'director' | 'characters'
  readonly chars: number
}

/** Short label for one visibility, shown beside a preview hit. */
const VISIBILITY_SHORT: Record<PreviewLoreHit['visibility'], string> = {
  all: '全体可见',
  director: '仅导演',
  characters: '指定角色',
}

/** The assembled prompt one scope produces. */
export interface PromptPreview {
  readonly scope: PromptScope
  readonly system: string
  readonly cardName?: string
  readonly cards: readonly { id: string; name: string }[]
  readonly lore: readonly PreviewLoreHit[]
  readonly loreChars: number
  readonly sample: string
}

/** Personas the prompt picker can offer for one workspace. */
export interface PersonaOptions {
  readonly personas: readonly { id: string; name: string }[]
  /** Name of the workspace preset persona, when one is active. */
  readonly presetName?: string
}

/**
 * Load the persona choices one workspace offers.
 *
 * The persona library is workspace-scoped, so the picker offers exactly the
 * entries the persona workbench manages.
 * @param workspaceId - tavern workspace id.
 * @returns the selectable personas and the preset's name.
 */
export async function fetchPersonaOptions(workspaceId: string): Promise<PersonaOptions> {
  const response = await fetch(`/tavern/personas?workspaceId=${encodeURIComponent(workspaceId)}`, {
    headers: { accept: 'application/json' },
    cache: 'no-store',
  })
  const body = await readJsonResponse(response)
  const personas = Array.isArray(body.personas)
    ? (body.personas as { id?: unknown; name?: unknown }[])
      .filter(item => typeof item.id === 'string' && typeof item.name === 'string')
      .map(item => ({ id: item.id as string, name: item.name as string }))
    : []
  const activeId = typeof body.activeId === 'string' ? body.activeId : undefined
  const presetName = activeId === undefined
    ? undefined
    : personas.find(persona => persona.id === activeId)?.name ?? personas[0]?.name
  return { personas, ...(presetName === undefined ? {} : { presetName }) }
}

/**
 * Ask the host to assemble a prompt for inspection.
 *
 * The host runs the same builders the runtime uses, so the result is the request
 * the model would actually receive rather than a client-side approximation.
 * @param workspaceId - tavern workspace id.
 * @param scope - which prompt to assemble.
 * @param options - optional card selection, the sample line to scan, and the
 *   chat whose stage and world the preview should reflect.
 * @returns the assembled preview.
 */
export async function fetchPromptPreview(
  workspaceId: string,
  scope: PromptScope,
  options: { cardId?: string; sample?: string; sessionId?: string } = {},
): Promise<PromptPreview> {
  const params = new URLSearchParams({ workspaceId, scope })
  if (options.cardId !== undefined) params.set('cardId', options.cardId)
  if (options.sessionId !== undefined) params.set('sessionId', options.sessionId)
  params.set('sample', options.sample ?? '')
  const response = await fetch(`/tavern/preview?${params.toString()}`, {
    headers: { accept: 'application/json' },
    cache: 'no-store',
  })
  return (await readJsonResponse(response)) as unknown as PromptPreview
}

/** One draggable prompt block card. */
export interface PromptCardProps {
  readonly block: PromptBlockView
  readonly index: number
  readonly dragging: boolean
  readonly over: boolean
  readonly disabled: boolean
  readonly onDragStart: (index: number) => void
  readonly onDragOver: (index: number) => void
  readonly onDrop: (index: number) => void
  readonly onDragEnd: () => void
  readonly onToggle: (id: string) => void
  readonly onOpen: () => void
  /** Personas the picker may offer; empty when the workspace has none. */
  readonly personas: readonly { id: string; name: string }[]
  /** Preset persona name, shown on the "follow preset" option. */
  readonly presetName?: string
  /** Pick one persona for this block, or `undefined` to follow the preset. */
  readonly onPickPersona: (id: string | undefined) => void
}

/**
 * Render one prompt block card without state, so it is unit-testable.
 * @param props - block data, drag state, and callbacks.
 * @returns the card element.
 */
export function PromptCardView(props: PromptCardProps): ReactElement {
  const block = props.block
  const className = [
    CLASS.promptCard,
    props.dragging ? 'dshtavern-prompt-card-dragging' : '',
    props.over ? 'dshtavern-prompt-card-over' : '',
    block.enabled ? '' : 'dshtavern-prompt-card-off',
  ].filter(part => part.length > 0).join(' ')
  const canEdit = block.editable && !props.disabled
  return createElement('div', {
    key: block.id,
    className,
    'data-source': block.source,
    'data-enabled': block.enabled,
    draggable: true,
    'aria-grabbed': props.dragging,
    onClick: canEdit ? props.onOpen : undefined,
    onDragStart: (event: { dataTransfer?: { effectAllowed: string; setData(type: string, value: string): void } }) => {
      if (event.dataTransfer !== undefined) {
        event.dataTransfer.effectAllowed = 'move'
        event.dataTransfer.setData('text/plain', block.id)
      }
      props.onDragStart(props.index)
    },
    onDragOver: (event: { preventDefault(): void }) => {
      event.preventDefault()
      props.onDragOver(props.index)
    },
    onDrop: (event: { preventDefault(): void }) => {
      event.preventDefault()
      props.onDrop(props.index)
    },
    onDragEnd: () => props.onDragEnd(),
  },
  createElement('span', { key: 'handle', className: CLASS.dragHandle, 'aria-hidden': true }, '⠿'),
  createElement('span', { key: 'index', className: CLASS.promptIndex }, String(props.index + 1)),
  createElement('div', { key: 'main', className: CLASS.promptMain },
    createElement('div', { key: 'title', className: 'dshtavern-prompt-title' },
      createElement('span', { className: CLASS.promptName }, block.label),
      createElement('span', { className: CLASS.badge, 'data-source': block.source },
        SOURCE_LABELS[block.source]),
      block.enabled
        ? null
        : createElement('span', { key: 'off', className: 'dshtavern-pill', 'data-tone': 'muted' }, '已停用'),
      block.overridden
        ? createElement('span', { key: 'mod', className: 'dshtavern-pill', 'data-tone': 'ok' }, '已修改')
        : null),
    createElement('div', { key: 'hint', className: CLASS.hint }, block.description),
    block.selectsPersona
      ? createElement('div', { key: 'persona', className: 'dshtavern-prompt-persona' },
        createElement('select', {
          className: 'dshtavern-wb-input',
          value: block.personaId ?? '',
          disabled: props.disabled,
          'aria-label': '选择人设',
          onClick: (event: { stopPropagation(): void }) => event.stopPropagation(),
          onChange: (event: { target: { value: string } }) =>
            props.onPickPersona(event.target.value === '' ? undefined : event.target.value),
        },
        createElement('option', { value: '' },
          props.presetName === undefined ? '跟随预设人设' : `跟随预设：${props.presetName}`),
        props.personas.map(persona =>
          createElement('option', { key: persona.id, value: persona.id }, persona.name))))
      : null),
  createElement('div', { key: 'side', className: 'dshtavern-prompt-side' },
    createElement('span', {
      key: 'chars',
      className: 'dshtavern-prompt-chars',
      title: '这个块进入提示词的字数；运行时块在装配时才能确定',
    }, promptSizeLabel(block)),
    canEdit
      ? createElement('button', {
        key: 'edit',
        type: 'button',
        className: 'dshtavern-prompt-edit',
        'aria-label': `编辑 ${block.label}`,
        onClick: (event: { stopPropagation(): void }) => {
          event.stopPropagation()
          props.onOpen()
        },
      }, '编辑')
      : null),
  createElement('label', {
    key: 'switch',
    className: 'dshtavern-switch',
    title: block.enabled ? '已启用' : '已停用',
    onClick: (event: { stopPropagation(): void }) => event.stopPropagation(),
  },
  createElement('input', {
    type: 'checkbox',
    checked: block.enabled,
    disabled: props.disabled,
    onChange: () => props.onToggle(block.id),
  }),
  createElement('span', { className: 'dshtavern-switch-track', 'aria-hidden': true },
    createElement('span', { className: 'dshtavern-switch-thumb' }))))
}

/**
 * Character cost of one block, as shown on its card.
 *
 * Card-sourced and runtime blocks carry no stored text: their content is filled
 * while a request is assembled, so a character count would be a lie.
 * @param block - the block to measure.
 * @returns a compact size label.
 */
export function promptSizeLabel(block: PromptBlockView): string {
  const chars = block.content.trim().length
  if (chars === 0) return '运行时'
  if (chars < 1000) return `${chars} 字`
  return `${(chars / 1000).toFixed(1)}k 字`
}


/** Props of the prompt-block edit dialog. */
export interface PromptEditorDialogProps {
  readonly block: PromptBlockView
  readonly draft: string
  readonly disabled: boolean
  readonly onDraftChange: (value: string) => void
  readonly onSave: () => void
  readonly onCancel: () => void
  readonly onResetContent: () => void
}

/**
 * Floating dialog that edits one block's prompt text.
 * @param props - block, draft text, and editor actions.
 * @returns the dialog element.
 */
export function PromptEditorDialog(props: PromptEditorDialogProps): ReactElement {
  return createElement('div', {
    className: 'dshtavern-editor-layer',
    onClick: (event: { target: unknown; currentTarget: unknown }) => {
      if (event.target === event.currentTarget) props.onCancel()
    },
  },
  createElement('section', { className: 'dshtavern-editor-dialog', role: 'dialog', 'aria-label': props.block.label },
    createElement('header', { className: 'dshtavern-editor-head' },
      createElement('div', { style: { flex: 1, minWidth: 0 } },
        createElement('div', { className: 'dshtavern-editor-title' }, props.block.label),
        createElement('div', { className: 'dshtavern-editor-sub' }, props.block.description)),
      createElement('button', {
        type: 'button',
        className: 'dshtavern-window-close',
        title: '关闭',
        'aria-label': '关闭',
        onClick: props.onCancel,
      }, '✕')),
    createElement('textarea', {
      className: 'dshtavern-editor-textarea',
      value: props.draft,
      rows: 10,
      autoFocus: true,
      spellCheck: false,
      placeholder: '输入这个提示词块的具体内容；支持 {{char}} / {{user}} 等占位符',
      onChange: (event: { target: { value: string } }) => props.onDraftChange(event.target.value),
      onKeyDown: (event: { key: string; stopPropagation(): void }) => {
        if (event.key !== 'Escape') return
        event.stopPropagation()
        props.onCancel()
      },
    }),
    createElement('footer', { className: 'dshtavern-editor-actions' },
      createElement('span', { className: CLASS.hint }, `${props.draft.length} 字符`),
      createElement('button', {
        type: 'button',
        className: CLASS.button,
        onClick: props.onResetContent,
      }, '恢复默认文本'),
      createElement('button', {
        type: 'button',
        className: CLASS.button,
        onClick: props.onCancel,
      }, '取消'),
      createElement('button', {
        type: 'button',
        className: 'dshtavern-button dshtavern-button-primary',
        disabled: props.disabled,
        onClick: props.onSave,
      }, '保存'))))
}

/** Props of the toolbox prompt orchestration section. */
export interface PromptOrchestrationProps {
  readonly workspaceId: string
  readonly workspaceTitle: string
  readonly workspacePath: string
  /** Chat whose stage and world the preview should reflect. */
  readonly sessionId?: string
}

/**
 * Load, edit, and persist one tavern workspace's system-prompt order.
 * @param props - the workspace the toolbox opened for.
 * @returns the orchestration section.
 */
export function PromptOrchestration(props: PromptOrchestrationProps): ReactElement {
  const [blocks, setBlocks] = useState<readonly PromptBlockView[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [hasCharacterCard, setHasCharacterCard] = useState(true)
  const [dragFrom, setDragFrom] = useState<number | null>(null)
  const [dragOver, setDragOver] = useState<number | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  // Two independent layouts share this pane: the director prompt and the
  // character prompt. Switching scopes reloads the other one from disk.
  const [scope, setScope] = useState<PromptScope>('character')
  // Preview state: the sample line, which card to render, and the assembled
  // result. Kept separate from the editing state so refreshing the preview never
  // touches unsaved block edits.
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewSample, setPreviewSample] = useState('')
  const [previewCardId, setPreviewCardId] = useState<string | undefined>(undefined)
  const [preview, setPreview] = useState<PromptPreview | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  // Personas the picker offers, plus the workspace preset name it shows on the
  // "follow preset" option.
  const [personas, setPersonas] = useState<readonly { id: string; name: string }[]>([])
  const [presetPersonaName, setPresetPersonaName] = useState<string | undefined>(undefined)
  // The picker lists the workspace's real cards. Reading them from the preview
  // response would leave only a placeholder until the first preview ran.
  const [previewCards, setPreviewCards] = useState<readonly { id: string; name: string }[]>([])
  const [cardsError, setCardsError] = useState<string | null>(null)

  useEffect(() => {
    if (!previewOpen || scope !== 'character') return
    let cancelled = false
    fetchCharacterCards(props.workspaceId).then(cards => {
      if (cancelled) return
      setPreviewCards(cards.map(card => ({ id: card.id, name: card.name })))
      setCardsError(null)
      setPreviewCardId(current => current !== undefined && cards.some(card => card.id === current)
        ? current
        : cards[0]?.id)
    }).catch(cause => {
      if (cancelled) return
      setCardsError(errorText(cause))
    })
    return () => { cancelled = true }
  }, [previewOpen, props.workspaceId, scope])

  const runPreview = useCallback(async () => {
    setPreviewLoading(true)
    setPreviewError(null)
    try {
      const next = await fetchPromptPreview(props.workspaceId, scope, {
        ...(previewCardId === undefined ? {} : { cardId: previewCardId }),
        ...(props.sessionId === undefined ? {} : { sessionId: props.sessionId }),
        sample: previewSample,
      })
      setPreview(next)
    } catch (cause) {
      setPreviewError(errorText(cause))
    } finally {
      setPreviewLoading(false)
    }
  }, [props.workspaceId, props.sessionId, scope, previewCardId, previewSample])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setNotice(null)
    setBlocks([])
    void fetchPersonaOptions(props.workspaceId).then((options) => {
      if (cancelled) return
      setPersonas(options.personas)
      setPresetPersonaName(options.presetName)
    }).catch(() => undefined)
    fetchPromptLayout(props.workspaceId, scope).then(layout => {
      if (cancelled) return
      setBlocks(layout.blocks)
      setHasCharacterCard(layout.hasCharacterCard !== false)
      setSavedAt(layout.savedAt ?? null)
      setLoading(false)
    }).catch(cause => {
      if (cancelled) return
      setError(errorText(cause))
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [props.workspaceId, scope])

  const persist = useCallback(async (next: readonly PromptBlockView[], reset = false) => {
    setSaving(true)
    setError(null)
    setNotice(null)
    try {
      const layout = await savePromptLayout(props.workspaceId, reset
        ? { reset: true }
        : {
          blocks: next.map(block => ({
            id: block.id,
            enabled: block.enabled,
            content: block.content,
          })),
        }, scope)
      setBlocks(layout.blocks)
      setSavedAt(layout.savedAt ?? null)
      setNotice(reset ? '已恢复默认顺序' : '已保存顺序')
    } catch (cause) {
      setError(errorText(cause))
    } finally {
      setSaving(false)
      setDragFrom(null)
      setDragOver(null)
    }
  }, [props.workspaceId, scope])

  const pickPersona = useCallback(async (blockId: string, personaId: string | undefined) => {
    const next = blocks.map(block => block.id === blockId
      ? { ...block, personaId }
      : block)
    setBlocks(next)
    setSaving(true)
    setError(null)
    try {
      const layout = await savePromptLayout(props.workspaceId, {
        blocks: next.map(block => ({
          id: block.id,
          enabled: block.enabled,
          content: block.content,
          ...(block.personaId === undefined ? {} : { personaId: block.personaId }),
        })),
      }, scope)
      setBlocks(layout.blocks)
      setSavedAt(layout.savedAt ?? null)
      setNotice(personaId === undefined ? '已改为跟随预设人设' : '已选择人设')
    } catch (cause) {
      setError(errorText(cause))
    } finally {
      setSaving(false)
    }
  }, [blocks, props.workspaceId, scope])

  const onDragStart = useCallback((index: number) => {
    setDragFrom(index)
    setDragOver(index)
  }, [])

  const onDragOver = useCallback((index: number) => {
    setDragOver(current => current === index ? current : index)
  }, [])

  const onDrop = useCallback((target: number) => {
    setBlocks(current => {
      if (dragFrom === null || dragFrom === target) return current
      const visible = hasCharacterCard ? current : current.filter(block => block.source !== 'character')
      const next = reorderVisibleBlocks(current, visible, dragFrom, target)
      void persist(next)
      return next
    })
    setDragFrom(null)
    setDragOver(null)
  }, [dragFrom, hasCharacterCard, persist])

  const onToggle = useCallback((id: string) => {
    setBlocks(current => {
      const next = current.map(block => block.id === id ? { ...block, enabled: !block.enabled } : block)
      void persist(next)
      return next
    })
  }, [persist])

  const onOpenEditor = useCallback((block: PromptBlockView) => {
    if (!block.editable) return
    setEditingId(block.id)
    setDraft(block.content)
  }, [])

  const onSaveEditor = useCallback(() => {
    const id = editingId
    if (id === null) return
    setBlocks(current => {
      const next = current.map(block => block.id === id
        ? { ...block, content: draft, overridden: draft !== block.defaultContent }
        : block)
      void persist(next)
      return next
    })
    setEditingId(null)
  }, [draft, editingId, persist])

  const onResetContent = useCallback(() => {
    const block = blocks.find(item => item.id === editingId)
    if (block === undefined) return
    setDraft(block.defaultContent)
  }, [blocks, editingId])

  const status = saving
    ? '保存中…'
    : savedAt === null ? '尚未保存（默认顺序）' : `已保存 ${savedAt.replace('T', ' ').slice(0, 19)}`
  const visibleBlocks = scope === 'character' && !hasCharacterCard
    ? blocks.filter(block => block.source !== 'character')
    : blocks
  const editingBlock = editingId === null
    ? null
    : blocks.find(block => block.id === editingId) ?? null

  const previewMeta = preview === null
    ? null
    : createElement('div', { className: 'dshtavern-preview-meta' },
      createElement('span', { className: 'dshtavern-pill' },
        preview.scope === 'director' ? '导演提示词' : `角色：${preview.cardName ?? '—'}`),
      createElement('span', { className: 'dshtavern-pill' }, `${preview.system.length} 字符`),
      createElement('span', { className: 'dshtavern-pill' },
        `世界书 ${preview.lore.length} 条 / ${preview.loreChars} 字`))

  const previewLore = preview === null
    ? null
    : preview.lore.length === 0
      ? createElement('div', { className: 'dshtavern-wb-hint' }, '这段测试台词没有激活任何世界书条目。')
      : createElement('div', { className: 'dshtavern-preview-lore' },
        preview.lore.map(hit => createElement('span', {
          key: hit.id,
          className: 'dshtavern-preview-lore-chip',
          'data-audience': hit.visibility,
        }, hit.name, createElement('span', { className: 'dshtavern-preview-lore-meta' },
          ` · ${VISIBILITY_SHORT[hit.visibility]}`))))

  const previewBody = preview === null
    ? createElement('div', { className: 'dshtavern-wb-hint' },
      '点「生成预览」查看最终 system。世界书条目会按测试台词命中。')
    : createElement('div', { className: 'dshtavern-preview-body' },
      previewMeta,
      previewLore,
      createElement('pre', { className: 'dshtavern-preview-system' }, preview.system))

  const previewControls = createElement('div', { className: 'dshtavern-preview-controls' },
    scope === 'character'
      ? createElement('label', { className: 'dshtavern-wb-field' },
        createElement('span', { className: 'dshtavern-wb-label' }, '角色卡'),
        previewCards.length === 0
          ? createElement('select', {
            className: 'dshtavern-wb-input',
            disabled: true,
          }, createElement('option', { value: '' }, cardsError === null ? '（没有角色卡）' : '（读取失败）'))
          : createElement('select', {
            className: 'dshtavern-wb-input',
            value: previewCardId ?? '',
            onChange: (event: { target: { value: string } }) => {
              setPreviewCardId(event.target.value === '' ? undefined : event.target.value)
              setPreview(null)
            },
          },
          ...previewCards.map(card =>
            createElement('option', { key: card.id, value: card.id }, card.name))),
        cardsError === null
          ? null
          : createElement('span', { className: 'dshtavern-wb-hint' }, cardsError))
      : null,
    createElement('label', { className: 'dshtavern-wb-field dshtavern-preview-sample' },
      createElement('span', { className: 'dshtavern-wb-label' }, '测试台词（用于触发世界书）'),
      createElement('input', {
        className: 'dshtavern-wb-input',
        value: previewSample,
        placeholder: '例如：我看向她手腕上那条缎带',
        onChange: (event: { target: { value: string } }) => setPreviewSample(event.target.value),
      })),
    createElement('button', {
      type: 'button',
      className: 'dshtavern-button dshtavern-button-primary',
      disabled: previewLoading,
      onClick: () => { void runPreview() },
    }, previewLoading ? '装配中…' : '生成预览'))

  const previewPane = previewOpen
    ? createElement('div', { className: 'dshtavern-preview' },
      createElement('div', { className: 'dshtavern-preview-head' },
        createElement('span', { className: 'dshtavern-wb-label' }, '装配预览'),
        createElement('span', { className: 'dshtavern-wb-hint' },
          '调用宿主真实的装配函数，结果与模型收到的 system 一致。'),
        createElement('button', {
          type: 'button',
          className: 'dshtavern-window-close',
          title: '关闭预览',
          'aria-label': '关闭预览',
          onClick: () => setPreviewOpen(false),
        }, '✕')),
      previewControls,
      previewError === null ? null : createElement('div', { className: 'dshtavern-banner-error' }, previewError),
      previewBody)
    : null

  return createElement('section', { className: 'dshtavern-prompt-panel' },
    createElement('div', { className: 'dshtavern-scope-switch', role: 'tablist', 'aria-label': '编排对象' },
      ([
        { id: 'character' as const, label: '角色提示词', hint: '每个角色各自的卡与舞台' },
        { id: 'director' as const, label: '导演台', hint: '旁白、节奏与调度规则' },
      ]).map(entry => createElement('button', {
        key: entry.id,
        type: 'button',
        role: 'tab',
        'aria-selected': scope === entry.id,
        className: 'dshtavern-scope-option',
        'data-active': scope === entry.id,
        disabled: saving,
        onClick: () => setScope(entry.id),
      },
      createElement('span', { className: 'dshtavern-scope-name' }, entry.label),
      createElement('span', { className: 'dshtavern-scope-hint' }, entry.hint)))),
    createElement('div', { className: 'dshtavern-prompt-toolbar' },
      createElement('div', { className: CLASS.hint },
        scope === 'director'
          ? '导演决定旁白与谁接话。拖动调整顺序；停用的块不会进入导演的请求。'
          : '拖动卡片调整系统提示词的拼装顺序；停用的块不会进入请求。'
            + (hasCharacterCard ? '' : '（未导入角色卡，角色卡相关块已隐藏）')),
      createElement('span', {
        className: 'dshtavern-pill',
        'data-tone': saving ? 'busy' : undefined,
      }, status),
      createElement('button', {
        type: 'button',
        className: CLASS.button,
        'data-active': previewOpen,
        onClick: () => setPreviewOpen(open => !open),
      }, previewOpen ? '收起预览' : '预览'),
      createElement('button', {
        type: 'button',
        className: CLASS.button,
        disabled: loading || saving,
        onClick: () => { void persist(blocks, true) },
      }, '恢复默认')),
    error === null ? null : createElement('div', { className: CLASS.bannerError }, error),
    notice === null ? null : createElement('div', { className: CLASS.bannerNotice }, notice),
    previewPane,
    loading
      ? createElement('div', { className: CLASS.hint, style: { padding: '4px 2px' } }, '加载中…')
      : createElement('div', { className: CLASS.promptList },
        visibleBlocks.map((block, index) => createElement(PromptCardView, {
          key: block.id,
          block,
          index,
          dragging: dragFrom === index,
          over: dragOver === index && dragFrom !== index,
          disabled: saving,
          onDragStart,
          onDragOver,
          onDrop,
          onDragEnd: () => { setDragFrom(null); setDragOver(null) },
          onToggle,
          onOpen: () => onOpenEditor(block),
          personas,
          ...(presetPersonaName === undefined ? {} : { presetName: presetPersonaName }),
          onPickPersona: (id) => { void pickPersona(block.id, id) },
        }))),
    editingBlock === null
      ? null
      : createElement(PromptEditorDialog, {
        block: editingBlock,
        draft,
        disabled: saving,
        onDraftChange: setDraft,
        onSave: onSaveEditor,
        onCancel: () => setEditingId(null),
        onResetContent,
      }))
}
