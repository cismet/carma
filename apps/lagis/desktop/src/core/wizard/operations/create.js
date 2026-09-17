import { fetchFlurstueckArten, requireArt } from "../api";
import { FLURSTUECK_ART } from "../constants";
import { formatKey } from "../keys";
import { createFlurstueckForKey } from "./core";

/**
 * Port of CreateActionSteps — "Flurstück einpflegen".
 *
 * Unlike every other action this one needs no Sperre: it only ever writes rows
 * that do not exist yet.
 */
export const createFlurstueck = async ({ key, isStaedtisch }, ctx) => {
  const arten = ctx.arten ?? (await fetchFlurstueckArten(ctx.jwt));
  const art = requireArt(
    arten,
    isStaedtisch ? FLURSTUECK_ART.STAEDTISCH : FLURSTUECK_ART.ABTEILUNG_IX
  );

  const created = await createFlurstueckForKey({ ...key, art }, ctx);

  return {
    message: `Flurstück "${formatKey(created)}" konnte erfolgreich angelegt werden.`,
    keys: [created],
  };
};
