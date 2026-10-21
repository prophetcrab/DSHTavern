/**
 * Character-card tool: left list of every `.charc` card in the current tavern
 * workspace, right pane for creating/editing the selected one.
 */
import { createElement, useCallback, useEffect, useState } from 'react'
import type { ReactElement } from 'react'

/** One character card as served by `/tavern/characters`. */
export interface CharacterCardView {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly personality: string
  readonly scenario: string
  readonly systemPrompt: string
  readonly exampleDialogues: string
  readonly greetings: { first: string; alternates: readonly string[] }
  readonly tags: readonly string[]
  readonly entries: readonly unknown[]
  readonly createdAt: string
  readonly updatedAt: string
}

/** One unreadable `.charc` file. */
export interface CharacterCardProblem {
  readonly file: string
  readonly error: string
}

interface CharacterState {
  loading: boolean
  saving: boolean
  error: string | null
  notice: string | null
  cards: readonly CharacterCardView[]
  problems: readonly CharacterCardProblem[]
}

const INITIAL: CharacterState = {
  loading: true,
  saving: false,
  error: null,
  notice: null,
  cards: [],
  problems: [],
}

/** Editable copy of one card. */
interface CharacterDraft {
  readonly id: string | null
  readonly name: string
  readonly description: string
  readonly personality: string
  readonly scenario: string
  readonly systemPrompt: string
  readonly exampleDialogues: string
  readonly greeting: string
  readonly tags: string
  readonly updatedAt: string
}

const NEW_DRAFT: CharacterDraft = {
  id: null,
  name: '',
  description: '',
  personality: '',
  scenario: '',
  systemPrompt: '',
  exampleDialogues: '',
  greeting: '',
  tags: '',
  updatedAt: '',
}

function errorText(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  const body = await response.json() as Record<string, unknown>
  if (!response.ok || body.ok !== true) {
    throw new Error(typeof body.error === 'string' ? body.error : `HTTP ${response.status}`)
  }
  return body
}

async function loadCards(workspaceId: string): Promise<{ cards: CharacterCardView[]; problems: CharacterCardProblem[] }> {
  const response = await fetch(`/tavern/characters?workspaceId=${encodeURIComponent(workspaceId)}`, {
    headers: { accept: 'application/json' },
  })
  const body = await readJson(response)
  return {
    cards: Array.isArray(body.cards) ? body.cards as CharacterCardView[] : [],
    problems: Array.isArray(body.problems) ? body.problems as CharacterCardProblem[] : [],
  }
}

async function writeCard(
  workspaceId: string,
  action: 'create' | 'save',
  id: string | null,
  draft: CharacterDraft,
): Promise<CharacterCardView> {
  const response = await fetch('/tavern/characters', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      workspaceId,
      action,
      ...(id === null ? {} : { id }),
      card: {
        name: draft.name,
        description: draft.description,
        personality: draft.personality,
        scenario: draft.scenario,
        systemPrompt: draft.systemPrompt,
        exampleDialogues: draft.exampleDialogues,
        greetings: { first: draft.greeting, alternates: [] },
        tags: draft.tags.split(',').map(tag => tag.trim()).filter(Boolean),
        entries: [],
      },
    }),
  })
  const body = await readJson(response)
  if (typeof body.card !== 'object' || body.card === null) throw new Error('服务端没有返回角色卡')
  return body.card as CharacterCardView
}

async function removeCard(workspaceId: string, id: string): Promise<void> {
  const response = await fetch('/tavern/characters', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ workspaceId, action: 'delete', id }),
  })
  await readJson(response)
}

function draftOf(card: CharacterCardView): CharacterDraft {
  return {
    id: card.id,
    name: card.name,
    description: card.description,
    personality: card.personality,
    scenario: card.scenario,
    systemPrompt: card.systemPrompt,
    exampleDialogues: card.exampleDialogues,
    greeting: card.greetings.first,
    tags: card.tags.join(', '),
    updatedAt: card.updatedAt,
  }
}

function Field(props: {
  label: string
  value: string
  placeholder?: string
  multiline?: boolean
  onChange: (value: string) => void
}): ReactElement {
  return createElement('label', { className: 'dshtavern-character-field' },
    createElement('span', { className: 'dshtavern-character-label' }, props.label),
    props.multiline === true
      ? createElement('textarea', {
        className: 'dshtavern-character-textarea',
        value: props.value,
        placeholder: props.placeholder ?? '',
        rows: 3,
        onChange: (event: { target: { value: string } }) => props.onChange(event.target.value),
      })
      : createElement('input', {
        className: 'dshtavern-character-input',
        value: props.value,
        placeholder: props.placeholder ?? '',
        onChange: (event: { target: { value: string } }) => props.onChange(event.target.value),
      }))
}

