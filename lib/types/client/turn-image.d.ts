import type { ReactElement } from 'react';
import type { TurnActionsProps } from './regenerate.js';
/** Props are the turn-tail slot's standard props. */
export type TavernTurnImageProps = TurnActionsProps;
/**
 * Render the image strip for one turn.
 * @param props - owning turn, session identity, and the standard hooks.
 * @returns thumbnails/action, or `null` outside a tavern or when the feature is off.
 */
export declare function TavernTurnImage(props: TavernTurnImageProps): ReactElement | null;
