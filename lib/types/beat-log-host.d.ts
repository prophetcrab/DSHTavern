/**
 * Host-side projection from a stored beat to the logged record.
 *
 * Split from `beat-log.ts` so the browser half can share the record schema and
 * its rendering without pulling in the orchestrator. This side is host-only: it
 * reads the prompts the orchestrator actually built.
 */
import type { BeatRecord } from './orchestrator.js';
import type { BeatLogInput } from './beat-log.js';
/** Provider/model labels the beat used. */
export interface BeatLogModels {
    /** Director call label; `undefined` when the call used the session route. */
    readonly director?: string;
    /** Character call labels by card id. */
    readonly characters: ReadonlyMap<string, string>;
}
/**
 * Project an internal beat record into the logged form.
 *
 * The beat file already carries every prompt; this reads the same fields the
 * orchestrator used, so the log and the file cannot disagree about what was
 * sent. One beat can run several director calls and one call per speaker, and
 * each of them is a separate request — every one is logged, including a format
 * repair call when the director ignored the output contract.
 * @param beat - record written beside the stage.
 * @param playerInput - player utterance the beat answered.
 * @param models - provider/model labels used for each call.
 * @returns the log input, or `undefined` when the beat ran no calls.
 */
export declare function beatLogFromRecord(beat: BeatRecord, playerInput: string, models: BeatLogModels): BeatLogInput | undefined;
