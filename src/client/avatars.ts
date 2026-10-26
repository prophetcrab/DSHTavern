/**
 * Chat avatars for tavern speech bubbles.
 *
 * DSH's chat surface has no per-speaker avatar slot. The tavern already styles
 * a speech bubble as a quote whose first paragraph is the speaker's name, so
 * this observer appends an image beside that paragraph. It never edits the
 * transcript: when the strip unmounts or the portrait map is empty, the
 * decoration disappears.
 */
/** One card's active portrait, as served by `/tavern-image/portraits`. */
interface PortraitMapCard {
  readonly cardId?: unknown
  readonly name?: unknown
  readonly activeId?: unknown
  readonly url?: unknown
}

/** The map response. */
interface PortraitMapResponse {
  readonly cards?: unknown
}

/** Character display name to active portrait. */
type AvatarMap = ReadonlyMap<string, { readonly id: string; readonly url: string }>

/** Fetch the active-portrait map for one workspace. */
async function loadAvatarMap(workspaceId: string): Promise<AvatarMap> {
  const map = new Map<string, { id: string; url: string }>()
  try {
    const params = new URLSearchParams({ workspaceId })
    const response = await fetch(`/tavern-image/portraits?${params.toString()}`, {
      headers: { accept: 'application/json' },
      cache: 'no-store',
    })
    if (!response.ok) return map
    const body = await response.json() as PortraitMapResponse
    const cards = Array.isArray(body.cards) ? body.cards as PortraitMapCard[] : []
    const ambiguous = new Set<string>()
    for (const card of cards) {
      if (typeof card.name !== 'string' || typeof card.activeId !== 'string' || typeof card.url !== 'string') continue
      if (map.has(card.name)) {
        ambiguous.add(card.name)
        continue
      }
      map.set(card.name, { id: card.activeId, url: card.url })
    }
    for (const name of ambiguous) map.delete(name)
  } catch {
    // An unavailable image row simply means no avatars.
  }
  return map
}

/** Find the speaker name in a speech bubble, if the quote carries one. */
function speakerOf(blockquote: Element): string | undefined {
  const first = blockquote.firstElementChild
  if (first === null || first.tagName !== 'P') return undefined
  if (first.children.length !== 1) return undefined
  const strong = first.firstElementChild
  if (strong === null || strong.tagName !== 'STRONG') return undefined
  const text = strong.textContent?.trim() ?? ''
  return text.length === 0 ? undefined : text
}

/** Remove one decoration, leaving the quote as the renderer emitted it. */
function undecorate(blockquote: Element): void {
  blockquote.querySelector(':scope > img.dshtavern-avatar')?.remove()
  blockquote.classList.remove('dshtavern-has-avatar')
}

/** Apply the current map to every mounted speech bubble. */
function decorate(map: AvatarMap): void {
  const bubbles = document.querySelectorAll('body[data-dshtavern-story] blockquote')
  for (const bubble of bubbles) {
    const name = speakerOf(bubble)
    const portrait = name === undefined ? undefined : map.get(name)
    if (portrait === undefined) {
      undecorate(bubble)
      continue
    }
    const existing = bubble.querySelector(':scope > img.dshtavern-avatar')
    if (existing !== null && existing.getAttribute('data-dshtavern-avatar-for') === portrait.id) continue
    existing?.remove()
    const image = document.createElement('img')
    image.className = 'dshtavern-avatar'
    image.alt = ''
    image.loading = 'lazy'
    image.src = portrait.url
    image.setAttribute('data-dshtavern-avatar-for', portrait.id)
    bubble.appendChild(image)
    bubble.classList.add('dshtavern-has-avatar')
  }
}

/**
 * Install the avatar observer for one tavern session.
 * @param workspaceId - tavern workspace owning the session.
 * @returns a cleanup function.
 */
export function installTavernAvatars(workspaceId: string): () => void {
  let map: AvatarMap = new Map()
  let stopped = false
  let scheduled = false
  let frame = 0

  const schedule = (): void => {
    if (scheduled || stopped) return
    scheduled = true
    frame = window.requestAnimationFrame(() => {
      scheduled = false
      decorate(map)
    })
  }

  const refresh = (): void => {
    void loadAvatarMap(workspaceId).then(next => {
      if (stopped) return
      map = next
      schedule()
    })
  }

  const observer = new MutationObserver(schedule)
  observer.observe(document.body, { childList: true, subtree: true })
  const onPortraits = (): void => refresh()
  window.addEventListener('dshtavern:portraits-changed', onPortraits)
  window.addEventListener('dshtavern:images-changed', onPortraits)
  refresh()
  const timer = window.setInterval(refresh, 30_000)
  schedule()

  return () => {
    stopped = true
    observer.disconnect()
    window.removeEventListener('dshtavern:portraits-changed', onPortraits)
    window.removeEventListener('dshtavern:images-changed', onPortraits)
    window.clearInterval(timer)
    if (frame !== 0) window.cancelAnimationFrame(frame)
    for (const bubble of document.querySelectorAll('body[data-dshtavern-story] blockquote')) undecorate(bubble)
  }
}

