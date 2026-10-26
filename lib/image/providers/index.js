import { openAiImagesProvider } from './openai-images.js';
import { jimengProvider } from './jimeng.js';
/** Erase a provider's specific config type at the registry boundary. */
function runtime(provider) {
    return provider;
}
/** Providers this build can call. */
export const IMAGE_PROVIDERS = {
    'openai-images': runtime(openAiImagesProvider),
    jimeng: runtime(jimengProvider),
};
/** @param id - provider id. @returns its adapter, or `undefined` when unimplemented. */
export function imageProvider(id) {
    return IMAGE_PROVIDERS[id];
}
/** @param id - provider id. @returns a capability table, with a conservative fallback. */
export function providerCapabilities(id) {
    return imageProvider(id)?.capabilities ?? {
        negative: false,
        seed: false,
        aspects: ['1:1'],
        referenceImages: false,
        async: false,
        maxCount: 1,
    };
}
/** @param id - provider id. @returns the label shown in the panel. */
export function providerLabel(id) {
    return imageProvider(id)?.label ?? id;
}
