/**
 * Image provider credentials.
 *
 * The workspace config names a provider, never a secret. Each provider has a
 * fixed set of DSH credential references; the panel can write them through a
 * write-only route, and the host resolves them per call. A profile without the
 * credential service falls back to the launch environment and reports that
 * source, so the feature degrades instead of failing to load.
 */
import type { ProviderCredentials, ProviderId } from './providers/types.js'

/** The slice of the DSH credential service this plugin uses. */
export interface CredentialService {
  resolve(ref: string): Promise<{ value: string; source?: string } | undefined>
  describe(ref: string): Promise<{ configured: boolean; source?: string; writable?: boolean }>
  set(ref: string, value: string): Promise<void>
  unset(ref: string): Promise<void>
}

/** One credential field a provider needs. */
export interface CredentialField {
  readonly key: keyof ProviderCredentials
  readonly label: string
  readonly ref: string
}

/** Fixed references; a workspace cannot point the panel at any other secret. */
export const PROVIDER_CREDENTIALS: Readonly<Record<ProviderId, readonly CredentialField[]>> = {
  'openai-images': [
    { key: 'apiKey', label: 'API Key', ref: 'DSHTAVERN_IMAGE_OPENAI_API_KEY' },
  ],
  jimeng: [
    { key: 'accessKey', label: 'Access Key', ref: 'DSHTAVERN_IMAGE_JIMENG_ACCESS_KEY' },
    { key: 'secretKey', label: 'Secret Key', ref: 'DSHTAVERN_IMAGE_JIMENG_SECRET_KEY' },
  ],
  comfyui: [],
  'gemini-image': [
    { key: 'apiKey', label: 'API Key', ref: 'DSHTAVERN_IMAGE_GEMINI_API_KEY' },
  ],
}

/** One field's presence, safe to send to the browser. */
export interface CredentialFieldStatus {
  readonly key: string
  readonly label: string
  readonly configured: boolean
  readonly source?: string
}

/** One provider's credential status. */
export interface ProviderCredentialStatus {
  readonly provider: ProviderId
  readonly configured: boolean
  readonly fields: readonly CredentialFieldStatus[]
}

/** A credential is missing or cannot be written. */
export class ImageCredentialError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ImageCredentialError'
  }
}

/** Resolve the optional credential service from a Cordis context. */
export function credentialService(ctx: unknown): CredentialService | undefined {
  const getter = ctx as { get?: (name: string) => unknown } | undefined
  return getter?.get?.('credentials') as CredentialService | undefined
}

/** @param ref - credential reference. @returns the launch environment value, if any. */
function envValue(ref: string): string | undefined {
  const value = process.env[ref]
  return value === undefined || value.trim().length === 0 ? undefined : value
}

/**
 * Describe one provider's credentials without resolving their values.
 * @param service - optional DSH credential service.
 * @param provider - provider id.
 * @returns per-field presence and the aggregate `configured`.
 */
export async function providerCredentialStatus(
  service: CredentialService | undefined,
  provider: ProviderId,
): Promise<ProviderCredentialStatus> {
  const fields = PROVIDER_CREDENTIALS[provider]
  const statuses: CredentialFieldStatus[] = []
  for (const field of fields) {
    const described = service === undefined
      ? undefined
      : await service.describe(field.ref).catch(() => undefined)
    const configured = described?.configured === true || (envValue(field.ref) !== undefined)
    statuses.push({
      key: field.key,
      label: field.label,
      configured,
      ...(described?.source === undefined ? {} : { source: described.source }),
    })
  }
  return {
    provider,
    configured: statuses.length > 0 && statuses.every(field => field.configured),
    fields: statuses,
  }
}

/**
 * Resolve one provider's secrets for a call.
 * @param service - optional DSH credential service.
 * @param provider - provider id.
 * @returns resolved credentials.
 * @throws ImageCredentialError when a required field is missing.
 */
export async function resolveProviderCredentials(
  service: CredentialService | undefined,
  provider: ProviderId,
): Promise<ProviderCredentials> {
  const fields = PROVIDER_CREDENTIALS[provider]
  if (fields.length === 0) return {}
  const values: Partial<Record<keyof ProviderCredentials, string>> = {}
  for (const field of fields) {
    const resolved = service === undefined
      ? undefined
      : await service.resolve(field.ref).catch(() => undefined)
    const value = resolved?.value !== undefined && resolved.value.length > 0
      ? resolved.value
      : envValue(field.ref)
    if (value === undefined) {
      throw new ImageCredentialError(`缺少 ${field.label}（${field.ref}）`)
    }
    values[field.key] = value
  }
  return values
}

/**
 * Store one provider's credentials through the write-only DSH seam.
 *
 * Only the fixed references above are written; a workspace cannot use this
 * route to overwrite another plugin's credential.
 * @param service - DSH credential service.
 * @param provider - provider id.
 * @param values - field values keyed by {@link CredentialField.key}.
 * @returns nothing; values are never echoed.
 * @throws ImageCredentialError when the service is absent or a value is blank.
 */
export async function writeProviderCredentials(
  service: CredentialService | undefined,
  provider: ProviderId,
  values: Readonly<Record<string, unknown>>,
): Promise<void> {
  if (service === undefined) {
    throw new ImageCredentialError(
      `当前部署没有凭据服务；请把 ${PROVIDER_CREDENTIALS[provider].map(field => field.ref).join(' / ')} 写进环境变量`,
    )
  }
  for (const field of PROVIDER_CREDENTIALS[provider]) {
    const value = values[field.key]
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new ImageCredentialError(`缺少 ${field.label}`)
    }
    await service.set(field.ref, value)
  }
}

/**
 * Remove one provider's credentials from the managed store.
 * @param service - DSH credential service.
 * @param provider - provider id.
 */
export async function clearProviderCredentials(
  service: CredentialService | undefined,
  provider: ProviderId,
): Promise<void> {
  if (service === undefined) {
    throw new ImageCredentialError('当前部署没有凭据服务，无法清除环境变量')
  }
  for (const field of PROVIDER_CREDENTIALS[provider]) {
    await service.unset(field.ref)
  }
}

/** @param provider - provider id. @returns the field keys it needs. */
export function credentialKeys(provider: ProviderId): readonly string[] {
  return PROVIDER_CREDENTIALS[provider].map(field => String(field.key))
}
