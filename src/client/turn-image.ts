/**
 * Scene images under one tavern turn.
 *
 * The strip shows thumbnails for images already generated for this turn and,
 * on the newest closed turn, opens the prompt workshop. It never starts a
 * generation by itself; the workshop requires a separate approval and click.
 */
import { createElement, useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import type { ReactElement } from 'react'
import {
  ensureTaverns,
  matchTavernWorkspace,
  readToolboxState,
  subscribeToolboxState,
} from './toolbox.js'
import type { TurnActionsProps } from './regenerate.js'
import {
  ImageWorkshop,
  ensureSceneImages,
  sceneImageUrl,
  useImageAvailability,
  useImageConfig,
  useSceneImages,
} from './image.js'

/** Props are the turn-tail slot's standard props. */
export type TavernTurnImageProps = TurnActionsProps

/**
 * Render the image strip for one turn.
 * @param props - owning turn, session identity, and the standard hooks.
 * @returns thumbnails/action, or `null` outside a tavern or when the feature is off.
 */
export function TavernTurnImage(props: TavernTurnImageProps): ReactElement | null {
  const availability = useImageAvailability()
  const [station, setStation] = useState<{ workspaceId: string } | null>(null)
  const [open, setOpen] = useState(false)
  const cwd = props.useSessions(list => list.byId[props.sessionId]?.cwd) as string | undefined
  const newestTurn = props.useChat((snapshot) => {
    const order = snapshot.timeline?.turnOrder
    return order === undefined || order.length === 0 ? undefined : order[order.length - 1]
  }) as number | undefined
  const toolbox = useSyncExternalStore(subscribeToolboxState, readToolboxState, readToolboxState)

  useEffect(() => {
    ensureTaverns()
    const match = matchTavernWorkspace(cwd, toolbox.taverns)
    setStation(match === null ? null : { workspaceId: match.workspaceId })
  }, [cwd, toolbox.taverns])

  useEffect(() => {
    const sync = (): void => {
      const match = matchTavernWorkspace(cwd, readToolboxState().taverns)
      setStation(match === null ? null : { workspaceId: match.workspaceId })
    }
    return subscribeToolboxState(sync)
  }, [cwd])

  const workspaceId = station?.workspaceId ?? ''
  const config = useImageConfig(workspaceId, props.sessionId)
  const images = useSceneImages(workspaceId, props.sessionId)
  const refresh = useCallback(() => {
    if (workspaceId.length > 0) ensureSceneImages(workspaceId, props.sessionId, true)
  }, [props.sessionId, workspaceId])

  if (station === null || availability !== 'on' || props.turn.status !== 'closed') return null
  const turnImages = images.data?.images.filter(image => image.turn === props.turn.turn) ?? []
  const latest = newestTurn === props.turn.turn
  const enabled = config.data?.config.enabled === true
  if (turnImages.length === 0 && (!latest || !enabled)) return null

  return createElement('div', { className: 'dshtavern-image-turn' },
    turnImages.length === 0
      ? null
      : createElement('div', { className: 'dshtavern-image-turn-strip' },
        turnImages.map(image => createElement('a', {
          key: image.id,
          href: sceneImageUrl(workspaceId, props.sessionId, image),
          target: '_blank',
          rel: 'noreferrer',
          title: '查看原图',
        }, createElement('img', {
          src: sceneImageUrl(workspaceId, props.sessionId, image),
          alt: `第 ${image.turn} 轮的场景图`,
          loading: 'lazy',
        })))),
    latest && enabled
      ? createElement('div', { className: 'dshtavern-image-turn-actions' },
        createElement('button', {
          type: 'button',
          className: 'dshtavern-image-turn-action',
          onClick: () => setOpen(value => !value),
        }, open ? '收起生图' : turnImages.length === 0 ? '画一张' : '再画一张'))
      : null,
    open
      ? createElement(ImageWorkshop, {
        workspaceId,
        sessionId: props.sessionId,
        mode: 'scene',
        turn: props.turn.turn,
        compact: true,
        onGenerated: refresh,
      })
      : null)
}
