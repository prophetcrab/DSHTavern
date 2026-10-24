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
export function beatLogFromRecord(beat, playerInput, models) {
    const turns = beat.turns ?? [];
    if (turns.length === 0)
        return undefined;
    const calls = [];
    let step = 0;
    for (const turn of turns) {
        const directorModel = turn.directorModel === undefined
            ? models.director ?? '未知'
            : `${turn.directorModel.provider}/${turn.directorModel.model}`;
        calls.push({
            role: 'director',
            model: directorModel,
            system: turn.directorSystem,
            // The first director call is the one that reads the player's own words;
            // later calls in the same beat ask whether the scene continues.
            message: step === 0
                ? playerInput.length === 0 ? '（玩家保持了沉默）' : playerInput
                : '（继续这一幕。）',
            reply: turn.directorRawReply ?? turn.directorReply,
        });
        step += 1;
        // A repair call is a real request with its own system prompt and answer;
        // logging only the final JSON would hide what the first call actually sent.
        if (turn.repairSystem !== undefined) {
            calls.push({
                role: 'director',
                model: directorModel,
                system: turn.repairSystem,
                message: turn.repairMessage ?? '把它转成 JSON。',
                reply: turn.directorReply,
            });
            step += 1;
        }
        const speaker = turn.effectiveSpeaker;
        if (speaker === undefined || turn.characterSystem === undefined)
            continue;
        calls.push({
            role: 'character',
            cardId: speaker.id,
            name: speaker.name,
            model: turn.characterModel === undefined
                ? models.characters.get(speaker.id) ?? models.director ?? '未知'
                : `${turn.characterModel.provider}/${turn.characterModel.model}`,
            system: turn.characterSystem,
            message: turn.characterPromptMessages?.[0]?.text ?? '',
            reply: turn.speech ?? '',
        });
        step += 1;
    }
    const inner = turns[0]?.decision.inner.trim() ?? '';
    return {
        at: beat.at,
        ...(beat.turn === undefined ? {} : { turn: beat.turn }),
        playerInput,
        calls,
        ...(beat.regeneratedFrom === undefined ? {} : { regeneratedFrom: beat.regeneratedFrom }),
        ...(inner.length === 0 ? {} : { inner }),
    };
}
