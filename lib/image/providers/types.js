/**
 * Provider-neutral image generation types.
 *
 * A provider adapter translates one canonical request into its own wire shape
 * and turns the answer back into bytes. The canonical request deliberately
 * carries only what every provider can understand; provider-specific knobs are
 * config, never prompt input from the model or a beat.
 */
/** A provider call failed; the message is safe to show the user. */
export class ImageProviderError extends Error {
    provider;
    status;
    constructor(message, provider, status) {
        super(message);
        this.provider = provider;
        this.status = status;
        this.name = 'ImageProviderError';
    }
}
/** Trim a prompt's negative clause into the prompt when no field exists. */
export function mergeNegative(prompt, negative) {
    const base = prompt.trim();
    const avoid = negative?.trim() ?? '';
    if (avoid.length === 0)
        return base;
    return `${base}\n\n避免：${avoid}`;
}
/** Clamp a prompt to a provider's published ceiling. */
export function clampPrompt(prompt, max) {
    if (max === undefined || prompt.length <= max)
        return prompt;
    return prompt.slice(0, max);
}
