/**
 * Player persona workbench.
 *
 * A persona is the player's own identity in a tavern: name, appearance,
 * temperament, background, and how they speak. It is scoped to the workspace, so
 * every chat in one tavern shares it, and exactly one persona is active at a
 * time — the active one fills the `user-persona` prompt block.
 */
import { createElement, useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactElement } from 'react'

/** One persona as served by `/tavern/personas`. */
export interface PersonaView {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly personality: string
  readonly background: string
  readonly speakingStyle: string
  /** Abilities, possessions, standing: everything else that defines the player. */
  readonly characterSheet: string
  readonly tags: readonly string[]
  readonly createdAt: string
  readonly updatedAt: string
}

interface WorkbenchState {
  loading: boolean
  saving: boolean
  error: string | null
  notice: string | null
  personas: readonly PersonaView[]
  activeId: string | null
}

const INITIAL: WorkbenchState = {
  loading: true,
  saving: false,
  error: null,
  notice: null,
  personas: [],
  activeId: null,
}

/** A blank persona for the "new" action. */
function blankPersona(): PersonaView {
  const now = new Date().toISOString()
  return {
    id: '',
    name: '',
    description: '',
    personality: '',
    background: '',
    speakingStyle: '',
    characterSheet: '',
    tags: [],
    createdAt: now,
    updatedAt: now,
  }
}

function errorText(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
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
    throw new Error(typeof record.error === 'string' ? record.error : `请求失败（HTTP ${response.status}）`)
  }
  return record
}

async function loadPersonas(workspaceId: string): Promise<{ personas: PersonaView[]; activeId: string | null }> {
  const response = await fetch(`/tavern/personas?workspaceId=${encodeURIComponent(workspaceId)}`, {
    headers: { accept: 'application/json' },
    cache: 'no-store',
  })
  const body = await readJson(response)
  return {
    personas: Array.isArray(body.personas) ? body.personas as PersonaView[] : [],
    activeId: typeof body.activeId === 'string' ? body.activeId : null,
  }
}

async function savePersonas(
  workspaceId: string,
  personas: readonly PersonaView[],
  activeId: string | null,
): Promise<{ personas: PersonaView[]; activeId: string | null }> {
  const response = await fetch('/tavern/personas', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      workspaceId,
      personas: personas.map(persona => ({
        id: persona.id === '' ? undefined : persona.id,
        name: persona.name,
        description: persona.description,
        personality: persona.personality,
        background: persona.background,
        speakingStyle: persona.speakingStyle,
        characterSheet: persona.characterSheet,
        tags: persona.tags,
      })),
      activeId: activeId ?? undefined,
    }),
  })
  const body = await readJson(response)
  return {
    personas: Array.isArray(body.personas) ? body.personas as PersonaView[] : [],
    activeId: typeof body.activeId === 'string' ? body.activeId : null,
  }
}

/**
 * Render the prompt text one persona contributes.
 *
 * Mirrors the host renderer so the preview matches the request. Empty fields are
 * dropped rather than emitted as labelled blanks.
 * @param persona - persona to render.
 * @returns the block text.
 */
export function renderPersonaPreview(persona: PersonaView): string {
  const lines: string[] = [`玩家扮演「${persona.name || '未命名'}」。`]
  const parts: [string, string][] = [
    ['外观', persona.description],
    ['性格', persona.personality],
    ['背景', persona.background],
    ['说话方式', persona.speakingStyle],
    ['角色设定', persona.characterSheet],
  ]
  for (const [label, value] of parts) {
    const trimmed = value.trim()
    if (trimmed.length > 0) lines.push(`${label}：${trimmed}`)
  }
  return lines.join('\n')
}

/** One labelled text field. */
function Field(props: {
  label: string
  hint?: string
  children: ReactElement
}): ReactElement {
  return createElement('label', { className: 'dshtavern-wb-field' },
    createElement('span', { className: 'dshtavern-wb-label' }, props.label),
    props.children,
    props.hint === undefined ? null : createElement('span', { className: 'dshtavern-wb-hint' }, props.hint))
}

/** Props of the persona workbench. */
export interface PersonaWorkbenchProps {
  readonly workspaceId: string
  readonly workspaceTitle: string
  readonly workspacePath: string
}

/**
 * Two-pane persona editor: the library on the left, the selected persona on the
 * right, with the active persona marked so the list answers "who am I now".
 * @param props - the workspace this workbench edits.
 * @returns the workbench section.
 */
