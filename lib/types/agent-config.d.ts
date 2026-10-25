/** File name inside the tavern state directory. */
export declare const AGENT_CONFIG_FILE = "agent.json";
/** Schema version this build reads and writes. */
export declare const AGENT_CONFIG_SCHEMA = 1;
/** One role's model selection; both fields are required together. */
export interface AgentModelChoice {
    /** Registered provider route. */
    readonly provider: string;
    /** Model id the route accepts. */
    readonly model: string;
    /** Adapter-owned reasoning-effort id; omitted follows the session. */
    readonly reasoningEffort?: string;
}
/** What the director's unresolvable speaker reference falls back to. */
export type UnknownSpeakerPolicy = 'none' | 'first';
/**
 * Approximate tokens per Chinese character.
 *
 * DeepSeek's tokenizer spends about 0.6 token per Chinese character, so a
 * character budget is divided by this to get the enforced `maxTokens`. The
 * figure is an approximation on purpose: the panel speaks in characters because
 * that is what an author counts, and the provider's cap is in tokens.
 */
export declare const TOKENS_PER_CHAR = 0.6;
/**
 * Convert a character budget to the token cap handed to the provider.
 * @param chars - budget in characters.
 * @returns the token cap, at least 1.
 */
export declare function tokensForChars(chars: number): number;
/** One workspace's agent orchestration settings. */
export interface TavernAgentConfig {
    readonly schema: number;
    /** Character speeches one player turn may produce. */
    readonly maxSpeechesPerBeat: number;
    /** Staged lines every prompt carries. */
    readonly stageWindow: number;
    /**
     * Character cap on the staged transcript every prompt carries.
     *
     * Absent means only {@link stageWindow} bounds it. A line budget alone stops
     * being predictable once it is large enough for long narration lines to add
     * up, so a 1M-context workspace can cap characters instead of guessing how
     * many lines fit.
     */
    readonly stageMaxChars?: number;
    /** Recent stage lines the worldbook scan covers. */
    readonly loreScanLines: number;
    /** Worldbook entries one request may inject. */
    readonly loreMaxEntries: number;
    /** Worldbook characters one request may inject. */
    readonly loreMaxChars: number;
    /** Player utterance length forwarded to the model. */
    readonly playerInputMax: number;
    /** Tell the director to alternate speakers. */
    readonly rotateSpeakers: boolean;
    /**
     * Route to the character the player names, ahead of the director's pick.
     *
     * On by default: the client pre-fills the composer with a speaker's name when
     * the player clicks it in a transcript bubble, and that affordance is only
     * honest if naming someone actually addresses them.
     */
    readonly honorPlayerMention: boolean;
    /** Fallback when the director names someone who is not in the cast. */
    readonly unknownSpeaker: UnknownSpeakerPolicy;
    /**
     * Reply budget in characters for every call that has no override.
     *
     * Absent means the adapter's own default: the orchestrator sends no
     * `maxTokens`, so the provider applies its model limit.
     */
    readonly maxReplyChars?: number;
    /** Director reply budget in characters; overrides {@link maxReplyChars}. */
    readonly directorMaxReplyChars?: number;
    /** Per-character reply budgets, keyed by card id; overrides {@link maxReplyChars}. */
    readonly characterMaxReplyChars?: Readonly<Record<string, number>>;
    /**
     * Tokens added to a reply cap to leave room for the model's reasoning.
     *
     * The provider's `max_tokens` bounds thinking and answer together, so a cap
     * that only covers the wanted characters leaves a reasoning model with no
     * room to answer at all. Defaults to {@link DEFAULT_REASONING_RESERVE}.
     */
    readonly reasoningReserveTokens?: number;
    /** Director model; omitted follows the session's model. */
    readonly directorModel?: AgentModelChoice;
    /** Character model; omitted follows the session's model. */
    readonly characterModel?: AgentModelChoice;
}
/**
 * Inclusive bounds enforced on every field.
 *
 * Both official models declare a 1,048,576-token window, and DeepSeek's
 * tokenizer spends about 0.6 token per Chinese character, so the whole window
 * holds roughly 1.7M characters. The ceilings below let the largest preset use
 * most of that while leaving room for the system prompt, the card, and the reply.
 */
