import type { ReactElement } from 'react';
/** One character card as served by `/tavern/characters`. */
export interface CharacterCardView {
    readonly id: string;
    readonly name: string;
    readonly description: string;
    readonly appearance: string;
    readonly personality: string;
    readonly scenario: string;
    readonly systemPrompt: string;
    readonly exampleDialogues: string;
    readonly greetings: {
        first: string;
        alternates: readonly string[];
    };
    readonly tags: readonly string[];
    readonly entries: readonly unknown[];
    readonly createdAt: string;
    readonly updatedAt: string;
}
/** One unreadable `.charc` file. */
export interface CharacterCardProblem {
    readonly file: string;
    readonly error: string;
}
/**
 * Read one workspace's character cards for another panel.
 *
 * The prompt-preview picker needs the real card names before a preview exists;
 * reading them through the preview response would leave the picker empty until
 * the first preview runs.
 * @param workspaceId - tavern workspace id.
 * @returns readable cards, newest first.
 */
export declare function fetchCharacterCards(workspaceId: string): Promise<CharacterCardView[]>;
/** One exported document: suggested file name plus its text. */
export interface TransferDocument {
    readonly file: string;
    readonly text: string;
}
/**
 * Ask the host for one card's `.charc` document.
 * @param workspaceId - tavern workspace id.
 * @param id - card id.
 * @returns the suggested file name and document text.
 */
export declare function exportCharacterCard(workspaceId: string, id: string): Promise<TransferDocument>;
/**
 * Import one `.charc` document into the workspace.
 * @param workspaceId - tavern workspace id.
 * @param text - document text.
 * @returns the stored card.
 */
export declare function importCharacterCard(workspaceId: string, text: string): Promise<CharacterCardView>;
/**
 * Save one document to the user's disk.
 *
 * The client owns the download because the host cannot reach the browser's
 * save dialog; the text is produced by the host so both sides read one format.
 * @param transfer - suggested file name and content.
 */
export declare function downloadDocument(transfer: TransferDocument): void;
/**
 * Ask the user to pick one file and read it as text.
 * @param accept - file input accept filter.
 * @returns the file name and text, or `undefined` when the picker was dismissed.
 */
export declare function pickTextFile(accept: string): Promise<{
    name: string;
    text: string;
} | undefined>;
/** Props of the character tool. */
export interface CharacterCardToolProps {
    readonly workspaceId: string;
    readonly workspaceTitle: string;
    readonly workspacePath: string;
}
/** Two-pane character-card tool. */
export declare function CharacterCardTool(props: CharacterCardToolProps): ReactElement;
