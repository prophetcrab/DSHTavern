import { createElement, useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactElement } from 'react'
import { downloadDocument, pickTextFile } from './characters.js'
import { activateEntries } from '../worldbook-match.js'
import type { WorldbookEntry } from '../worldbook-match.js'

/** How secondary keys combine with a primary hit. */
export type WorldbookLogic = 'and_any' | 'and_all' | 'not_any' | 'not_all'

/** Where an activated entry is placed. */
export type WorldbookVisibility = 'all' | 'director' | 'characters'

/** Who may read an entry. */

/** One keyed lore entry as served by `/tavern/worldbook`. */
export interface WorldbookEntryView {
  readonly id: string
  readonly name: string
  readonly content: string
  readonly keys: readonly string[]
  readonly secondaryKeys: readonly string[]
  readonly logic: WorldbookLogic
  readonly constant: boolean
  readonly visibility: WorldbookVisibility
  /** Character ids when visibility is `characters`. */
  readonly characterIds: readonly string[]
  readonly order: number
  readonly depth: number
  readonly enabled: boolean
  readonly caseSensitive: boolean
  readonly wholeWords: boolean
}

interface WorkbenchState {
  loading: boolean
  saving: boolean
  error: string | null
  notice: string | null
  entries: readonly WorldbookEntryView[]
  preview: string
}

const INITIAL: WorkbenchState = {
  loading: true,
  saving: false,
  error: null,
  notice: null,
  entries: [],
  preview: '',
}

const LOGIC_LABELS: Record<WorldbookLogic, string> = {
  and_any: '次要词命中任意一个',
  and_all: '次要词全部命中',
  not_any: '次要词一个都不出现',
  not_all: '次要词不全部出现',
}

/** Human-facing label for one visibility. */
const VISIBILITY_LABELS: Record<WorldbookVisibility, string> = {
  all: '所有角色可见',
  director: '仅导演可见',
  characters: '指定角色可见',
}

/** A blank entry for the "new" action. */
function blankEntry(): WorldbookEntryView {
  return {
    id: '',
    name: '',
    content: '',
    keys: [],
    secondaryKeys: [],
    logic: 'and_any',
    constant: false,
    visibility: 'all',
    characterIds: [],
    order: 100,
    depth: 6,
    enabled: true,
    caseSensitive: false,
    wholeWords: false,
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

/**
 * Load the character cards a visibility picker can offer.
 * @param workspaceId - tavern workspace id.
 * @returns card ids and names; empty when the workspace has none.
 */
async function loadCharacters(workspaceId: string): Promise<{ id: string; name: string }[]> {
  const response = await fetch(`/tavern/characters?workspaceId=${encodeURIComponent(workspaceId)}`, {
    headers: { accept: 'application/json' },
    cache: 'no-store',
  })
  const body = await readJson(response)
  if (!Array.isArray(body.cards)) return []
  return (body.cards as { id?: unknown; name?: unknown }[])
    .filter(card => typeof card.id === 'string' && typeof card.name === 'string')
    .map(card => ({ id: card.id as string, name: card.name as string }))
}

async function loadWorldbook(workspaceId: string): Promise<WorldbookEntryView[]> {
  const response = await fetch(`/tavern/worldbook?workspaceId=${encodeURIComponent(workspaceId)}`, {
    headers: { accept: 'application/json' },
    cache: 'no-store',
  })
  const body = await readJson(response)
  return Array.isArray(body.entries) ? body.entries as WorldbookEntryView[] : []
}

async function saveWorldbook(
  workspaceId: string,
  entries: readonly WorldbookEntryView[],
): Promise<WorldbookEntryView[]> {
  const response = await fetch('/tavern/worldbook', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ workspaceId, entries }),
  })
  const body = await readJson(response)
  return Array.isArray(body.entries) ? body.entries as WorldbookEntryView[] : []
}

/**
 * Ask the host for the workspace worldbook as a `.world` document.
 * @param workspaceId - tavern workspace id.
 * @returns the suggested file name and document text.
 */