export declare const AGENT_CONFIG_LIMITS: {
    readonly maxSpeechesPerBeat: {
        readonly min: 1;
        readonly max: 6;
    };
    readonly stageWindow: {
        readonly min: 4;
        readonly max: 20000;
    };
    readonly stageMaxChars: {
        readonly min: 1000;
        readonly max: 1200000;
    };
    readonly loreScanLines: {
        readonly min: 4;
        readonly max: 20000;
    };
    readonly loreMaxEntries: {
        readonly min: 1;
        readonly max: 200;
    };
    readonly loreMaxChars: {
        readonly min: 200;
        readonly max: 600000;
    };
    readonly playerInputMax: {
        readonly min: 200;
        readonly max: 400000;
    };
    readonly maxReplyChars: {
        readonly min: 20;
        readonly max: 8000;
    };
    readonly reasoningReserveTokens: {
        readonly min: 0;
        readonly max: 16000;
    };
};
/** One context-budget preset: the five budget fields plus an optional character cap. */
export interface ContextPreset {
    readonly label: string;
    readonly stageWindow: number;
    readonly stageMaxChars?: number;
    readonly loreScanLines: number;
    readonly loreMaxEntries: number;
    readonly loreMaxChars: number;
    readonly playerInputMax: number;
}
/**
 * Context budget presets, from the shipped defaults to one sized for the full
 * 1M-token window.
 *
 * `full` spends roughly 480k tokens on the stage and 180k on lore at typical
 * line lengths — about two thirds of a 1M window — leaving the balance for the
 * system prompt, the card, and the reply. It carries character caps because a
 * line budget alone stops being predictable once it is this large: a few long
 * narration lines could otherwise reach the window on their own.
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
        readonly stageMaxChars: 400000;
        readonly loreScanLines: 500;
        readonly loreMaxEntries: 200;
        readonly loreMaxChars: 400000;
        readonly playerInputMax: 120000;
    };
    readonly full: {
        readonly label: "满窗口";
        readonly stageWindow: 8000;
        readonly stageMaxChars: 800000;
        readonly loreScanLines: 3000;
        readonly loreMaxEntries: 200;
        readonly loreMaxChars: 300000;
        readonly playerInputMax: 200000;
    };
};
/** Which preset, if any, matches a budget; `undefined` when it is a custom mix. */
export declare function contextPresetOf(config: TavernAgentConfig): keyof typeof CONTEXT_PRESETS | undefined;
/**
 * Default reasoning headroom added to a reply cap.
 *
 * Observed on a reasoning model at the highest effort: a 240-token cap came
 * back as 240 output tokens with zero visible text, because thinking consumed
 * the whole allowance. 512 leaves room for a typical reasoning pass and still
 * lets the character budget mean what it says.
 */
export declare const DEFAULT_REASONING_RESERVE = 512;
/** A stored config is structurally invalid. */
export declare class AgentConfigInvalidError extends Error {
    readonly path?: string | undefined;
    constructor(message: string, path?: string | undefined);
}
/** @param workspaceDir - tavern workspace root. @returns the config file path. */
export declare function agentConfigPath(workspaceDir: string): string;
/** @returns the config every workspace starts from. */
export declare function defaultAgentConfig(): TavernAgentConfig;
/**
 * Validate one config payload, filling absent fields from the defaults.
 * @param value - candidate config, however malformed.
 * @returns the normalised config.
 * @throws AgentConfigInvalidError when a present field is invalid.
 */
export declare function normalizeAgentConfig(value: unknown): TavernAgentConfig;
/**
 * Reply budget one role actually gets.
 *
 * The per-role override wins, then the shared budget, and an absent result
 * means the adapter's own model limit applies.
 * @param config - workspace settings.
 * @param role - which call is being measured.
 * @param cardId - character card id, for a character call.
 * @returns the budget in characters, or `undefined` for no cap.
 */
export declare function replyBudgetChars(config: TavernAgentConfig, role: 'director' | 'character', cardId?: string): number | undefined;
/**
 * Provider token cap for one reply budget, including reasoning headroom.
 *
 * `max_tokens` bounds thinking and answer together; without the reserve a
 * reasoning model spends the whole cap thinking and returns no text.
 * @param chars - reply budget in characters.
 * @param reserveTokens - reasoning headroom from the config.
 * @returns the cap to send as `maxTokens`.
 */
export declare function replyCapTokens(chars: number, reserveTokens: number | undefined): number;
/**
 * Read one workspace's config.
 * @param workspaceDir - tavern workspace root.
 * @returns the stored config, or the defaults when absent.
 * @throws AgentConfigInvalidError when the file is unusable.
 */
export declare function readAgentConfig(workspaceDir: string): Promise<TavernAgentConfig>;
/**
 * Persist one workspace's config atomically (temporary file then rename).
 * @param workspaceDir - tavern workspace root.
 * @param value - full config payload, validated before writing.
 * @returns the stored config.
 */
export declare function writeAgentConfig(workspaceDir: string, value: unknown): Promise<TavernAgentConfig>;
