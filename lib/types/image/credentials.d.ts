/**
 * Image provider credentials.
 *
 * The workspace config names a provider, never a secret. Each provider has a
 * fixed set of DSH credential references; the panel can write them through a
 * write-only route, and the host resolves them per call. A profile without the
 * credential service falls back to the launch environment and reports that
 * source, so the feature degrades instead of failing to load.
 */
import type { ProviderCredentials, ProviderId } from './providers/types.js';
/** The slice of the DSH credential service this plugin uses. */
export interface CredentialService {
    resolve(ref: string): Promise<{
        value: string;
        source?: string;
    } | undefined>;
    describe(ref: string): Promise<{
        configured: boolean;
        source?: string;
        writable?: boolean;
    }>;
    set(ref: string, value: string): Promise<void>;
    unset(ref: string): Promise<void>;
}
/** One credential field a provider needs. */
export interface CredentialField {
    readonly key: keyof ProviderCredentials;
    readonly label: string;
    readonly ref: string;
}
/** Fixed references; a workspace cannot point the panel at any other secret. */
export declare const PROVIDER_CREDENTIALS: Readonly<Record<ProviderId, readonly CredentialField[]>>;
/** One field's presence, safe to send to the browser. */
export interface CredentialFieldStatus {
    readonly key: string;
    readonly label: string;
    readonly configured: boolean;
    readonly source?: string;
}
/** One provider's credential status. */
export interface ProviderCredentialStatus {
    readonly provider: ProviderId;
    readonly configured: boolean;
    readonly fields: readonly CredentialFieldStatus[];
}
/** A credential is missing or cannot be written. */
export declare class ImageCredentialError extends Error {
    constructor(message: string);
}
/** Resolve the optional credential service from a Cordis context. */
export declare function credentialService(ctx: unknown): CredentialService | undefined;
/**
 * Describe one provider's credentials without resolving their values.
 * @param service - optional DSH credential service.
 * @param provider - provider id.
 * @returns per-field presence and the aggregate `configured`.
 */
export declare function providerCredentialStatus(service: CredentialService | undefined, provider: ProviderId): Promise<ProviderCredentialStatus>;
/**
 * Resolve one provider's secrets for a call.
 * @param service - optional DSH credential service.
 * @param provider - provider id.
 * @returns resolved credentials.
 * @throws ImageCredentialError when a required field is missing.
 */
export declare function resolveProviderCredentials(service: CredentialService | undefined, provider: ProviderId): Promise<ProviderCredentials>;
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
export declare function writeProviderCredentials(service: CredentialService | undefined, provider: ProviderId, values: Readonly<Record<string, unknown>>): Promise<void>;
/**
 * Remove one provider's credentials from the managed store.
 * @param service - DSH credential service.
 * @param provider - provider id.
 */
export declare function clearProviderCredentials(service: CredentialService | undefined, provider: ProviderId): Promise<void>;
/** @param provider - provider id. @returns the field keys it needs. */
export declare function credentialKeys(provider: ProviderId): readonly string[];
