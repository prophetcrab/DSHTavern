/**
 * Click a character's name in a speech bubble to reply to that character.
 *
 * The bubble is rendered from Markdown, so its markup belongs to the chat
 * renderer and no React handler can be attached to the name. This observes the
 * rendered transcript instead: every speech bubble starts with a bold-only
 * paragraph holding the speaker's name, and that paragraph is the click target.
 *
 * Replying means pre-filling the composer with the character's name, not
 * sending anything: the player still writes the line, and the tavern's
 * "player named a character" rule routes the answer to that character.
 */
import type { InputActions } from '@deepseek-ai/dsh-client-ui-conversation/client'

/** Attribute set on a speech bubble's name paragraph. */
export const REPLY_TARGET_ATTRIBUTE = 'data-dshtavern-reply'

/** Stylesheet element id, so a second install cannot duplicate the rules. */
const STYLE_ID = 'dshtavern-reply-targets'

/**
 * Prefix the composer receives when the player picks a speaker.
 *
 * Reads as an addressed line rather than a script-style speaker tag, so the
 * player finishes a sentence ("对白鹭说，你先别动") instead of writing dialogue
 * in a transcript format.
 * @param name - the speaker being addressed.
 * @returns the prefilled prefix, ending where the player starts typing.
 */
export function replyPrefix(name: string): string {
  return `对${name}说：`
}

/** Rules that make the name read as a control without moving anything. */
const REPLY_CSS = `
[${REPLY_TARGET_ATTRIBUTE}='true'] {
  cursor: pointer;
  border-radius: var(--dsw-radius-sm, 8px);
  transition: background 140ms ease;
}
[${REPLY_TARGET_ATTRIBUTE}='true']:hover {
  background: color-mix(in srgb, var(--dsw-alias-state-business-primary, #4f7fe0) 14%, transparent);
}
[${REPLY_TARGET_ATTRIBUTE}='true']:focus-visible {
  outline: 2px solid var(--dsw-alias-state-business-primary, #4f7fe0);
  outline-offset: 2px;
}
[${REPLY_TARGET_ATTRIBUTE}='true']::after {
  content: '回复';
  margin-inline-start: 6px;
  color: var(--dsw-alias-state-business-primary, #4f7fe0);
  font-size: 11px;
  font-weight: 400;
  opacity: 0;
  transition: opacity 140ms ease;
}
[${REPLY_TARGET_ATTRIBUTE}='true']:hover::after,
[${REPLY_TARGET_ATTRIBUTE}='true']:focus-visible::after {
  opacity: 1;
}
`

/**
 * Speaker name of the bubble one paragraph belongs to.
 *
 * The bubble is a blockquote whose first child paragraph holds only the name;
 * anything else in the transcript is narration or ordinary prose and is not a
 * reply target.
 * @param element - candidate paragraph.
 * @returns the name, or `undefined` when the element is not a bubble's name.
 */
export function speakerNameOf(element: Element): string | undefined {
  const quote = element.closest('blockquote')
  if (quote === null) return undefined
  const first = quote.firstElementChild
  if (first !== element) return undefined
  if (first.tagName !== 'P') return undefined
  const strong = first.querySelector(':scope > strong:only-child')
  const name = strong?.textContent?.trim() ?? ''
  return name.length > 0 ? name : undefined
}

/**
 * Mark every bubble name in the transcript as a reply target.
 *
 * Idempotent and cheap: it only touches attributes, so a re-render that drops
 * them is repaired by the next observation rather than patched in place.
 */
export function markReplyTargets(): void {
  if (typeof document === 'undefined') return
  for (const paragraph of document.querySelectorAll('blockquote > p:first-child')) {
    const name = speakerNameOf(paragraph)
    if (name === undefined) {
      paragraph.removeAttribute(REPLY_TARGET_ATTRIBUTE)
      continue
    }
    paragraph.setAttribute(REPLY_TARGET_ATTRIBUTE, 'true')
    paragraph.setAttribute('title', `回复${name}`)
    paragraph.setAttribute('role', 'button')
    paragraph.setAttribute('tabindex', '0')
  }
}

/**
 * Pre-fill the composer so the next line is addressed to one character.
 * @param actions - the session's public input actions.
 * @param name - speaker name to prefix.
 */
export function startReply(actions: InputActions | undefined, name: string): void {
  if (actions === undefined) return
  actions.setDraft(replyPrefix(name))
  // The composer is a contenteditable beside the slice that owns this handler;
  // focusing it is what lets the player type without a second click.
  const editor = document.querySelector<HTMLElement>('[contenteditable="true"]')
  if (editor === null) return
  editor.focus()
  const range = document.createRange()
  range.selectNodeContents(editor)
  range.collapse(false)
  const selection = window.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)
}

/**
 * Keep bubble names clickable for the life of one mounted session view.
 *
 * One delegated listener handles every bubble, including ones rendered later,
 * so scrolling through history needs no per-element bookkeeping.
 * @param actions - the session's public input actions.
 * @returns a disposer that stops observing and removes the listener.
 */
export function installReplyTargets(actions: InputActions | undefined): () => void {
  if (typeof document === 'undefined') return () => undefined
  if (document.getElementById(STYLE_ID) === null) {
    const style = document.createElement('style')
    style.id = STYLE_ID
    style.textContent = REPLY_CSS
    document.head.appendChild(style)
  }

  const activate = (target: EventTarget | null): void => {
    if (!(target instanceof Element)) return
    const paragraph = target.closest(`[${REPLY_TARGET_ATTRIBUTE}='true']`)
    if (paragraph === null) return
    const name = speakerNameOf(paragraph)
    if (name !== undefined) startReply(actions, name)
  }

  const onClick = (event: MouseEvent): void => { activate(event.target) }
  // A marked paragraph reports role=button, so Enter and Space must work too.
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    if (!(event.target instanceof Element)) return
    if (event.target.closest(`[${REPLY_TARGET_ATTRIBUTE}='true']`) === null) return
    event.preventDefault()
    activate(event.target)
  }

  document.addEventListener('click', onClick)
  document.addEventListener('keydown', onKeyDown)
  markReplyTargets()
  const observer = new MutationObserver(() => { markReplyTargets() })
  observer.observe(document.body, { childList: true, subtree: true })

  return () => {
    document.removeEventListener('click', onClick)
    document.removeEventListener('keydown', onKeyDown)
    observer.disconnect()
    document.getElementById(STYLE_ID)?.remove()
    for (const paragraph of document.querySelectorAll(`[${REPLY_TARGET_ATTRIBUTE}]`)) {
      paragraph.removeAttribute(REPLY_TARGET_ATTRIBUTE)
      paragraph.removeAttribute('title')
      paragraph.removeAttribute('role')
      paragraph.removeAttribute('tabindex')
    }
  }
}