export async function exportWorldbook(workspaceId: string): Promise<{ file: string; text: string }> {
  const response = await fetch(`/tavern/worldbook/transfer?workspaceId=${encodeURIComponent(workspaceId)}`, {
    headers: { accept: 'application/json' },
    cache: 'no-store',
  })
  const body = await readJson(response)
  return { file: String(body.file), text: String(body.text) }
}

/**
 * Replace the workspace worldbook from a `.world` document.
 * @param workspaceId - tavern workspace id.
 * @param text - document text.
 * @returns the stored entries.
 */
export async function importWorldbook(workspaceId: string, text: string): Promise<WorldbookEntryView[]> {
  const response = await fetch('/tavern/worldbook/transfer', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ workspaceId, text }),
  })
  const body = await readJson(response)
  return Array.isArray(body.entries) ? body.entries as WorldbookEntryView[] : []
}

/**
 * Decide which entries a sample line would activate.
 *
 * Runs the shared matching engine with an empty stage, so the panel reports
 * exactly the activation the host would compute for that line.
 * @param entries - stored entries.
 * @param sample - text to scan.
 * @returns activated entries in injection order.
 */
export function previewActivation(
  entries: readonly WorldbookEntryView[],
  sample: string,
): WorldbookEntryView[] {
  // The preview answers "would this entry activate at all", so it runs the
  // matching rules only; visibility is reported separately by the group the
  // entry sits in. Reading it as a director keeps every entry eligible.
  const lore = activateEntries({
    entries,
    scanText: sample,
    recentLines: [],
    reader: { kind: 'director' },
  })
  const ids = new Set(lore.map(entry => entry.id))
  return entries.filter(entry => ids.has(entry.id))
}

/** One labelled field row. */
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

/** One labelled checkbox. */
function Toggle(props: {
  label: string
  checked: boolean
  onChange: (value: boolean) => void
}): ReactElement {
  return createElement('label', { className: 'dshtavern-wb-toggle' },
    createElement('input', {
      type: 'checkbox',
      checked: props.checked,
      onChange: (event: { target: { checked: boolean } }) => props.onChange(event.target.checked),
    }),
    props.label)
}

/** Split a comma-separated keyword field. */
function splitKeys(value: string): string[] {
  return value.split(/[,，]/).map(part => part.trim()).filter(part => part.length > 0)
}

/** Props of the worldbook workbench. */
export interface WorldbookWorkbenchProps {
  readonly workspaceId: string
  readonly workspaceTitle: string
  readonly workspacePath: string
}

/**
 * Two-pane worldbook editor: the entry list on the left, the selected entry on
 * the right, with an activation preview under the form.
 * @param props - the workspace this workbench edits.
 * @returns the workbench section.
 */
