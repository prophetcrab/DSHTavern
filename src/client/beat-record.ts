/**
 * Trajectory record for one tavern beat's prompts.
 *
 * The host logs the director and character requests it built, because they
 * never pass through the agent loop's own system-prompt path. This module turns
 * each of those records into a Trajectory row: the collapsed row names the turn
 * and who spoke, and the details pane shows every request that produced it.
 *
 * The row is emitted as a `context` node so the shipped Trajectory layout and
 * details panel render it without any target changes on our side.
 */
import type { Context } from '@deepseek-ai/cordis'
import type {
  ContextMessageNode, ConversationNodeContext, ConversationNodeDefinition,
} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { TrajectoryConversationViewNode } from '@deepseek-ai/dsh-client-ui-trajectory/client'
import { BEAT_RECORD_TYPE, parseBeatLog, renderBeatLogText, summarizeBeatLog } from '../beat-log.js'

/** Source kind the row reports as its producer. */
export const BEAT_SOURCE_KIND = 'dshtavern-beat'

/** State one record keeps: the rendered node and its row summary. */
interface BeatRowState {
  readonly node: ContextMessageNode
  readonly summary: string
}

/**
 * Read the plugin record out of one event.
 * @param event - any dispatched event.
 * @returns the parsed record, or `undefined` for every other event.
 */
function beatOf(event: { readonly type: string; readonly data: unknown }): ReturnType<typeof parseBeatLog> {
  if (event.type !== BEAT_RECORD_TYPE) return undefined
  return parseBeatLog(event.data)
}

/** Trajectory Definition rendering one beat's logged prompts. */
export const tavernBeatDefinition: ConversationNodeDefinition<BeatRowState> = {
  kind: 'dshtavern-beat',
  target: 'trajectory',
  match: (event) => {
    if (event.type !== BEAT_RECORD_TYPE) return null
    // A plugin record carries no turn/step coordinates; `start` is the only
    // lifecycle role it can take.
    return { id: String(event.seq), role: 'start' }
  },
  start: (context: ConversationNodeContext<BeatRowState>, match) => {
    const beat = beatOf(match.event)
    if (beat === undefined) throw new Error('dshtavern-beat start requires a readable beat record')
    const summary = summarizeBeatLog(beat)
    return {
      summary,
      node: {
        kind: 'context',
        seq: match.event.seq,
        time: match.event.time,
        content: [{ type: 'text', text: renderBeatLogText(beat) }],
        source: { kind: BEAT_SOURCE_KIND, form: 'notice', summary },
        producer: { role: 'inject', label: 'DSH-Tavern' },
        form: 'notice',
      },
    }
  },
  update: context => context.state,
  buildViewNode: (context) => {
    const state = context.state
    if (state === undefined) return null
    const node: TrajectoryConversationViewNode = {
      key: context.key,
      kind: context.kind,
      id: context.id,
      target: 'trajectory',
      anchorSeq: state.node.seq,
      location: context.start?.location ?? { kind: 'unresolved' },
      data: { kind: 'node', node: state.node },
    }
    return node
  },
}

/**
 * Register the tavern beat record with the Conversation registry.
 *
 * `uiConversation` is injected rather than required: a profile without the
 * Trajectory/Conversation client halves still loads the rest of the tavern UI,
 * it just has no trajectory tab to contribute to.
 * @param ctx - browser plugin context.
 */
export function installTavernBeatRecords(ctx: Context): void {
  ctx.inject(['uiConversation'], (scoped) => {
    const uiConversation = scoped.uiConversation as unknown as {
      events: { register: (definition: unknown) => () => void }
    }
    scoped.effect(() => uiConversation.events.register(tavernBeatDefinition), 'dshtavern: trajectory beat records')
  })
}
