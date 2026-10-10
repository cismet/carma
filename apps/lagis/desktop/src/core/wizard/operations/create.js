import { fetchFlurstueckArten, requireArt } from "../api";
import { FLURSTUECK_ART } from "../constants";
import { createFlurstueckForKey } from "./core";

// no Sperre needed: this action only writes rows that do not exist yet
export const createFlurstueck = async ({ key, isStaedtisch }, ctx) => {
  const arten = ctx.arten ?? (await fetchFlurstueckArten(ctx.jwt));
  const art = requireArt(
    arten,
    isStaedtisch ? FLURSTUECK_ART.STAEDTISCH : FLURSTUECK_ART.ABTEILUNG_IX
  );

  const created = await createFlurstueckForKey({ ...key, art }, ctx);

  return {
    message: ["Flurstück ", created, " konnte erfolgreich angelegt werden."],
    keys: [created],
  };
};
