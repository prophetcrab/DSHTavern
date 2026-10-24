import type { ReactElement } from 'react';
/** Which of the two schedules a workspace uses. */
export type TrackerTriggerView = 'turns' | 'minutes';
/** Which sub-page the panel shows. */
export type TrackerTab = 'latest' | 'history' | 'settings';
/** How much text one category of the ledger may carry. */
export interface TrackerLengthView {
    /** Length the prompt asks for, in characters. */
    readonly suggested: number;
}
/** Per-category length budgets, mirrored from the host. */
export interface TrackerLengthsView {
    readonly world: TrackerLengthView;
    readonly character: TrackerLengthView;
    readonly user: TrackerLengthView;
}
/** Trigger settings for one tavern workspace. */
export interface TrackerConfigView {
    readonly schema: number;
    readonly enabled: boolean;
    readonly trigger: TrackerTriggerView;
    readonly everyTurns: number;
    readonly everyMinutes: number;
    readonly maxTranscriptChars: number;
    readonly lengths: TrackerLengthsView;
    readonly model?: {
        readonly provider: string;
        readonly model: string;
    };
}
/** One character's entry in a ledger. */
export interface CharacterProgressView {
    readonly id?: string;
    readonly name: string;
    readonly progress: string;
}
/** The player's entry in a ledger. */
export interface UserProgressView {
    readonly progress: string;
}
/** One tracking run's result. */
export interface TrackerSummaryView {
    readonly turn: number;
    readonly at: string;
    readonly model?: string;
    readonly world: string;
    /** Absent on ledgers written before player tracking existed. */
    readonly user?: UserProgressView;
    readonly characters: readonly CharacterProgressView[];
    readonly transcriptChars: number;
    readonly sinceTurn?: number;
}
/** One chat's tracking view. */
export interface TrackerChatView {
    readonly sessionId: string;
    readonly newestTurn: number;
    readonly summaries: readonly TrackerSummaryView[];
    /** Every turn the newest ledger has read; the rail marks these. */
    readonly trackedTurns: readonly number[];
    /** How many runs have written a ledger. */
    readonly runCount: number;
    readonly running: boolean;
    readonly staleTurns: readonly number[];
    readonly lastError?: string;
}
/** The tracker's read model. */
export interface TrackerSnapshotView {
    readonly workspaceId: string;
    readonly workspaceTitle: string;
    readonly config: TrackerConfigView;
    readonly defaults: TrackerConfigView;
    readonly chats: readonly TrackerChatView[];
    readonly generatedAt: string;
}
/** Bounds mirrored from the host so the inputs can clamp in place. */
export declare const TRACKER_LIMITS: {
    readonly everyTurns: {
        readonly min: 1;
        readonly max: 200;
        readonly unit: "轮";
    };
    readonly everyMinutes: {
        readonly min: 1;
        readonly max: 10080;
        readonly unit: "分钟";
    };
    readonly maxTranscriptChars: {
        readonly min: 2000;
        readonly max: 800000;
        readonly unit: "字";
    };
    readonly worldChars: {
        readonly min: 60;
        readonly max: 4000;
        readonly unit: "字";
    };
    readonly characterChars: {
        readonly min: 40;
        readonly max: 2000;
        readonly unit: "字";
    };
    readonly userChars: {
        readonly min: 40;
        readonly max: 2000;
        readonly unit: "字";
    };
};
/**
 * Ready-made length budgets.
 *
 * Three sizes rather than a single slider per field: the useful question is
 * "how much summary do I want", not "how many characters should the world
 * section be". Each preset scales the three categories together, keeping the
 * ratio the defaults established.
 */
export declare const LENGTH_PRESETS: {
    readonly short: {
        readonly label: "精简";
        readonly hint: "几句话说清现状";
        readonly world: 150;
        readonly character: 100;
        readonly user: 80;
    };
    readonly standard: {
        readonly label: "标准";
        readonly hint: "默认，够回顾也能读完";
        readonly world: 300;
        readonly character: 180;
        readonly user: 150;
    };
    readonly long: {
        readonly label: "详细";
        readonly hint: "保留更多细节";
        readonly world: 600;
        readonly character: 360;
        readonly user: 300;
    };
    readonly deep: {
        readonly label: "详尽";
        readonly hint: "接近章节摘要";
        readonly world: 1200;
        readonly character: 700;
        readonly user: 600;
    };
};
/** A preset id from {@link LENGTH_PRESETS}. */
export type LengthPresetId = keyof typeof LENGTH_PRESETS;
/**
 * Which preset a set of budgets currently matches.
 * @param lengths - configured budgets.
 * @returns the preset id, or `undefined` for a custom mix.
 */
export declare function lengthPresetOf(lengths: TrackerLengthsView): LengthPresetId | undefined;
/** Props of the tracker panel. */
export interface TrackerPanelProps {
    readonly workspaceId: string;
    readonly workspaceTitle: string;
    readonly workspacePath: string;
    /** Chat the toolbox was opened from, shown first and used for manual runs. */
    readonly sessionId: string;
}
/**
 * One line of the status card: what tracking is doing right now.
 *
 * The status is the first thing a reader wants, so it is a sentence rather than
 * a row of pills: "next run after 3 more beats" answers the question a knob
 * cannot.
 * @param props - config and the current chat, when one is selected.
 * @returns the status sentence.
 */
export declare function trackerStatusText(config: TrackerConfigView, chat: TrackerChatView | undefined): string;
/**
 * Story tracker: newest ledger, run history, and settings behind one tab strip.
 * @param props - the workspace and chat the toolbox opened for.
 * @returns the tracker section.
 */
export declare function TrackerPanel(props: TrackerPanelProps): ReactElement;
