/**
 * A click fired for one particular feature.
 *
 * An addon that picks a feature by clicking it where it is drawn (so the host
 * answers with its usual info box) cannot always find a point where that
 * feature is the topmost hit: icons drawn with overlap stack up at low zoom,
 * and the host would answer for whichever one lies on top. The addon names the
 * feature it means on the DOM event, and the engine moves that feature's hits
 * to the front of the click's hits before handing them on, so the host picks it
 * the way it picks the topmost hit of any other click.
 *
 * Kept on the event rather than on the map, like a claim (see clickClaims.ts),
 * so a target cannot outlive the click it was made for.
 */

export type ClickTarget = {
  source: string;
  sourceLayer?: string;
  id: string | number;
};

const TARGET_KEY = "__carmaClickTarget";

/** Name the feature a DOM click is meant for. */
export const targetClick = (event: Event, target: ClickTarget): void => {
  (event as unknown as Record<string, unknown>)[TARGET_KEY] = target;
};

/** The feature a click was fired for, if an addon named one. */
export const getClickTarget = (
  event: Event | null | undefined
): ClickTarget | null =>
  ((event as unknown as Record<string, unknown> | null | undefined)?.[
    TARGET_KEY
  ] as ClickTarget | undefined) ?? null;

/**
 * The hits with the target's own first, in their order, followed by the rest
 * in theirs. Without a target, or when the target is not among them, the hits
 * come back as they were.
 */
export const preferClickTarget = <
  T extends { source: string; sourceLayer?: string; id?: string | number },
>(
  hits: T[],
  target: ClickTarget | null
): T[] => {
  if (!target) {
    return hits;
  }
  const isTarget = (hit: T) =>
    hit.source === target.source &&
    hit.id != null &&
    String(hit.id) === String(target.id) &&
    (!target.sourceLayer || hit.sourceLayer === target.sourceLayer);
  const own = hits.filter(isTarget);
  if (own.length === 0) {
    return hits;
  }
  return [...own, ...hits.filter((hit) => !isTarget(hit))];
};