export function WorldbookWorkbench(props: WorldbookWorkbenchProps): ReactElement {
  const [state, setState] = useState<WorkbenchState>(INITIAL)
  // Character cards the "visible to these characters" picker offers.
  const [characters, setCharacters] = useState<readonly { id: string; name: string }[]>([])
  const [draft, setDraft] = useState<WorldbookEntryView | null>(null)

  const reload = useCallback(async (notice: string | null = null) => {
    try {
      const entries = await loadWorldbook(props.workspaceId)
      setState(prev => ({ ...prev, loading: false, saving: false, error: null, notice, entries }))
    } catch (cause) {
      setState(prev => ({ ...prev, loading: false, saving: false, error: errorText(cause) }))
    }
  }, [props.workspaceId])

  useEffect(() => {
    setState(INITIAL)
    setDraft(null)
    void loadCharacters(props.workspaceId).then(setCharacters).catch(() => setCharacters([]))
    void reload(null)
  }, [reload, props.workspaceId])

  const commit = useCallback(async (
    entries: readonly WorldbookEntryView[],
    notice: string,
    keep: WorldbookEntryView | null,
  ) => {
    setState(prev => ({ ...prev, saving: true, error: null, notice: null }))
    try {
      const stored = await saveWorldbook(props.workspaceId, entries)
      const next = keep === null
        ? null
        : stored.find(entry => entry.name === keep.name && entry.content === keep.content)
          ?? stored[stored.length - 1]
          ?? null
      setState(prev => ({ ...prev, saving: false, entries: stored, notice }))
      setDraft(next === null ? null : { ...next })
    } catch (cause) {
      setState(prev => ({ ...prev, saving: false, error: errorText(cause) }))
    }
  }, [props.workspaceId])

  const onSaveDraft = (): void => {
    if (draft === null) return
    if (draft.name.trim().length === 0) {
      setState(prev => ({ ...prev, error: '世界书条目需要名称' }))
      return
    }
    const creating = draft.id === ''
    const next = creating
      ? [...state.entries, draft]
      : state.entries.map(entry => entry.id === draft.id ? draft : entry)
    void commit(next, creating ? '已新增条目' : '已保存条目', draft)
  }

  const onDelete = (id: string): void => {
    void commit(state.entries.filter(entry => entry.id !== id), '已删除条目', null)
  }

  const onImport = useCallback(async () => {
    setState(prev => ({ ...prev, error: null, notice: null }))
    let picked: { name: string; text: string } | undefined
    try {
      picked = await pickTextFile('.world,application/json')
    } catch (cause) {
      setState(prev => ({ ...prev, error: errorText(cause) }))
      return
    }
    if (picked === undefined) return
    setState(prev => ({ ...prev, saving: true }))
    try {
      const entries = await importWorldbook(props.workspaceId, picked.text)
      setState(prev => ({ ...prev, saving: false, entries, notice: `已导入 ${entries.length} 条世界书条目`, error: null }))
      setDraft(null)
    } catch (cause) {
      setState(prev => ({ ...prev, saving: false, error: errorText(cause) }))
    }
  }, [props.workspaceId])

  const onExport = useCallback(async () => {
    setState(prev => ({ ...prev, error: null, notice: null }))
    try {
      downloadDocument(await exportWorldbook(props.workspaceId))
      setState(prev => ({ ...prev, notice: '已导出世界书' }))
    } catch (cause) {
      setState(prev => ({ ...prev, error: errorText(cause) }))
    }
  }, [props.workspaceId])

  const previewHits = useMemo(
    () => (state.preview.trim().length === 0 ? [] : previewActivation(state.entries, state.preview)),
    [state.entries, state.preview],
  )

  const selected = draft

  const listPane = createElement('aside', { className: 'dshtavern-wb-sidebar' },
    createElement('div', { className: 'dshtavern-wb-side-head' },
      createElement('div', { className: 'dshtavern-wb-side-title' },
        createElement('span', { className: 'dshtavern-wb-heading' }, '世界书'),
        createElement('span', { className: 'dshtavern-wb-count' }, String(state.entries.length))),
      createElement('div', { className: 'dshtavern-wb-side-actions' },
        createElement('button', {
          type: 'button',
          className: 'dshtavern-button dshtavern-wb-new',
          disabled: state.saving,
          title: '从 .world 文件导入（替换当前世界书）',
          onClick: () => { void onImport() },
        }, '导入'),
        createElement('button', {
          type: 'button',
          className: 'dshtavern-button dshtavern-wb-new',
          disabled: state.saving || state.entries.length === 0,
          title: '导出为 .world 文件',
          onClick: () => { void onExport() },
        }, '导出'),
        createElement('button', {
          type: 'button',
          className: 'dshtavern-button dshtavern-button-primary dshtavern-wb-new',
          disabled: state.saving,
          onClick: () => setDraft(blankEntry()),
        }, '新建'))),
    createElement('div', { className: 'dshtavern-wb-list' },
      state.loading
        ? createElement('div', { className: 'dshtavern-wb-empty' }, '加载中…')
        : state.entries.length === 0
          ? createElement('div', { className: 'dshtavern-wb-empty' },
            '还没有条目。世界书条目按关键词触发，工作区内所有角色共享。')
          : (['all', 'characters', 'director'] as WorldbookVisibility[]).map(visibility => {
            const group = state.entries.filter(entry => entry.visibility === visibility)
            if (group.length === 0) return null
            return createElement('div', { key: visibility, className: 'dshtavern-wb-group' },
              createElement('div', { className: 'dshtavern-wb-group-head' },
                createElement('span', { className: 'dshtavern-wb-group-title' }, VISIBILITY_LABELS[visibility]),
                createElement('span', { className: 'dshtavern-wb-group-count' }, String(group.length))),
              group.map(entry => createElement('button', {
                key: entry.id,
                type: 'button',
                className: 'dshtavern-wb-row',
                'data-selected': selected?.id === entry.id,
                'data-disabled': entry.enabled ? undefined : 'true',
                onClick: () => setDraft({ ...entry }),
              },
              createElement('span', { className: 'dshtavern-wb-row-name' }, entry.name),
              createElement('span', { className: 'dshtavern-wb-row-meta' },
                entry.constant ? '常驻' : entry.keys.slice(0, 3).join(' / ') || '无关键词'),
              entry.enabled
                ? null
                : createElement('span', { className: 'dshtavern-wb-flag' }, '已停用'))))
          })))

  const previewPane = createElement('div', { className: 'dshtavern-wb-preview' },
    createElement('div', { className: 'dshtavern-wb-label' }, '触发预览'),
    createElement('input', {
      className: 'dshtavern-wb-input',
      value: state.preview,
      placeholder: '输入一句台词，看看哪些条目会被激活',
      onChange: (event: { target: { value: string } }) =>
        setState(prev => ({ ...prev, preview: event.target.value })),
    }),
    state.preview.trim().length === 0
      ? createElement('div', { className: 'dshtavern-wb-hint' }, '输入后这里列出会进入提示词的条目。')
      : previewHits.length === 0
        ? createElement('div', { className: 'dshtavern-wb-hint' }, '没有条目会被激活。')
        : createElement('div', { className: 'dshtavern-wb-hits' },
          previewHits.map(entry => createElement('div', { key: entry.id, className: 'dshtavern-wb-hit' },
            createElement('span', null, entry.name),
            createElement('span', { className: 'dshtavern-wb-hit-meta' },
              VISIBILITY_LABELS[entry.visibility])))))

  const editor = selected === null
    ? createElement('div', { className: 'dshtavern-wb-placeholder' },
      createElement('div', { className: 'dshtavern-wb-placeholder-title' }, '世界书'),
      createElement('div', null, '选中一条条目开始编辑，或点「新建」创建。'),
      createElement('div', { className: 'dshtavern-wb-hint' },
        '条目只在关键词出现时才进入提示词，所以同一段设定不必在每张角色卡里重复。'))
    : createElement('div', { className: 'dshtavern-wb-editor' },
      createElement('div', { className: 'dshtavern-wb-editor-head' },
        createElement('div', { className: 'dshtavern-wb-editor-title' },
          createElement('div', { className: 'dshtavern-wb-heading' },
            selected.id === '' ? '新建条目' : selected.name || '未命名'),
          createElement('div', { className: 'dshtavern-wb-hint' },
            selected.id === ''
              ? '保存后写入 .dshtavern/worldbook.json'
              : `id ${selected.id.slice(0, 8)}`)),
        createElement('div', { className: 'dshtavern-wb-actions' },
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
            placeholder: '例如：星屑回廊',
            onChange: (event: { target: { value: string } }) => update(draft, setDraft, { name: event.target.value }),
          }),
        }),
        Field({
          label: '可见性',
          hint: '谁能在提示词里读到这条设定。导演始终能读到全部。',
          children: createElement('select', {
            className: 'dshtavern-wb-input',
            value: selected.visibility,
            onChange: (event: { target: { value: string } }) =>
              update(draft, setDraft, { visibility: event.target.value as WorldbookVisibility }),
          }, (Object.keys(VISIBILITY_LABELS) as WorldbookVisibility[]).map(key =>
            createElement('option', { key, value: key }, VISIBILITY_LABELS[key]))),
        })),
      selected.visibility === 'characters'
        ? Field({
          label: '可见的角色',
          hint: characters.length === 0
            ? '这个酒馆还没有角色卡。'
            : '只有选中的角色会在自己的提示词里读到这条。',
          children: createElement('div', { className: 'dshtavern-wb-chars' },
            characters.length === 0
              ? createElement('span', { className: 'dshtavern-wb-hint' }, '（暂无角色卡）')
              : characters.map(character => createElement('label', {
                key: character.id,
                className: 'dshtavern-wb-toggle',
              },
              createElement('input', {
                type: 'checkbox',
                checked: selected.characterIds.includes(character.id),
                onChange: (event: { target: { checked: boolean } }) =>
                  update(draft, setDraft, {
                    characterIds: event.target.checked
                      ? [...selected.characterIds, character.id]
                      : selected.characterIds.filter(id => id !== character.id),
                  }),
              }),
              character.name))),
        })
        : null,
      Field({
        label: '关键词（任意一个出现即触发）',
        hint: '逗号分隔。留空且未开常驻时，这条永远不会触发。',
        children: createElement('input', {
          className: 'dshtavern-wb-input',
          value: selected.keys.join(', '),
          placeholder: '星屑回廊, 回廊, 法阵',
          onChange: (event: { target: { value: string } }) => update(draft, setDraft, { keys: splitKeys(event.target.value) }),
        }),
      }),
      createElement('div', { className: 'dshtavern-wb-grid' },
        Field({
          label: '次要关键词',
          hint: '用来收窄主要关键词的命中范围。',
          children: createElement('input', {
            className: 'dshtavern-wb-input',
            value: selected.secondaryKeys.join(', '),
            onChange: (event: { target: { value: string } }) =>
              update(draft, setDraft, { secondaryKeys: splitKeys(event.target.value) }),
          }),
        }),
        Field({
          label: '次要词逻辑',
          children: createElement('select', {
            className: 'dshtavern-wb-input',
            value: selected.logic,
            disabled: selected.secondaryKeys.length === 0,
            onChange: (event: { target: { value: string } }) =>
              update(draft, setDraft, { logic: event.target.value as WorldbookLogic }),
          }, (Object.keys(LOGIC_LABELS) as WorldbookLogic[]).map(key =>
            createElement('option', { key, value: key }, LOGIC_LABELS[key]))),
        })),
      Field({
        label: '内容',
        children: createElement('textarea', {
          className: 'dshtavern-wb-textarea',
          value: selected.content,
          rows: 6,
          placeholder: '触发时注入提示词的世界设定文本。',
          onChange: (event: { target: { value: string } }) => update(draft, setDraft, { content: event.target.value }),
        }),
      }),
      createElement('div', { className: 'dshtavern-wb-grid' },
        Field({
          label: '顺序',
          hint: '数字小的先注入，也先占用预算。',
          children: createElement('input', {
            className: 'dshtavern-wb-input',
            type: 'number',
            value: String(selected.order),
            onChange: (event: { target: { value: string } }) =>
              update(draft, setDraft, { order: Number(event.target.value) || 0 }),
          }),
        }),
        Field({
          label: '扫描深度',
          hint: '回溯最近几行舞台；0 表示整个窗口。',
          children: createElement('input', {
            className: 'dshtavern-wb-input',
            type: 'number',
            value: String(selected.depth),
            onChange: (event: { target: { value: string } }) =>
              update(draft, setDraft, { depth: Number(event.target.value) || 0 }),
          }),
        })),
      createElement('div', { className: 'dshtavern-wb-toggles' },
        Toggle({
          label: '启用',
          checked: selected.enabled,
          onChange: value => update(draft, setDraft, { enabled: value }),
        }),
        Toggle({
          label: '常驻（忽略关键词）',
          checked: selected.constant,
          onChange: value => update(draft, setDraft, { constant: value }),
        }),
        Toggle({
          label: '区分大小写',
          checked: selected.caseSensitive,
          onChange: value => update(draft, setDraft, { caseSensitive: value }),
        }),
        Toggle({
          label: '整词匹配',
          checked: selected.wholeWords,
          onChange: value => update(draft, setDraft, { wholeWords: value }),
        })),
      previewPane)

  return createElement('section', { className: 'dshtavern-wb-panel' },
    listPane,
    createElement('div', { className: 'dshtavern-wb-main' },
      state.error === null ? null : createElement('div', { className: 'dshtavern-banner-error' }, state.error),
      state.notice === null ? null : createElement('div', { className: 'dshtavern-banner-notice' }, state.notice),
      editor))
}

/** Apply one field patch to the draft. */
function update(
  draft: WorldbookEntryView | null,
  setDraft: (next: WorldbookEntryView | null) => void,
  patch: Partial<WorldbookEntryView>,
): void {
  if (draft === null) return
  setDraft({ ...draft, ...patch })
}