/** Props of the character tool. */
export interface CharacterCardToolProps {
  readonly workspaceId: string
  readonly workspaceTitle: string
  readonly workspacePath: string
}

/** Two-pane character-card tool. */
export function CharacterCardTool(props: CharacterCardToolProps): ReactElement {
  const [state, setState] = useState<CharacterState>(INITIAL)
  const [draft, setDraft] = useState<CharacterDraft | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const reload = useCallback(async (notice: string | null = null) => {
    try {
      const { cards, problems } = await loadCards(props.workspaceId)
      setState({ loading: false, saving: false, error: null, notice, cards, problems })
    } catch (cause) {
      setState(prev => ({ ...prev, loading: false, saving: false, error: errorText(cause), notice: null }))
    }
  }, [props.workspaceId])

  useEffect(() => {
    setState(INITIAL)
    void reload()
  }, [reload])

  const save = useCallback(async (current: CharacterDraft) => {
    if (current.name.trim().length === 0) {
      setState(prev => ({ ...prev, error: '角色卡需要名称' }))
      return
    }
    setState(prev => ({ ...prev, saving: true, error: null, notice: null }))
    try {
      const saved = await writeCard(props.workspaceId, current.id === null ? 'create' : 'save', current.id, current)
      setDraft(draftOf(saved))
      setConfirmDelete(null)
      await reload('已保存角色卡')
    } catch (cause) {
      setState(prev => ({ ...prev, saving: false, error: errorText(cause) }))
    }
  }, [props.workspaceId, reload])

  const remove = useCallback(async (id: string) => {
    if (confirmDelete !== id) {
      setConfirmDelete(id)
      return
    }
    setState(prev => ({ ...prev, saving: true, error: null, notice: null }))
    try {
      await removeCard(props.workspaceId, id)
      setConfirmDelete(null)
      setDraft(null)
      await reload('已删除角色卡')
    } catch (cause) {
      setState(prev => ({ ...prev, saving: false, error: errorText(cause) }))
    }
  }, [confirmDelete, props.workspaceId, reload])

  const update = (patch: Partial<CharacterDraft>): void => {
    setDraft(current => current === null ? null : { ...current, ...patch })
  }

  const selectedId = draft?.id ?? null
  const editorEnabled = draft !== null && !state.saving && draft.name.trim().length > 0

  return createElement('section', { className: 'dshtavern-character-panel' },
    createElement('aside', { className: 'dshtavern-character-sidebar' },
      createElement('div', { className: 'dshtavern-character-side-head' },
        createElement('span', { className: 'dshtavern-character-heading' }, '角色卡'),
        createElement('span', { className: 'dshtavern-character-count' }, String(state.cards.length)),
        createElement('button', {
          type: 'button',
          className: 'dshtavern-button dshtavern-button-primary dshtavern-character-new',
          onClick: () => { setDraft(NEW_DRAFT); setConfirmDelete(null) },
        }, '新建')),
      createElement('div', { className: 'dshtavern-character-list' },
        state.loading
          ? createElement('div', { className: 'dshtavern-character-empty' }, '加载中…')
          : state.cards.length === 0
            ? createElement('div', { className: 'dshtavern-character-empty' },
              '还没有角色卡。点「新建」创建第一张。')
            : state.cards.map(card => createElement('button', {
              key: card.id,
              type: 'button',
              className: 'dshtavern-character-row',
              'data-selected': selectedId === card.id,
              onClick: () => { setDraft(draftOf(card)); setConfirmDelete(null) },
            },
            createElement('span', { className: 'dshtavern-character-avatar', 'aria-hidden': true },
              card.name.slice(0, 1)),
            createElement('span', { className: 'dshtavern-character-row-main' },
              createElement('span', { className: 'dshtavern-character-name' }, card.name),
              createElement('span', { className: 'dshtavern-character-meta' },
                `${card.tags.join(' · ') || '无标签'} · ${card.updatedAt.replace('T', ' ').slice(0, 16)}`))))),
      state.problems.length === 0
        ? null
        : createElement('div', { className: 'dshtavern-character-problems' },
          createElement('div', { className: 'dshtavern-character-label' }, '无法读取的文件'),
          state.problems.map(problem => createElement('div', {
            key: problem.file,
            className: 'dshtavern-character-meta',
            title: problem.error,
          }, problem.file)))),
    createElement('div', { className: 'dshtavern-character-main' },
      state.error === null ? null : createElement('div', { className: 'dshtavern-banner-error' }, state.error),
      state.notice === null ? null : createElement('div', { className: 'dshtavern-banner-notice' }, state.notice),
      draft === null
        ? createElement('div', { className: 'dshtavern-character-placeholder' },
          createElement('div', { className: 'dshtavern-character-placeholder-glyph', 'aria-hidden': true }, '卡'),
          createElement('div', { className: 'dshtavern-character-placeholder-title' }, '还没有选中角色'),
          createElement('div', null, '从左侧选择一个角色卡，或点「新建」开始。'),
          createElement('div', { className: 'dshtavern-character-hint-path' },
            'characters/<id>.charc'),
          createElement('div', { className: 'dshtavern-character-meta', title: props.workspacePath },
            `保存在当前酒馆工作区（${props.workspaceTitle}）内`))
        : createElement('div', { className: 'dshtavern-character-editor' },
          createElement('div', { className: 'dshtavern-character-editor-head' },
            createElement('span', { className: 'dshtavern-character-editor-avatar', 'aria-hidden': true },
              draft.name.trim().slice(0, 1) || '?'),
            createElement('div', { className: 'dshtavern-character-editor-title' },
              createElement('div', { className: 'dshtavern-character-heading' },
                draft.id === null ? '新建角色卡' : draft.name || '未命名'),
              createElement('div', { className: 'dshtavern-character-meta' },
                draft.id === null
                  ? '保存后写入 characters/<id>.charc'
                  : `${draft.tags || '无标签'} · 更新 ${draft.updatedAt.replace('T', ' ').slice(0, 16)}`)),
            createElement('div', { className: 'dshtavern-character-actions' },
              createElement('button', {
                type: 'button',
                className: 'dshtavern-button dshtavern-button-primary',
                disabled: !editorEnabled,
                onClick: () => { void save(draft) },
              }, state.saving ? '保存中…' : '保存'),
              createElement('button', {
                type: 'button',
                className: 'dshtavern-button',
                onClick: () => { setDraft(null); setConfirmDelete(null) },
              }, '关闭'),
              draft.id === null
                ? null
                : createElement('button', {
                  type: 'button',
                  className: 'dshtavern-button dshtavern-button-danger',
                  disabled: state.saving,
                  onClick: () => { void remove(draft.id!) },
                }, confirmDelete === draft.id ? '确认删除' : '删除'))),
          createElement('div', { className: 'dshtavern-character-form' },
            createElement('div', { className: 'dshtavern-character-group' },
              createElement('div', { className: 'dshtavern-character-group-title' }, '基础'),
              createElement('div', { className: 'dshtavern-character-grid' },
                createElement(Field, {
                  label: '名称',
                  value: draft.name,
                  placeholder: '角色名',
                  onChange: value => update({ name: value }),
                }),
                createElement(Field, {
                  label: '标签（逗号分隔）',
                  value: draft.tags,
                  placeholder: '原创, 奇幻',
                  onChange: value => update({ tags: value }),
                }))),
            createElement('div', { className: 'dshtavern-character-group' },
              createElement('div', { className: 'dshtavern-character-group-title' }, '角色设定'),
              createElement(Field, {
                label: '描述',
                value: draft.description,
                multiline: true,
                placeholder: '外貌、身份、背景',
                onChange: value => update({ description: value }),
              }),
              createElement(Field, {
                label: '性格',
                value: draft.personality,
                multiline: true,
                onChange: value => update({ personality: value }),
              }),
              createElement(Field, {
                label: '场景',
                value: draft.scenario,
                multiline: true,
                onChange: value => update({ scenario: value }),
              })),
            createElement('div', { className: 'dshtavern-character-group' },
              createElement('div', { className: 'dshtavern-character-group-title' }, '对话与提示'),
              createElement(Field, {
                label: '系统提示词（可选）',
                value: draft.systemPrompt,
                multiline: true,
                onChange: value => update({ systemPrompt: value }),
              }),
              createElement(Field, {
                label: '示例对话',
                value: draft.exampleDialogues,
                multiline: true,
                placeholder: '<START>\n{{user}}: …\n{{char}}: …',
                onChange: value => update({ exampleDialogues: value }),
              }),
              createElement(Field, {
                label: '开场白',
                value: draft.greeting,
                multiline: true,
                onChange: value => update({ greeting: value }),
              }))))));
}
