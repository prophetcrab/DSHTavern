import type { ReactElement } from 'react';
/** Per-role model selection; both fields are present together. */
export interface AgentModelChoiceView {
    readonly provider: string;
    readonly model: string;
    readonly reasoningEffort?: string;
}
/** One workspace's agent orchestration settings. */
export interface AgentConfigView {
    readonly schema: number;
    readonly maxSpeechesPerBeat: number;
    readonly stageWindow: number;
    readonly loreScanLines: number;
    readonly loreMaxEntries: number;
    readonly loreMaxChars: number;
    readonly playerInputMax: number;
    readonly rotateSpeakers: boolean;
    readonly honorPlayerMention: boolean;
    readonly unknownSpeaker: 'none' | 'first';
    /** Reply budget shared by every call; absent means no cap. */
    readonly maxReplyChars?: number;
    /** Director reply budget; overrides the shared one. */
    readonly directorMaxReplyChars?: number;
    /** Per-character reply budgets keyed by card id; overrides the shared one. */
    readonly characterMaxReplyChars?: Readonly<Record<string, number>>;
    /** Character cap on the staged transcript; absent means only the line budget applies. */
    readonly stageMaxChars?: number;
    /** Tokens added to the cap so the model can think without eating the whole reply. */
    readonly reasoningReserveTokens?: number;
    readonly directorModel?: AgentModelChoiceView;
    readonly characterModel?: AgentModelChoiceView;
}
/** One provider route and its models, as served by `/tavern/models`. */
export interface ModelCatalogEntry {
    readonly provider: string;
    readonly name: string;
    readonly models: readonly {
        readonly id: string;
        readonly name: string;
    }[];
}
/** The response of `/tavern/agent`. */
interface AgentConfigSnapshot {
    readonly config: AgentConfigView;
    readonly defaults: AgentConfigView;
    readonly status: 'stored' | 'default';
}
/** Inclusive bounds, mirrored from the host so the inputs can clamp in place. */
export declare const AGENT_LIMITS: {
    readonly maxSpeechesPerBeat: {
        readonly min: 1;
        readonly max: 6;
        readonly step: 1;
        readonly unit: "个角色";
    };
    readonly stageWindow: {
        readonly min: 4;
        readonly max: 2000;
        readonly step: 10;
        readonly unit: "行";
    };
    readonly stageMaxChars: {
        readonly min: 1000;
        readonly max: 400000;
        readonly step: 1000;
        readonly unit: "字";
    };
    readonly loreScanLines: {
        readonly min: 4;
        readonly max: 2000;
        readonly step: 10;
        readonly unit: "行";
    };
    readonly loreMaxEntries: {
        readonly min: 1;
        readonly max: 200;
        readonly step: 1;
        readonly unit: "条";
    };
    readonly loreMaxChars: {
        readonly min: 200;
        readonly max: 400000;
        readonly step: 1000;
        readonly unit: "字";
    };
    readonly playerInputMax: {
        readonly min: 200;
        readonly max: 120000;
        readonly step: 1000;
        readonly unit: "字";
    };
    readonly maxReplyChars: {
        readonly min: 20;
        readonly max: 8000;
        readonly step: 20;
        readonly unit: "字";
    };
    readonly reasoningReserveTokens: {
        readonly min: 0;
        readonly max: 16000;
        readonly step: 64;
        readonly unit: "token";
    };
};
/**
 * Context budget presets, mirrored from the host.
 *
 * The shipped defaults were sized for a small window; these scale up to what a
 * 1M-token context can actually use.
 */
export declare const CONTEXT_PRESETS: {
    readonly compact: {
        readonly label: "精简";
        readonly stageWindow: 40;
        readonly loreScanLines: 20;
        readonly loreMaxEntries: 8;
        readonly loreMaxChars: 6000;
        readonly playerInputMax: 8000;
    };
    readonly standard: {
        readonly label: "标准";
        readonly stageWindow: 200;
        readonly loreScanLines: 60;
        readonly loreMaxEntries: 24;
        readonly loreMaxChars: 40000;
        readonly playerInputMax: 20000;
    };
    readonly roomy: {
        readonly label: "充裕";
        readonly stageWindow: 800;
        readonly loreScanLines: 200;
        readonly loreMaxEntries: 80;
        readonly loreMaxChars: 160000;
        readonly playerInputMax: 60000;
    };
    readonly extreme: {
        readonly label: "极限";
        readonly stageWindow: 2000;
        readonly loreScanLines: 500;
        readonly loreMaxEntries: 200;
        readonly loreMaxChars: 400000;
        readonly playerInputMax: 120000;
    };
};
type ContextPresetId = keyof typeof CONTEXT_PRESETS;
/**
 * Which preset a config currently matches.
 * @param config - current settings.
 * @returns the preset id, or `undefined` for a custom mix.
 */
export declare function contextPresetOf(config: AgentConfigView): ContextPresetId | undefined;
/** Read one workspace's agent settings. */
export declare function fetchAgentConfig(workspaceId: string): Promise<AgentConfigSnapshot>;
/** Persist one workspace's agent settings, or reset them to the defaults. */
export declare function saveAgentConfig(workspaceId: string, body: {
    config: AgentConfigView;
} | {
    reset: true;
}): Promise<AgentConfigSnapshot>;
/** Read the provider/model catalog for the model pickers. */
export declare function fetchModelCatalog(): Promise<readonly ModelCatalogEntry[]>;
/** Which sub-page the panel shows. */
export type AgentTab = 'beat' | 'context' | 'models' | 'reply';
/** One sub-page of the panel: a title, a one-line purpose, and its fields. */
export interface AgentTabSpec {
    readonly id: AgentTab;
    readonly label: string;
    readonly hint: string;
    readonly fields: readonly (keyof AgentConfigView)[];
}
/**
 * The panel's sub-pages.
 *
 * Every setting belongs to exactly one page, so the strip doubles as a table of
 * contents and a reader never scrolls past settings they did not open it for.
 * `fields` drives the unsaved-edit dot on each tab.
 */
export declare const AGENT_TABS: readonly AgentTabSpec[];
/**
 * Whether two settings are equivalent.
 * @param left - one config.
 * @param right - the other config.
 * @returns whether every setting matches, ignoring record key order.
 */
export declare function agentConfigEqual(left: AgentConfigView, right: AgentConfigView): boolean;
/**
 * Whether one sub-page holds edits that are not persisted yet.
 * @param config - the edited config.
 * @param saved - the last persisted config.
 * @param fields - the sub-page's fields.
 * @returns whether any of those fields differ from the persisted value.
 */
export declare function agentTabChanged(config: AgentConfigView, saved: AgentConfigView, fields: readonly (keyof AgentConfigView)[]): boolean;
/** Props of the agent orchestration panel. */
export interface AgentPanelProps {
    readonly workspaceId: string;
    readonly workspaceTitle: string;
    readonly workspacePath: string;
}
/**
 * Edit one workspace's agent orchestration settings.
 * @param props - the workspace the toolbox opened for.
 * @returns the settings panel.
 */
export declare function AgentPanel(props: AgentPanelProps): ReactElement;
export {};
