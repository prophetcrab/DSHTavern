/** Directory holding one chat's scene images. */
export declare const SCENE_IMAGES_DIRECTORY = "images";
/** Scene image metadata file. */
export declare const SCENE_INDEX_FILE = "index.jsonl";
/** Directory holding one character's portraits. */
export declare const PORTRAITS_DIRECTORY = "portraits";
/** Portrait metadata file. */
export declare const PORTRAIT_INDEX_FILE = "index.json";
/** Schema stamped on every record. */
export declare const IMAGE_RECORD_SCHEMA = 1;
/** A stored image record is invalid or a file is outside its directory. */
export declare class ImageStoreError extends Error {
    constructor(message: string);
}
/** One scene image record. */
export interface SceneImageRecord {
    readonly schema: number;
    readonly id: string;
    readonly turn: number;
    readonly file: string;
    readonly mime: string;
    readonly sizeBytes: number;
    readonly draftPrompt: string;
    readonly refinedPrompt?: string;
    readonly finalPrompt: string;
    readonly provider: string;
    readonly model: string;
    readonly seed?: number;
    readonly aspect: string;
    readonly style: string;
    readonly refineModel?: string;
    readonly approvedAt: string;
    readonly createdAt: string;
}
/** One portrait record. */
export interface PortraitRecord {
    readonly schema: number;
    readonly id: string;
    readonly cardId: string;
    readonly file: string;
    readonly mime: string;
    readonly sizeBytes: number;
    readonly draftPrompt: string;
    readonly refinedPrompt?: string;
    readonly finalPrompt: string;
    readonly provider: string;
    readonly model: string;
    readonly seed?: number;
    readonly aspect: string;
    readonly style: string;
    readonly refineModel?: string;
    readonly approvedAt: string;
    readonly createdAt: string;
}
/** Metadata written for one new scene image. */
export interface SceneImageInput {
    readonly turn: number;
    readonly bytes: Uint8Array;
    readonly mime: string;
    readonly draftPrompt: string;
    readonly refinedPrompt?: string;
    readonly finalPrompt: string;
    readonly provider: string;
    readonly model: string;
    readonly seed?: number;
    readonly aspect: string;
    readonly style: string;
    readonly refineModel?: string;
    readonly approvedAt: string;
}
/** Metadata written for one new portrait. */
export interface PortraitInput extends Omit<SceneImageInput, 'turn'> {
    readonly cardId: string;
}
/** One character's portrait index. */
export interface PortraitIndex {
    readonly schema: number;
    readonly activeId?: string;
    readonly items: readonly PortraitRecord[];
}
/** @param workspaceDir - tavern workspace root. @param session - chat id. @returns the scene image directory. */
export declare function sceneImagesDirectory(workspaceDir: string, session: string): string;
/** @param workspaceDir - tavern workspace root. @param session - chat id. @returns the scene index path. */
export declare function sceneIndexPath(workspaceDir: string, session: string): string;
/** @param workspaceDir - tavern workspace root. @param cardId - character id. @returns the portrait directory. */
export declare function portraitsDirectory(workspaceDir: string, cardId: string): string;
/** @param workspaceDir - tavern workspace root. @param cardId - character id. @returns the portrait index path. */
export declare function portraitsIndexPath(workspaceDir: string, cardId: string): string;
/** Validate an id used in a path or query. */
export declare function safeId(value: string): string;
/** Map a MIME type to the extension written beside the index. */
export declare function extensionForMime(mime: string): string;
/**
 * Validate image bytes and return their real MIME type.
 * @param bytes - decoded bytes.
 * @param maxBytes - configured ceiling.
 * @returns the detected MIME and extension.
 * @throws ImageStoreError when the payload is empty, oversized, or not a supported image.
 */
export declare function inspectImage(bytes: Uint8Array, maxBytes: number): {
    mime: string;
    extension: string;
};
/**
 * Write one scene image and append its metadata.
 * @param workspaceDir - tavern workspace root.
 * @param session - chat id.
 * @param input - bytes and the approved request.
 * @returns the stored record.
 */
export declare function writeSceneImage(workspaceDir: string, session: string, input: SceneImageInput): Promise<SceneImageRecord>;
/**
 * List a chat's scene images, newest first.
 * @param workspaceDir - tavern workspace root.
 * @param session - chat id.
 * @param turn - optional turn filter.
 * @returns usable records.
 */
export declare function listSceneImages(workspaceDir: string, session: string, turn?: number): Promise<SceneImageRecord[]>;
/**
 * Resolve one scene image file.
 * @param workspaceDir - tavern workspace root.
 * @param session - chat id.
 * @param id - image id.
 * @returns the record and absolute path.
 * @throws ImageStoreError when the id is unknown.
 */
export declare function readSceneImageFile(workspaceDir: string, session: string, id: string): Promise<{
    record: SceneImageRecord;
    path: string;
}>;
/** @param workspaceDir - tavern workspace root. @param cardId - character id. @returns an empty index. */
export declare function emptyPortraitIndex(): PortraitIndex;
/**
 * Read one character's portrait index.
 * @param workspaceDir - tavern workspace root.
 * @param cardId - character id.
 * @returns the index; damaged items are skipped.
 */
export declare function readPortraitIndex(workspaceDir: string, cardId: string): Promise<PortraitIndex>;
/**
 * Write one portrait and append it to the character's index.
 * @param workspaceDir - tavern workspace root.
 * @param input - bytes and the approved request.
 * @returns the stored record.
 */
export declare function writePortrait(workspaceDir: string, input: PortraitInput): Promise<PortraitRecord>;
/**
 * Switch one character's active portrait.
 * @param workspaceDir - tavern workspace root.
 * @param cardId - character id.
 * @param id - portrait id, or `undefined` to clear.
 * @returns the updated index.
 */
export declare function setActivePortrait(workspaceDir: string, cardId: string, id: string | undefined): Promise<PortraitIndex>;
/**
 * Resolve one portrait file.
 * @param workspaceDir - tavern workspace root.
 * @param cardId - character id.
 * @param id - portrait id.
 * @returns the record and absolute path.
 */
export declare function readPortraitFile(workspaceDir: string, cardId: string, id: string): Promise<{
    record: PortraitRecord;
    path: string;
}>;
/** @param workspaceDir - tavern workspace root. @param cardId - character id. @returns the active portrait, if any. */
export declare function activePortrait(workspaceDir: string, cardId: string): Promise<PortraitRecord | undefined>;
