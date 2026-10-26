/**
 * Tavern image workspace: the toolbox panel, the prompt workshop, and the
 * character-portrait section.
 *
 * The host owns every model and provider call. This module only edits prompts,
 * asks for a one-time approval, and renders the returned files. Generation is
 * always a direct result of the player clicking "生成图片"; nothing here polls a
 * beat or runs on its own.
 */
import { createElement, useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import type { ReactElement } from 'react'
import { CLASS } from './styles.js'
import { SubTabPane, SubTabs } from './sub-tabs.js'

/** Aspect ratios the host understands. */
export type ImageAspect = '1:1' | '3:2' | '2:3' | '16:9'

/** Style preset ids. */
export type ImageStyleId = 'anime' | 'cinematic' | 'painterly' | 'dark-fantasy' | 'custom'

/** Provider capabilities as returned by the host. */
export interface ImageCapabilities {
  readonly negative: boolean
  readonly seed: boolean
  readonly aspects: readonly ImageAspect[]
  readonly referenceImages: boolean
  readonly async: boolean
  readonly maxCount: number
  readonly promptMaxChars?: number
}

/** One provider descriptor. */
export interface ImageProviderView {
  readonly id: string
  readonly label: string
  readonly capabilities: ImageCapabilities
}

/** One prompt preset. */
export interface ImagePresetView {
  readonly aspect: ImageAspect
  readonly style: ImageStyleId
  readonly customStyle: string
  readonly template: string
  readonly negative: string
}

/** Provider config blocks. */
export interface ImageConfigData {
  readonly schema: number
  readonly enabled: boolean
  readonly provider: string
  readonly providers: {
    readonly 'openai-images': { readonly baseUrl: string; readonly model: string; readonly quality: string }
    readonly jimeng: {
      readonly endpoint: string
      readonly region: string
      readonly reqKey: string
      readonly promptExpansion: boolean
    }
  }
  readonly refineModel?: { readonly provider: string; readonly model: string; readonly reasoningEffort?: string } | null
  readonly scene: ImagePresetView
  readonly portrait: ImagePresetView
  readonly timeoutMs: number
  readonly maxImageBytes: number
}

/** One credential field's presence. */
export interface CredentialFieldView {
  readonly key: string
  readonly label: string
  readonly configured: boolean
  readonly source?: string
}

/** One provider's credential status. */
export interface CredentialStatusView {
  readonly provider: string
  readonly configured: boolean
  readonly fields: readonly CredentialFieldView[]
}

/** The panel config response. */
export interface ImageConfigResponse {
  readonly schema: number
  readonly workspaceId: string
  readonly workspaceTitle: string
  readonly workspacePath: string
  readonly config: ImageConfigData
  readonly defaults: ImageConfigData
  readonly provider: string
  readonly providerLabel: string
  readonly capabilities: ImageCapabilities
  readonly providers: readonly ImageProviderView[]
  readonly credential: CredentialStatusView
  readonly configured: boolean
  readonly refineAvailable: boolean
  readonly approvalTtlMs: number
  readonly sessionModel?: { readonly provider: string; readonly model: string }
}

/** Scene preview. */
export interface ScenePreviewResponse {
  readonly mode: 'scene'
  readonly turn: number
  readonly scene: string
  readonly characters: readonly { readonly id: string; readonly name: string; readonly appearance: string }[]
  readonly draft: string
  readonly negative: string
  readonly aspect: ImageAspect
  readonly style: ImageStyleId
  readonly preset: ImagePresetView
  readonly provider: string
  readonly providerLabel: string
  readonly capabilities: ImageCapabilities
  readonly configured: boolean
  readonly enabled: boolean
  readonly approvalTtlMs: number
}

/** Portrait preview. */
export interface PortraitPreviewResponse {
  readonly mode: 'portrait'
  readonly cardId: string
  readonly cardName: string
  readonly appearance: string
  readonly personality: string
  readonly scenario: string
  readonly draft: string
  readonly negative: string
  readonly aspect: ImageAspect
  readonly style: ImageStyleId
  readonly preset: ImagePresetView
  readonly provider: string
  readonly providerLabel: string
  readonly capabilities: ImageCapabilities
  readonly configured: boolean
  readonly enabled: boolean
  readonly approvalTtlMs: number
}

/** Refinement response. */
export interface RefineResponse {
  readonly prompt: string
  readonly negative?: string
  readonly model: string
  readonly parsed: boolean
}

/** Approval response. */
export interface ApproveResponse {
  readonly approvalId: string
  readonly expiresAt: string
}

/** Scene image metadata. */
export interface SceneImageView {
  readonly id: string
  readonly turn: number
  readonly mime: string
  readonly draftPrompt: string
  readonly refinedPrompt?: string
  readonly finalPrompt: string
  readonly provider: string
  readonly model: string
  readonly seed?: number
  readonly aspect: string
  readonly style: string
  readonly refineModel?: string
  readonly approvedAt: string
  readonly createdAt: string
}

/** Portrait metadata. */
export interface PortraitView {
  readonly id: string
  readonly cardId: string
  readonly mime: string
  readonly draftPrompt: string
  readonly refinedPrompt?: string
  readonly finalPrompt: string
  readonly provider: string
  readonly model: string
  readonly seed?: number
  readonly aspect: string
  readonly style: string
  readonly refineModel?: string
  readonly approvedAt: string
  readonly createdAt: string
}

/** Scene list response. */
export interface SceneListResponse {
  readonly images: readonly SceneImageView[]
}

/** Portrait list response. */
export interface PortraitListResponse {
  readonly cardId: string
  readonly index: { readonly activeId?: string; readonly items: readonly PortraitView[] }
  readonly active?: PortraitView
}

/** Image generation response. */
export interface GenerateResponse {
  readonly image: SceneImageView | PortraitView
}

/** One response envelope with `ok`. */
interface Envelope {
  readonly ok?: unknown
  readonly error?: unknown
}

async function readJson<T>(response: Response): Promise<T> {
  let body: Envelope
  try {
    body = await response.json() as Envelope
  } catch {
    throw new Error(`生图接口返回了非 JSON 响应（HTTP ${response.status}）`)
  }
  if (body.ok !== true) {
    throw new Error(typeof body.error === 'string' ? body.error : `生图请求失败（HTTP ${response.status}）`)
  }
  return body as T
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(path, { headers: { accept: 'application/json' }, cache: 'no-store' })
  return readJson<T>(response)
}

async function postJson<T>(path: string, body: unknown, method: 'POST' | 'DELETE' = 'POST'): Promise<T> {
  const response = await fetch(path, {
    method,
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(body),
  })
  return readJson<T>(response)
}

/** Availability of the sub-plugin row. */
export type ImageAvailability = 'unknown' | 'on' | 'off'

let availability: ImageAvailability = 'unknown'
let availabilityRequest: Promise<ImageAvailability> | null = null
const availabilityListeners = new Set<() => void>()

function notifyAvailability(): void {
  for (const listener of availabilityListeners) listener()
}

/** Ask the host whether the image row is mounted. */
export function ensureImageAvailability(force = false): void {
  if (availabilityRequest !== null) return
  if (!force && availability !== 'unknown') return
  availabilityRequest = fetch('/tavern-image/ping', { headers: { accept: 'application/json' }, cache: 'no-store' })
    .then(async response => {
      if (!response.ok) return 'off' as const
      const body = await response.json() as Envelope
      return body.ok === true ? 'on' as const : 'off' as const
    })
    .catch(() => 'off' as const)
    .then(next => {
      availability = next
      availabilityRequest = null
      notifyAvailability()
      return next
    })
}

/** Subscribe to the availability probe. */
export function subscribeImageAvailability(listener: () => void): () => void {
  availabilityListeners.add(listener)
  return () => { availabilityListeners.delete(listener) }
}

/** @returns the latest availability snapshot. */
export function imageAvailabilitySnapshot(): ImageAvailability {
  return availability
}

/** React binding for the row availability. */
export function useImageAvailability(): ImageAvailability {
  const value = useSyncExternalStore(subscribeImageAvailability, imageAvailabilitySnapshot, imageAvailabilitySnapshot)
  useEffect(() => { ensureImageAvailability() }, [])
  return value
}

/** One config cache entry. */
interface ConfigEntry {
  readonly data?: ImageConfigResponse
  readonly error?: string
  readonly loading: boolean
}

const CONFIG_EMPTY: ConfigEntry = { loading: false }
const configs = new Map<string, ConfigEntry>()
const configRequests = new Map<string, Promise<void>>()
const configListeners = new Set<() => void>()

function notifyConfig(): void {
  for (const listener of configListeners) listener()
}

function setConfig(workspaceId: string, entry: ConfigEntry): void {
  configs.set(workspaceId, entry)
  notifyConfig()
}

/** Refresh one workspace's image config. */
export function ensureImageConfig(workspaceId: string, sessionId?: string, force = false): void {
  if (workspaceId.length === 0) return
  const current = configs.get(workspaceId)
  if (!force && (current?.data !== undefined || current?.loading === true)) return
  if (configRequests.has(workspaceId)) return
  setConfig(workspaceId, { ...(current ?? CONFIG_EMPTY), loading: true, error: undefined })
  const params = new URLSearchParams({ workspaceId })
  if (sessionId !== undefined) params.set('sessionId', sessionId)
  const request = getJson<ImageConfigResponse>(`/tavern-image/config?${params.toString()}`)
    .then(data => setConfig(workspaceId, { data, loading: false }))
    .catch((error: unknown) => setConfig(workspaceId, {
      ...(current === undefined ? {} : current),
      loading: false,
      error: error instanceof Error ? error.message : String(error),
    }))
    .finally(() => { configRequests.delete(workspaceId) })
  configRequests.set(workspaceId, request)
}

/** Replace one workspace's cached config from a save response. */
export function storeImageConfig(data: ImageConfigResponse): void {
  setConfig(data.workspaceId, { data, loading: false })
}

/** Subscribe to config changes. */
export function subscribeImageConfig(listener: () => void): () => void {
  configListeners.add(listener)
  return () => { configListeners.delete(listener) }
}

/** @returns one workspace's config cache entry. */
export function imageConfigSnapshot(workspaceId: string): ConfigEntry {
  return configs.get(workspaceId) ?? CONFIG_EMPTY
}

/** React binding for one workspace's config. */
export function useImageConfig(workspaceId: string, sessionId?: string): ConfigEntry {
  const entry = useSyncExternalStore(
    subscribeImageConfig,
    () => imageConfigSnapshot(workspaceId),
    () => imageConfigSnapshot(workspaceId),
  )
  useEffect(() => { ensureImageConfig(workspaceId, sessionId) }, [workspaceId, sessionId])
  return entry
}

/** One scene-image cache entry. */
interface SceneImagesEntry {
  readonly data?: SceneListResponse
  readonly error?: string
  readonly loading: boolean
}

const SCENE_EMPTY: SceneImagesEntry = { loading: false }
const sceneImages = new Map<string, SceneImagesEntry>()
const sceneRequests = new Map<string, Promise<void>>()
const sceneListeners = new Set<() => void>()

function sceneKey(workspaceId: string, sessionId: string): string {
  return `${workspaceId}\u0000${sessionId}`
}

function notifyScene(): void {
  for (const listener of sceneListeners) listener()
}

/** Refresh one chat's scene-image list. */
export function ensureSceneImages(workspaceId: string, sessionId: string, force = false): void {
  if (workspaceId.length === 0 || sessionId.length === 0) return
  const key = sceneKey(workspaceId, sessionId)
  const current = sceneImages.get(key)
  if (!force && (current?.data !== undefined || current?.loading === true)) return
  if (sceneRequests.has(key)) return
  sceneImages.set(key, { ...(current ?? SCENE_EMPTY), loading: true, error: undefined })
  notifyScene()
  const params = new URLSearchParams({ workspaceId, sessionId })
  const request = getJson<SceneListResponse>(`/tavern-image/list?${params.toString()}`)
    .then(data => {
      sceneImages.set(key, { data, loading: false })
      notifyScene()
    })
    .catch((error: unknown) => {
      sceneImages.set(key, { data: { images: [] }, loading: false, error: error instanceof Error ? error.message : String(error) })
      notifyScene()
    })
    .finally(() => { sceneRequests.delete(key) })
  sceneRequests.set(key, request)
}

/** Subscribe to scene-image changes. */
export function subscribeSceneImages(listener: () => void): () => void {
  sceneListeners.add(listener)
  return () => { sceneListeners.delete(listener) }
}

/** @returns one chat's scene-image cache entry. */
export function sceneImagesSnapshot(workspaceId: string, sessionId: string): SceneImagesEntry {
  return sceneImages.get(sceneKey(workspaceId, sessionId)) ?? SCENE_EMPTY
}

/** React binding for one chat's scene images. */
export function useSceneImages(workspaceId: string, sessionId: string): SceneImagesEntry {
  const entry = useSyncExternalStore(
    subscribeSceneImages,
    () => sceneImagesSnapshot(workspaceId, sessionId),
    () => sceneImagesSnapshot(workspaceId, sessionId),
  )
  useEffect(() => { ensureSceneImages(workspaceId, sessionId) }, [workspaceId, sessionId])
  return entry
}

/** Tell every mounted view that image state changed. */
export function emitImagesChanged(): void {
  window.dispatchEvent(new CustomEvent('dshtavern:images-changed'))
}

/** Tell the avatar decorator that a character's active portrait moved. */
export function emitPortraitsChanged(): void {
  window.dispatchEvent(new CustomEvent('dshtavern:portraits-changed'))
}

/** Build one scene image URL. */
export function sceneImageUrl(workspaceId: string, sessionId: string, image: { readonly id: string }): string {
  const params = new URLSearchParams({ workspaceId, kind: 'scene', sessionId, id: image.id })
  return `/tavern-image/file?${params.toString()}`
}

/** Build one portrait URL. */
export function portraitImageUrl(workspaceId: string, cardId: string, image: { readonly id: string }): string {
  const params = new URLSearchParams({ workspaceId, kind: 'portrait', cardId, id: image.id })
  return `/tavern-image/file?${params.toString()}`
}

/** Read one value into a string for an input. */
function inputValue(event: { target: { value: string } }): string {
  return event.target.value
}

/** A labelled single-line input. */
function TextRow(props: {
  readonly label: string
  readonly value: string
  readonly placeholder?: string
  readonly type?: string
  readonly hint?: string
  readonly disabled?: boolean
  readonly onChange: (value: string) => void
}): ReactElement {
  return createElement('label', { className: 'dshtavern-image-field' },
    createElement('span', { className: CLASS.label }, props.label),
    createElement('input', {
      className: CLASS.input,
      type: props.type ?? 'text',
      value: props.value,
      placeholder: props.placeholder ?? '',
      disabled: props.disabled === true,
      onChange: (event: { target: { value: string } }) => props.onChange(inputValue(event)),
    }),
    props.hint === undefined ? null : createElement('span', { className: CLASS.hint }, props.hint))
}

/** A labelled textarea. */
function TextArea(props: {
  readonly label: string
  readonly value: string
  readonly rows?: number
  readonly placeholder?: string
  readonly onChange: (value: string) => void
}): ReactElement {
  return createElement('label', { className: 'dshtavern-image-field' },
    createElement('span', { className: CLASS.label }, props.label),
    createElement('textarea', {
      className: CLASS.input,
      rows: props.rows ?? 5,
      value: props.value,
      placeholder: props.placeholder ?? '',
      onChange: (event: { target: { value: string } }) => props.onChange(inputValue(event)),
    }))
}

/** A labelled select. */
function SelectRow(props: {
  readonly label: string
  readonly value: string
  readonly options: readonly { readonly value: string; readonly label: string }[]
  readonly onChange: (value: string) => void
}): ReactElement {
  return createElement('label', { className: 'dshtavern-image-field' },
    createElement('span', { className: CLASS.label }, props.label),
    createElement('select', {
      className: CLASS.input,
      value: props.value,
      onChange: (event: { target: { value: string } }) => props.onChange(inputValue(event)),
    }, props.options.map(option => createElement('option', { key: option.value, value: option.value }, option.label))))
}

/** A checkbox row. */
function CheckRow(props: {
  readonly label: string
  readonly checked: boolean
  readonly hint?: string
  readonly onChange: (checked: boolean) => void
}): ReactElement {
  return createElement('label', { className: 'dshtavern-image-check' },
    createElement('input', {
      type: 'checkbox',
      checked: props.checked,
      onChange: (event: { target: { checked: boolean } }) => props.onChange(event.target.checked),
    }),
    createElement('span', null, props.label),
    props.hint === undefined ? null : createElement('span', { className: CLASS.hint }, props.hint))
}

/** Style options. */
const STYLE_OPTIONS = [
  { value: 'anime', label: '动画' },
  { value: 'cinematic', label: '电影感' },
  { value: 'painterly', label: '厚涂绘画' },
  { value: 'dark-fantasy', label: '黑暗奇幻' },
  { value: 'custom', label: '自定义' },
] as const

/** Props shared by the workshop. */
export interface ImageWorkshopProps {
  readonly workspaceId: string
  readonly sessionId: string
  readonly mode: 'scene' | 'portrait'
  readonly turn?: number
  readonly cardId?: string
  readonly cardName?: string
  readonly compact?: boolean
  readonly onGenerated?: (image: SceneImageView | PortraitView) => void
}

/**
 * The prompt workshop: draft, optional LLM refinement, approval, generation.
 *
 * The generate button only exists after approval, and editing any field that
 * reaches the provider drops the approval. The Host enforces the same rule by
 * storing the approved request under a one-time id.
 */
export function ImageWorkshop(props: ImageWorkshopProps): ReactElement {
  const config = useImageConfig(props.workspaceId, props.sessionId)
  const [preview, setPreview] = useState<ScenePreviewResponse | PortraitPreviewResponse | null>(null)
  const [draft, setDraft] = useState('')
  const [negative, setNegative] = useState('')
  const [aspect, setAspect] = useState<ImageAspect>('1:1')
  const [style, setStyle] = useState<ImageStyleId>('anime')
  const [seed, setSeed] = useState('')
  const [approval, setApproval] = useState<ApproveResponse | null>(null)
  const [refinedPrompt, setRefinedPrompt] = useState<string | undefined>(undefined)
  const [refineModel, setRefineModel] = useState<string | undefined>(undefined)
  const [busy, setBusy] = useState<'load' | 'refine' | 'approve' | 'generate' | null>('load')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [result, setResult] = useState<SceneImageView | PortraitView | null>(null)

  const load = useCallback(async () => {
    setBusy('load')
    setError(null)
    setNotice(null)
    setApproval(null)
    setResult(null)
    setRefinedPrompt(undefined)
    setRefineModel(undefined)
    try {
      const params = new URLSearchParams({ workspaceId: props.workspaceId, mode: props.mode })
      if (props.mode === 'scene') {
        params.set('sessionId', props.sessionId)
        params.set('turn', String(props.turn ?? 0))
      } else if (props.cardId !== undefined) {
        params.set('cardId', props.cardId)
      }
      const next = await getJson<ScenePreviewResponse | PortraitPreviewResponse>(`/tavern-image/preview?${params.toString()}`)
      setPreview(next)
      setDraft(next.draft)
      setNegative(next.negative)
      setAspect(next.capabilities.aspects.includes(next.aspect)
        ? next.aspect
        : next.capabilities.aspects[0] ?? next.aspect)
      setStyle(next.style)
      setSeed('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
      setPreview(null)
    } finally {
      setBusy(null)
    }
  }, [props.workspaceId, props.sessionId, props.mode, props.turn, props.cardId])

  useEffect(() => { void load() }, [load])

  const invalidate = useCallback(() => {
    setApproval(null)
    setNotice('提示词或参数已修改，请重新批准。')
  }, [])

  const editDraft = useCallback((value: string) => { setDraft(value); invalidate() }, [invalidate])
  const editNegative = useCallback((value: string) => { setNegative(value); invalidate() }, [invalidate])
  const editAspect = useCallback((value: string) => { setAspect(value as ImageAspect); invalidate() }, [invalidate])
  const editSeed = useCallback((value: string) => { setSeed(value); invalidate() }, [invalidate])

  const sceneTurn = props.mode === 'scene' && preview?.mode === 'scene' ? preview.turn : props.turn

  const refine = useCallback(async () => {
    setBusy('refine')
    setError(null)
    setNotice(null)
    try {
      const body = {
        workspaceId: props.workspaceId,
        mode: props.mode,
        draftPrompt: draft,
        ...(props.mode === 'scene'
          ? { sessionId: props.sessionId, turn: sceneTurn ?? 0 }
          : { cardId: props.cardId ?? '' }),
      }
      const refined = await postJson<RefineResponse>('/tavern-image/refine', body)
      setDraft(refined.prompt)
      if (refined.negative !== undefined) setNegative(refined.negative)
      setRefinedPrompt(refined.prompt)
      setRefineModel(refined.model)
      setApproval(null)
      setNotice(refined.parsed
        ? `已细化（${refined.model}）。确认后请批准。`
        : `模型没有按 JSON 返回，已把原文放进提示词（${refined.model}）。请检查后批准。`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(null)
    }
  }, [draft, props, sceneTurn])

  const approve = useCallback(async () => {
    setBusy('approve')
    setError(null)
    setNotice(null)
    try {
      const seedNumber = seed.trim().length === 0 ? undefined : Number(seed)
      const next = await postJson<ApproveResponse>('/tavern-image/approve', {
        workspaceId: props.workspaceId,
        mode: props.mode,
        prompt: draft,
        negative,
        aspect,
        style,
        draftPrompt: preview?.draft ?? draft,
        ...(refinedPrompt === undefined ? {} : { refinedPrompt }),
        ...(refineModel === undefined ? {} : { refineModel }),
        ...(seedNumber === undefined || !Number.isInteger(seedNumber) ? {} : { seed: seedNumber }),
        ...(props.mode === 'scene'
          ? { sessionId: props.sessionId, turn: sceneTurn ?? 0 }
          : { cardId: props.cardId ?? '' }),
      })
      setApproval(next)
      setNotice(`已批准，${new Date(next.expiresAt).toLocaleTimeString()} 前可以生成。`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(null)
    }
  }, [approval, aspect, draft, negative, props, preview, refineModel, refinedPrompt, sceneTurn, seed, style])

  const generate = useCallback(async () => {
    if (approval === null) return
    setBusy('generate')
    setError(null)
    setNotice(null)
    try {
      const generated = await postJson<GenerateResponse>('/tavern-image/generate', {
        workspaceId: props.workspaceId,
        approvalId: approval.approvalId,
      })
      setResult(generated.image)
      setApproval(null)
      setNotice('已生成。')
      if (props.mode === 'scene') {
        ensureSceneImages(props.workspaceId, props.sessionId, true)
        emitImagesChanged()
      } else {
        emitPortraitsChanged()
        emitImagesChanged()
      }
      props.onGenerated?.(generated.image)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(null)
    }
  }, [approval, props])

  const capabilities = preview?.capabilities ?? config.data?.capabilities
  const enabled = preview?.enabled ?? config.data?.config.enabled ?? false
  const configured = preview?.configured ?? config.data?.configured ?? false
  const supportedAspects = capabilities?.aspects ?? ['1:1', '3:2', '2:3', '16:9']
  const aspectOptions = supportedAspects.includes(aspect) ? supportedAspects : [aspect, ...supportedAspects]
  const canApprove = preview !== null && enabled && configured && draft.trim().length > 0 && busy === null
  const canGenerate = approval !== null && busy === null
  const image = result === null
    ? null
    : props.mode === 'scene'
      ? sceneImageUrl(props.workspaceId, props.sessionId, result)
      : portraitImageUrl(props.workspaceId, props.cardId ?? '', result)

  const turnLabel = preview?.mode === 'scene' ? preview.turn : props.turn ?? '最新'
  const resultView = result === null || image === null
    ? null
    : createElement('div', { className: 'dshtavern-image-result' },
      createElement('img', { src: image, alt: '生成的图片', loading: 'lazy' }),
      createElement('details', null,
        createElement('summary', null, '查看这次实际使用的提示词'),
        createElement('pre', null, result.finalPrompt),
        result.refinedPrompt === undefined
          ? null
          : createElement('pre', null, `细化结果：\n${result.refinedPrompt}`)))
  const head = createElement('div', { className: 'dshtavern-image-workshop-head' },
    createElement('strong', null, props.mode === 'portrait'
      ? `立绘 · ${props.cardName ?? ''}`
      : `场景 · 第 ${turnLabel} 轮`),
    preview === null
      ? null
      : createElement('span', { className: CLASS.hint }, `${preview.providerLabel} · ${preview.aspect}`))
  const context = preview === null
    ? null
    : createElement('div', { className: 'dshtavern-image-context' },
      preview.mode === 'scene'
        ? createElement('div', null,
          createElement('div', { className: CLASS.hint }, '场景'),
          createElement('p', null, preview.scene || '（本回合没有旁白）'),
          createElement('div', { className: CLASS.hint }, '出场角色'),
          createElement('p', null, preview.characters.length === 0
            ? '（无）'
            : preview.characters.map(character => character.name).join('、')))
        : createElement('div', null,
          createElement('div', { className: CLASS.hint }, '角色外观'),
          createElement('p', null, preview.appearance || '（无外观描述）')))
  const form = createElement('div', { className: 'dshtavern-image-form' },
    createElement(TextArea, {
      label: '提示词草稿',
      value: draft,
      rows: props.compact === true ? 5 : 8,
      placeholder: '先写你想要的画面，或使用上面的草稿…',
      onChange: editDraft,
    }),
    createElement(TextArea, {
      label: '负向词',
      value: negative,
      rows: 2,
      onChange: editNegative,
    }),
    createElement('div', { className: 'dshtavern-image-row' },
      createElement(SelectRow, {
        label: '比例',
        value: aspect,
        options: aspectOptions.map(value => ({ value, label: value })),
        onChange: editAspect,
      }),
      createElement(TextRow, {
        label: 'seed（可选）',
        value: seed,
        type: 'number',
        placeholder: '随机',
        onChange: editSeed,
      })),
    createElement('div', { className: 'dshtavern-image-actions' },
      createElement('button', {
        type: 'button',
        className: CLASS.button,
        disabled: busy !== null || !enabled,
        onClick: () => { void refine() },
        title: '调用一次模型，把草稿细化成更适合当前 provider 的提示词；不会生图',
      }, busy === 'refine' ? '正在细化…' : 'LLM 细化（可选）'),
      createElement('button', {
        type: 'button',
        className: CLASS.button,
        disabled: !canApprove || approval !== null,
        onClick: () => { void approve() },
        title: '只批准提示词，不调用生图 API',
      }, busy === 'approve' ? '正在批准…' : approval === null ? '批准这条提示词' : '已批准'),
      createElement('button', {
        type: 'button',
        className: CLASS.buttonPrimary,
        disabled: !canGenerate,
        onClick: () => { void generate() },
        title: approval === null ? '先批准提示词' : '调用第三方生图 API，可能产生费用',
      }, busy === 'generate' ? '正在生成…' : '生成图片')),
    createElement('div', { className: CLASS.hint },
      '细化会调用一次模型；生成会调用第三方 API，可能产生费用。未批准不会生图。'),
    error === null ? null : createElement('div', { className: CLASS.bannerError }, error),
    notice === null ? null : createElement('div', { className: CLASS.bannerNotice }, notice),
    resultView)
  return createElement('section', {
    className: `dshtavern-image-workshop${props.compact === true ? ' dshtavern-image-workshop-compact' : ''}`,
  }, head,
  busy === 'load'
    ? createElement('div', { className: CLASS.hint }, '正在读取这一轮的场景…')
    : null,
  context,
  preview !== null && !enabled
    ? createElement('div', { className: CLASS.bannerNotice }, '这个酒馆还没有开启生图。到「设置」里配置 provider 并打开开关后，才能批准和生成。')
    : null,
  preview !== null && enabled && !configured
    ? createElement('div', { className: CLASS.bannerError }, 'provider 配置或密钥不完整。到「设置」里补齐后才能生成。')
    : null,
  form)
}

/** Scene gallery for the panel. */
function SceneGallery(props: {
  readonly workspaceId: string
  readonly sessionId: string
}): ReactElement {
  const images = useSceneImages(props.workspaceId, props.sessionId)
  if (images.loading && images.data === undefined) return createElement('div', { className: CLASS.hint }, '正在读取图库…')
  const list = images.data?.images ?? []
  return createElement('div', { className: 'dshtavern-image-gallery' },
    images.error === undefined ? null : createElement('div', { className: CLASS.bannerError }, images.error),
    list.length === 0
      ? createElement('div', { className: CLASS.hint }, '还没有场景图。批准一条提示词并生成后，它会出现在这里。')
      : list.map(image => createElement('figure', { key: image.id, className: 'dshtavern-image-card' },
        createElement('a', {
          href: sceneImageUrl(props.workspaceId, props.sessionId, image),
          target: '_blank',
          rel: 'noreferrer',
        }, createElement('img', {
          src: sceneImageUrl(props.workspaceId, props.sessionId, image),
          alt: `第 ${image.turn} 轮的场景图`,
          loading: 'lazy',
        })),
        createElement('figcaption', null,
          createElement('strong', null, `第 ${image.turn} 轮`),
          createElement('span', { className: CLASS.hint }, ` · ${image.provider}/${image.model}`),
          createElement('details', null,
            createElement('summary', null, '提示词'),
            createElement('pre', null, image.finalPrompt))))))
}

/** One model option. */
interface ModelOption {
  readonly value: string
  readonly label: string
}

/** Fetch the model catalog for the refinement picker. */
async function fetchModels(): Promise<ModelOption[]> {
  try {
    const body = await getJson<{ providers?: Array<{ provider?: string; name?: string; models?: Array<{ id?: string; name?: string }> }> }>('/tavern/models')
    const options: ModelOption[] = []
    for (const provider of Array.isArray(body.providers) ? body.providers : []) {
      if (typeof provider.provider !== 'string') continue
      for (const model of Array.isArray(provider.models) ? provider.models : []) {
        if (typeof model.id !== 'string') continue
        options.push({
          value: `${provider.provider}\u0000${model.id}`,
          label: `${provider.name ?? provider.provider} · ${model.name ?? model.id}`,
        })
      }
    }
    return options
  } catch {
    return []
  }
}

/** Settings form. */
function ImageSettings(props: {
  readonly workspaceId: string
  readonly sessionId: string
  readonly data: ImageConfigResponse
  readonly onSaved: () => void
}): ReactElement {
  const [draft, setDraft] = useState<ImageConfigData>(props.data.config)
  const [secrets, setSecrets] = useState<Record<string, string>>({})
  const [models, setModels] = useState<readonly ModelOption[]>([])
  const [busy, setBusy] = useState<'save' | 'secret' | 'clear' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => { setDraft(props.data.config) }, [props.data])
  useEffect(() => { void fetchModels().then(setModels) }, [])

  const provider = draft.provider
  const capabilities = props.data.providers.find(item => item.id === provider)?.capabilities ?? props.data.capabilities
  const save = useCallback(async () => {
    setBusy('save')
    setError(null)
    setNotice(null)
    try {
      const saved = await postJson<ImageConfigResponse>('/tavern-image/config', {
        workspaceId: props.workspaceId,
        config: draft,
      })
      storeImageConfig(saved)
      setNotice('设置已保存。')
      props.onSaved()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(null)
    }
  }, [draft, props])

  const saveSecrets = useCallback(async () => {
    setBusy('secret')
    setError(null)
    setNotice(null)
    try {
      const saved = await postJson<ImageConfigResponse>('/tavern-image/credentials', {
        workspaceId: props.workspaceId,
        values: secrets,
      })
      storeImageConfig(saved)
      setSecrets({})
      setNotice('密钥已写入 DSH 凭据；面板不会回显它。')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(null)
    }
  }, [props.workspaceId, secrets])

  const clearSecrets = useCallback(async () => {
    setBusy('clear')
    setError(null)
    setNotice(null)
    try {
      const saved = await postJson<ImageConfigResponse>('/tavern-image/credentials', {
        workspaceId: props.workspaceId,
      }, 'DELETE')
      storeImageConfig(saved)
      setNotice('已清除该 provider 的凭据。')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(null)
    }
  }, [props.workspaceId])

  const updateProvider = (next: 'openai-images' | 'jimeng', update: (block: ImageConfigData['providers'][keyof ImageConfigData['providers']]) => unknown): void => {
    setDraft(current => ({
      ...current,
      providers: {
        ...current.providers,
        [next]: { ...current.providers[next], ...update(current.providers[next]) as object },
      },
    }))
  }

  const presetEditor = (mode: 'scene' | 'portrait', preset: ImagePresetView): ReactElement => createElement('div', { className: 'dshtavern-image-settings-section' },
    createElement('h4', null, mode === 'scene' ? '场景预设' : '立绘预设'),
    createElement('div', { className: 'dshtavern-image-row' },
      createElement(SelectRow, {
        label: '比例',
        value: preset.aspect,
        options: (capabilities.aspects.includes(preset.aspect)
          ? capabilities.aspects
          : [preset.aspect, ...capabilities.aspects]).map(value => ({ value, label: value })),
        onChange: value => setDraft(current => ({
          ...current,
          [mode]: { ...current[mode], aspect: value as ImageAspect },
        })),
      }),
      createElement(SelectRow, {
        label: '风格',
        value: preset.style,
        options: STYLE_OPTIONS.map(option => ({ ...option })),
        onChange: value => setDraft(current => ({
          ...current,
          [mode]: { ...current[mode], style: value as ImageStyleId },
        })),
      })),
    preset.style === 'custom'
      ? createElement(TextRow, {
        label: '自定义风格',
        value: preset.customStyle,
        onChange: value => setDraft(current => ({
          ...current,
          [mode]: { ...current[mode], customStyle: value },
        })),
      })
      : null,
    createElement(TextArea, {
      label: '提示词模板',
      value: preset.template,
      rows: 3,
      onChange: value => setDraft(current => ({
        ...current,
        [mode]: { ...current[mode], template: value },
      })),
    }),
    createElement(TextArea, {
      label: '默认负向词',
      value: preset.negative,
      rows: 2,
      onChange: value => setDraft(current => ({
        ...current,
        [mode]: { ...current[mode], negative: value },
      })),
    }))

  return createElement('div', { className: 'dshtavern-image-settings' },
    createElement('div', { className: 'dshtavern-image-settings-section' },
      createElement('h4', null, '开关'),
      createElement(CheckRow, {
        label: '启用这个酒馆的生图',
        checked: draft.enabled,
        hint: '只开放工具，不会自动生图；每次生成都要先批准。',
        onChange: value => setDraft(current => ({ ...current, enabled: value })),
      })),
    createElement('div', { className: 'dshtavern-image-settings-section' },
      createElement('h4', null, 'Provider'),
      createElement(SelectRow, {
        label: '当前 provider',
        value: provider,
        options: props.data.providers.map(item => ({ value: item.id, label: item.label })),
        onChange: value => setDraft(current => {
          const nextAspects = props.data.providers.find(item => item.id === value)?.capabilities.aspects ?? []
          const sceneAspect = nextAspects.includes(current.scene.aspect) ? current.scene.aspect : nextAspects[0] ?? current.scene.aspect
          const portraitAspect = nextAspects.includes(current.portrait.aspect) ? current.portrait.aspect : nextAspects[0] ?? current.portrait.aspect
          return {
            ...current,
            provider: value,
            scene: { ...current.scene, aspect: sceneAspect },
            portrait: { ...current.portrait, aspect: portraitAspect },
          }
        }),
      }),
      provider === 'openai-images'
        ? createElement('div', null,
          createElement(TextRow, {
            label: 'Base URL',
            value: draft.providers['openai-images'].baseUrl,
            onChange: value => updateProvider('openai-images', () => ({ baseUrl: value })),
          }),
          createElement(TextRow, {
            label: '模型',
            value: draft.providers['openai-images'].model,
            placeholder: 'gpt-image-1',
            onChange: value => updateProvider('openai-images', () => ({ model: value })),
          }),
          createElement(TextRow, {
            label: '质量（可选）',
            value: draft.providers['openai-images'].quality,
            onChange: value => updateProvider('openai-images', () => ({ quality: value })),
          }))
        : createElement('div', null,
          createElement(TextRow, {
            label: 'Endpoint',
            value: draft.providers.jimeng.endpoint,
            onChange: value => updateProvider('jimeng', () => ({ endpoint: value })),
          }),
          createElement(TextRow, {
            label: 'Region',
            value: draft.providers.jimeng.region,
            onChange: value => updateProvider('jimeng', () => ({ region: value })),
          }),
          createElement(TextRow, {
            label: 'req_key',
            value: draft.providers.jimeng.reqKey,
            onChange: value => updateProvider('jimeng', () => ({ reqKey: value })),
          }),
          createElement(CheckRow, {
            label: '允许即梦扩写提示词',
            checked: draft.providers.jimeng.promptExpansion,
            onChange: value => updateProvider('jimeng', () => ({ promptExpansion: value })),
          }))),
    createElement('div', { className: 'dshtavern-image-settings-section' },
      createElement('h4', null, '细化模型'),
      createElement(SelectRow, {
        label: '模型',
        value: draft.refineModel === undefined || draft.refineModel === null
          ? 'session'
          : `${draft.refineModel.provider}\u0000${draft.refineModel.model}`,
        options: [
          { value: 'session', label: props.data.sessionModel === undefined
            ? '跟随当前会话'
            : `跟随当前会话（${props.data.sessionModel.provider}/${props.data.sessionModel.model}）` },
          ...models,
        ],
        onChange: value => setDraft(current => ({
          ...current,
          refineModel: value === 'session'
            ? null
            : { provider: value.split('\u0000')[0] ?? '', model: value.split('\u0000')[1] ?? '' },
        })),
      }),
      createElement('div', { className: CLASS.hint }, '细化是可选项；不细化也可以直接批准草稿。')),
    createElement('div', { className: 'dshtavern-image-settings-section' },
      createElement('h4', null, '凭据'),
      createElement('div', { className: CLASS.hint }, `当前 provider：${props.data.providerLabel}。密钥只写不读，保存在 DSH 凭据里。切换 provider 后请先保存设置。`),
      ...props.data.credential.fields.map(field => createElement('label', { key: field.key, className: 'dshtavern-image-field' },
        createElement('span', { className: CLASS.label }, `${field.label}${field.configured ? '（已配置）' : '（未配置）'}`),
        createElement('input', {
          className: CLASS.input,
          type: 'password',
          autoComplete: 'new-password',
          placeholder: field.configured ? '输入新值以覆盖' : '输入密钥',
          value: secrets[field.key] ?? '',
          onChange: (event: { target: { value: string } }) => setSecrets(current => ({ ...current, [field.key]: event.target.value })),
        }))),
      createElement('div', { className: 'dshtavern-image-actions' },
        createElement('button', {
          type: 'button',
          className: CLASS.button,
          disabled: busy !== null || props.data.credential.fields.some(field => (secrets[field.key] ?? '').trim().length === 0),
          onClick: () => { void saveSecrets() },
        }, busy === 'secret' ? '正在保存…' : '保存密钥'),
        createElement('button', {
          type: 'button',
          className: CLASS.button,
          disabled: busy !== null,
          onClick: () => { void clearSecrets() },
        }, busy === 'clear' ? '正在清除…' : '清除凭据'))),
    presetEditor('scene', draft.scene),
    presetEditor('portrait', draft.portrait),
    createElement('div', { className: 'dshtavern-image-actions' },
      createElement('button', {
        type: 'button',
        className: CLASS.buttonPrimary,
        disabled: busy !== null,
        onClick: () => { void save() },
      }, busy === 'save' ? '正在保存…' : '保存设置'),
      createElement('button', {
        type: 'button',
        className: CLASS.button,
        disabled: busy !== null,
        onClick: () => setDraft(props.data.defaults),
      }, '恢复默认值')),
    error === null ? null : createElement('div', { className: CLASS.bannerError }, error),
    notice === null ? null : createElement('div', { className: CLASS.bannerNotice }, notice))
}

/** Props of the toolbox image panel. */
export interface TavernImagePanelProps {
  readonly workspaceId: string
  readonly workspaceTitle: string
  readonly workspacePath: string
  readonly sessionId: string
}

/** The toolbox image panel. */
export function TavernImagePanel(props: TavernImagePanelProps): ReactElement {
  const availability = useImageAvailability()
  const config = useImageConfig(props.workspaceId, props.sessionId)
  const [tab, setTab] = useState('scene')

  if (availability === 'off') {
    return createElement('div', { className: 'dshtavern-image dshtavern-image-panel' },
      createElement('div', { className: CLASS.bannerNotice },
        '生图子插件没有加载。到「插件」页启用 dshtavern-image，然后回到这里刷新。'),
      createElement('button', {
        type: 'button',
        className: CLASS.button,
        onClick: () => ensureImageAvailability(true),
      }, '重新检测'))
  }
  if (config.loading && config.data === undefined) {
    return createElement('div', { className: 'dshtavern-image dshtavern-image-panel' },
      createElement('div', { className: CLASS.hint }, '正在读取生图设置…'))
  }
  if (config.error !== undefined && config.data === undefined) {
    return createElement('div', { className: 'dshtavern-image dshtavern-image-panel' },
      createElement('div', { className: CLASS.bannerError }, config.error),
      createElement('button', {
        type: 'button',
        className: CLASS.button,
        onClick: () => ensureImageConfig(props.workspaceId, props.sessionId, true),
      }, '重试'))
  }
  const data = config.data
  if (data === undefined) return createElement('div', { className: 'dshtavern-image dshtavern-image-panel' })
  return createElement('div', { className: 'dshtavern-image dshtavern-image-panel' },
    createElement(SubTabs, {
      ariaLabel: '生图工具页面',
      tabs: [
        { id: 'scene', label: '场景' },
        { id: 'gallery', label: '图库' },
        { id: 'settings', label: '设置' },
      ],
      active: tab,
      onSelect: setTab,
    }),
    createElement(SubTabPane, null,
      tab === 'settings'
        ? createElement(ImageSettings, {
          workspaceId: props.workspaceId,
          sessionId: props.sessionId,
          data,
          onSaved: () => ensureImageConfig(props.workspaceId, props.sessionId, true),
        })
        : tab === 'gallery'
          ? createElement(SceneGallery, { workspaceId: props.workspaceId, sessionId: props.sessionId })
          : data.config.enabled
            ? createElement('div', { className: 'dshtavern-image-scene' },
              createElement(ImageWorkshop, {
                workspaceId: props.workspaceId,
                sessionId: props.sessionId,
                mode: 'scene',
                onGenerated: () => ensureSceneImages(props.workspaceId, props.sessionId, true),
              }),
              createElement(SceneGallery, { workspaceId: props.workspaceId, sessionId: props.sessionId }))
            : createElement('div', { className: 'dshtavern-image-setup' },
              createElement('h3', null, '先开启这个酒馆的生图'),
              createElement('p', { className: CLASS.hint },
                '生图默认关闭。到「设置」里选择 provider、填入凭据，然后打开开关。开启后每次生成仍需先编辑并批准提示词。'),
              createElement('button', {
                type: 'button',
                className: CLASS.buttonPrimary,
                onClick: () => setTab('settings'),
              }, '去设置'))))
}

/** Props of the character portrait section. */
export interface TavernPortraitSectionProps {
  readonly workspaceId: string
  readonly cardId: string
  readonly cardName: string
}

/** Portrait section embedded in the character-card editor. */
export function TavernPortraitSection(props: TavernPortraitSectionProps): ReactElement {
  const availability = useImageAvailability()
  const config = useImageConfig(props.workspaceId)
  const [data, setData] = useState<PortraitListResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const params = new URLSearchParams({ workspaceId: props.workspaceId, cardId: props.cardId })
      setData(await getJson<PortraitListResponse>(`/tavern-image/portraits?${params.toString()}`))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }, [props.workspaceId, props.cardId])

  useEffect(() => { if (availability === 'on') void load() }, [availability, load])
  useEffect(() => {
    const handler = (): void => { void load() }
    window.addEventListener('dshtavern:portraits-changed', handler)
    return () => window.removeEventListener('dshtavern:portraits-changed', handler)
  }, [load])

  const activate = useCallback(async (id: string | undefined) => {
    setBusy(id ?? 'clear')
    setError(null)
    try {
      const next = await postJson<PortraitListResponse>('/tavern-image/portrait-active', {
        workspaceId: props.workspaceId,
        cardId: props.cardId,
        ...(id === undefined ? {} : { id }),
      })
      setData(next)
      emitPortraitsChanged()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(null)
    }
  }, [props.workspaceId, props.cardId])

  if (availability === 'off') {
    return createElement('div', { className: 'dshtavern-character-group dshtavern-image-portraits' },
      createElement('div', { className: 'dshtavern-character-group-title' }, '立绘'),
      createElement('div', { className: CLASS.hint }, '生图子插件未启用。'))
  }
  if (config.data !== undefined && !config.data.config.enabled) {
    return createElement('div', { className: 'dshtavern-character-group dshtavern-image-portraits' },
      createElement('div', { className: 'dshtavern-character-group-title' }, '立绘'),
      createElement('div', { className: CLASS.hint }, '这个酒馆还没有开启生图。到工具箱的「生图 → 设置」里打开。'))
  }
  const active = data?.active
  return createElement('div', { className: 'dshtavern-character-group dshtavern-image-portraits' },
    createElement('div', { className: 'dshtavern-character-group-title' }, '立绘'),
    error === null ? null : createElement('div', { className: CLASS.bannerError }, error),
    createElement('div', { className: 'dshtavern-image-portrait-head' },
      active === undefined
        ? createElement('div', { className: 'dshtavern-image-portrait-placeholder' }, props.cardName.slice(0, 1) || '?')
        : createElement('img', {
          className: 'dshtavern-image-portrait-active',
          src: portraitImageUrl(props.workspaceId, props.cardId, active),
          alt: `${props.cardName} 的立绘`,
          loading: 'lazy',
        }),
      createElement('div', null,
        createElement('div', { className: CLASS.hint }, active === undefined ? '还没有设置头像立绘' : '当前头像立绘'),
        createElement('div', { className: 'dshtavern-image-actions' },
          createElement('button', {
            type: 'button',
            className: CLASS.button,
            onClick: () => setOpen(value => !value),
          }, open ? '收起' : '生成立绘'),
          active === undefined ? null : createElement('button', {
            type: 'button',
            className: CLASS.button,
            disabled: busy !== null,
            onClick: () => { void activate(undefined) },
          }, '清除头像')))),
    open
      ? createElement(ImageWorkshop, {
        workspaceId: props.workspaceId,
        sessionId: '',
        mode: 'portrait',
        cardId: props.cardId,
        cardName: props.cardName,
        compact: true,
        onGenerated: () => { void load() },
      })
      : null,
    data === null || data.index.items.length === 0
      ? null
      : createElement('div', { className: 'dshtavern-image-portrait-history' },
        data.index.items.slice().reverse().map(item => createElement('div', { key: item.id, className: 'dshtavern-image-portrait-item' },
          createElement('img', {
            src: portraitImageUrl(props.workspaceId, props.cardId, item),
            alt: '历史立绘',
            loading: 'lazy',
          }),
          createElement('button', {
            type: 'button',
            className: CLASS.button,
            disabled: busy !== null || data.index.activeId === item.id,
            onClick: () => { void activate(item.id) },
          }, data.index.activeId === item.id ? '当前头像' : '设为头像')))))
}
