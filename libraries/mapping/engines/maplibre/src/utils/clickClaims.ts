/**
 * A click an addon has already answered.
 *
 * MapLibre hands a click to every listener in registration order, and the
 * engine's own listener came first: by the time an addon hears of the click,
 * the engine has queried its layers and asked the WMS services, and the info
 * box shows what it found. An addon that draws its own pickable things (a
 * fleet of vehicles, say) therefore claims the click on the DOM event before
 * MapLibre dispatches it, from a capture listener on the canvas container, and
 * the engine's listener steps aside when it finds the claim.
 *
 * Kept on the event rather than on the map, so a claim cannot outlive the
 * click it was made for.
 */

const CLAIM_KEY = "__carmaClaimedClick";

/** Mark a DOM click as answered; the engine's own selection leaves it alone. */
export const claimClick = (event: Event): void => {
  (event as unknown as Record<string, unknown>)[CLAIM_KEY] = true;
};

/** Whether an addon has answered this click already. */
export const isClickClaimed = (event: Event | null | undefined): boolean =>
  !!event && (event as unknown as Record<string, unknown>)[CLAIM_KEY] === true;