export function PersonaWorkbench(props: PersonaWorkbenchProps): ReactElement {
  const [state, setState] = useState<WorkbenchState>(INITIAL)
  const [draft, setDraft] = useState<PersonaView | null>(null)

  const reload = useCallback(async (notice: string | null = null) => {
    try {
      const { personas, activeId } = await loadPersonas(props.workspaceId)
      setState({ loading: false, saving: false, error: null, notice, personas, activeId })
    } catch (cause) {
      setState(prev => ({ ...prev, loading: false, saving: false, error: errorText(cause) }))
    }
  }, [props.workspaceId])

  useEffect(() => {
    setState(INITIAL)
    setDraft(null)
    void reload(null)
  }, [reload])

  const commit = useCallback(async (
    personas: readonly PersonaView[],
    activeId: string | null,
    notice: string,
    keep: PersonaView | null,
  ) => {
    setState(prev => ({ ...prev, saving: true, error: null, notice: null }))
    try {
      const stored = await savePersonas(props.workspaceId, personas, activeId)
      setState(prev => ({ ...prev, saving: false, personas: stored.personas, activeId: stored.activeId, notice }))
      const next = keep === null
        ? null
        : stored.personas.find(persona => persona.name === keep.name && persona.background === keep.background)
          ?? stored.personas[stored.personas.length - 1]
          ?? null
      setDraft(next === null ? null : { ...next })
    } catch (cause) {
      setState(prev => ({ ...prev, saving: false, error: errorText(cause) }))
    }
  }, [props.workspaceId])

  const onSaveDraft = (): void => {
    if (draft === null) return
    if (draft.name.trim().length === 0) {
      setState(prev => ({ ...prev, error: '玩家人设需要名称' }))
      return
    }
    const creating = draft.id === ''
    const next = creating
      ? [...state.personas, draft]
      : state.personas.map(persona => persona.id === draft.id ? draft : persona)
    void commit(next, state.activeId, creating ? '已新增人设' : '已保存人设', draft)
  }

  const onActivate = (id: string): void => {
    if (state.activeId === id) return
    void commit(state.personas, id, '已切换当前人设', state.personas.find(p => p.id === id) ?? null)
  }

  const onDelete = (id: string): void => {
    const remaining = state.personas.filter(persona => persona.id !== id)
    void commit(remaining, state.activeId === id ? null : state.activeId, '已删除人设', null)
  }

  const selected = draft
  const preview = useMemo(() => (selected === null ? '' : renderPersonaPreview(selected)), [selected])
  const active = state.personas.find(persona => persona.id === state.activeId)

  const listPane = createElement('aside', { className: 'dshtavern-wb-sidebar' },
    createElement('div', { className: 'dshtavern-wb-side-head' },
      createElement('span', { className: 'dshtavern-wb-heading' }, '玩家人设'),
      createElement('span', { className: 'dshtavern-wb-count' }, String(state.personas.length)),
      createElement('button', {
        type: 'button',
        className: 'dshtavern-button dshtavern-button-primary dshtavern-wb-new',
        disabled: state.saving,
        onClick: () => setDraft(blankPersona()),
      }, '新建')),
    createElement('div', { className: 'dshtavern-wb-list' },
      state.loading
        ? createElement('div', { className: 'dshtavern-wb-empty' }, '加载中…')
        : state.personas.length === 0
          ? createElement('div', { className: 'dshtavern-wb-empty' },
            '还没有人设。人设描述你在这个酒馆里是谁，工作区内所有会话共用。')
          : state.personas.map(persona => createElement('button', {
            key: persona.id,
            type: 'button',
            className: 'dshtavern-wb-row',
            'data-selected': selected?.id === persona.id,
            onClick: () => setDraft({ ...persona }),
          },
          createElement('span', { className: 'dshtavern-wb-row-name' }, persona.name),
          createElement('span', { className: 'dshtavern-wb-row-meta' },
            persona.tags.length > 0 ? persona.tags.slice(0, 3).join(' · ') : '无标签'),
          persona.id === state.activeId
            ? createElement('span', { className: 'dshtavern-wb-flag dshtavern-wb-flag-active' }, '当前')
            : null))))

  const editor = selected === null
    ? createElement('div', { className: 'dshtavern-wb-placeholder' },
      createElement('div', { className: 'dshtavern-wb-placeholder-title' }, '玩家人设'),
      createElement('div', null, '选中一个人设开始编辑，或点「新建」创建。'),
      createElement('div', { className: 'dshtavern-wb-hint' },
        active === undefined
          ? '还没有生效的人设，角色会把你当作默认的「普通旅人」。'
          : `当前生效：${active.name}。`))
    : createElement('div', { className: 'dshtavern-wb-editor' },
      createElement('div', { className: 'dshtavern-wb-editor-head' },
        createElement('div', { className: 'dshtavern-wb-editor-title' },
          createElement('div', { className: 'dshtavern-wb-heading' },
            selected.id === '' ? '新建人设' : selected.name || '未命名'),
          createElement('div', { className: 'dshtavern-wb-hint' },
            selected.id === ''
              ? '保存后写入 .dshtavern/persona.json'
              : selected.id === state.activeId ? '当前生效中' : `id ${selected.id.slice(0, 8)}`)),
        createElement('div', { className: 'dshtavern-wb-actions' },
          selected.id === '' || selected.id === state.activeId
            ? null
            : createElement('button', {
              type: 'button',
              className: 'dshtavern-button',
              disabled: state.saving,
              onClick: () => onActivate(selected.id),
            }, '设为预设'),
          createElement('button', {
            type: 'button',
            className: 'dshtavern-button dshtavern-button-primary',
            disabled: state.saving,
            onClick: onSaveDraft,
          }, state.saving ? '保存中…' : '保存'),
          createElement('button', {
            type: 'button',
            className: 'dshtavern-button',
            onClick: () => setDraft(null),
          }, '关闭'),
          selected.id === ''
            ? null
            : createElement('button', {
              type: 'button',
              className: 'dshtavern-button dshtavern-button-danger',
              disabled: state.saving,
              onClick: () => onDelete(selected.id),
            }, '删除'))),
      createElement('div', { className: 'dshtavern-wb-grid' },
        Field({
          label: '名称',
          children: createElement('input', {
            className: 'dshtavern-wb-input',
            value: selected.name,
            placeholder: '角色会这样称呼你',
            onChange: (event: { target: { value: string } }) => update(draft, setDraft, { name: event.target.value }),
          }),
        }),
        Field({
          label: '标签（逗号分隔）',
          children: createElement('input', {
            className: 'dshtavern-wb-input',
            value: selected.tags.join(', '),
            placeholder: '旅人, 剑士',
            onChange: (event: { target: { value: string } }) => update(draft, setDraft, { tags: splitTags(event.target.value) }),
          }),
        })),
      Field({
        label: '外观',
        children: createElement('textarea', {
          className: 'dshtavern-wb-textarea',
          value: selected.description,
          rows: 3,
          placeholder: '年龄、衣着、外貌特征。',
          onChange: (event: { target: { value: string } }) => update(draft, setDraft, { description: event.target.value }),
        }),
      }),
      Field({
        label: '性格',
        children: createElement('textarea', {
          className: 'dshtavern-wb-textarea',
          value: selected.personality,
          rows: 3,
          placeholder: '你待人接物的方式。',
          onChange: (event: { target: { value: string } }) => update(draft, setDraft, { personality: event.target.value }),
        }),
      }),
      Field({
        label: '背景',
        children: createElement('textarea', {
          className: 'dshtavern-wb-textarea',
          value: selected.background,
          rows: 4,
          placeholder: '你从哪里来，为什么在这里。',
          onChange: (event: { target: { value: string } }) => update(draft, setDraft, { background: event.target.value }),
        }),
      }),
      Field({
        label: '说话方式',
        hint: '语气、口癖、称呼习惯。留空则按性格自然发挥。',
        children: createElement('textarea', {
          className: 'dshtavern-wb-textarea',
          value: selected.speakingStyle,
          rows: 3,
          placeholder: '说话简短，习惯用敬语。',
          onChange: (event: { target: { value: string } }) => update(draft, setDraft, { speakingStyle: event.target.value }),
        }),
      }),
      Field({
        label: '角色设定',
        hint: '能力、持有物、身份地位、债务与契约——除了来历之外，所有定义你状态的设定。',
        children: createElement('textarea', {
          className: 'dshtavern-wb-textarea',
          value: selected.characterSheet,
          rows: 6,
          placeholder: '持有：一把旧短剑、半张矿镇地图。\n能力：能在黑暗里辨认方向。\n立场：与守林人有旧约。',
          onChange: (event: { target: { value: string } }) => update(draft, setDraft, { characterSheet: event.target.value }),
        }),
      }),
      createElement('div', { className: 'dshtavern-wb-preview' },
        createElement('div', { className: 'dshtavern-wb-label' }, '进入提示词的内容'),
        createElement('pre', { className: 'dshtavern-preview-system' }, preview)))

  return createElement('section', { className: 'dshtavern-wb-panel' },
    listPane,
    createElement('div', { className: 'dshtavern-wb-main' },
      state.error === null ? null : createElement('div', { className: 'dshtavern-banner-error' }, state.error),
      state.notice === null ? null : createElement('div', { className: 'dshtavern-banner-notice' }, state.notice),
      editor))
}

/** Apply one field patch to the draft. */
function update(
  draft: PersonaView | null,
  setDraft: (next: PersonaView | null) => void,
  patch: Partial<PersonaView>,
): void {
  if (draft === null) return
  setDraft({ ...draft, ...patch })
}

/** Split a comma-separated tag field. */
function splitTags(value: string): string[] {
  return value.split(/[,，]/).map(part => part.trim()).filter(part => part.length > 0)
}
