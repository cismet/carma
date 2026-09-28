import {
  deleteSchluessel,
  fetchFlurstueckArten,
  insertSchluessel,
  requireArt,
  toTimestamp,
} from "../api";
import { FLURSTUECK_ART } from "../constants";
import { joinFlurstuecke } from "./join";
import { splitFlurstuecke } from "./split";

// merged into a pseudo key, then split; the key stays as a history node
export const joinSplitFlurstuecke = async ({ memberKeys, resultKeys }, ctx) => {
  const { jwt, accountName, journal } = ctx;

  const arten = ctx.arten ?? (await fetchFlurstueckArten(jwt));
  const pseudoArt = requireArt(arten, FLURSTUECK_ART.PSEUDO);

  const created = new Date();
  const pseudoId = await insertSchluessel(
    {
      fk_flurstueck_art: pseudoArt.id,
      ist_gesperrt: false,
      datum_entstehung: toTimestamp(created),
      letzter_bearbeiter: accountName,
      letzte_bearbeitung: toTimestamp(created),
    },
    jwt
  );
  journal.record("Anlegen des Pseudo-Flurstücksschlüssels", () =>
    deleteSchluessel(pseudoId, jwt)
  );

  const pseudoKey = {
    id: pseudoId,
    art: pseudoArt,
    gemarkung: undefined,
    flur: undefined,
    zaehler: undefined,
    nenner: undefined,
    warStaedtisch: null,
    gueltigBis: null,
  };

  await joinFlurstuecke({ memberKeys, resultKey: pseudoKey }, ctx);

  // inherit the first merged parcel's Flurstücksart, not the pseudo key's
  const inheritedArt = memberKeys[0]?.art;
  const split = await splitFlurstuecke(
    {
      key: pseudoKey,
      resultKeys: resultKeys.map((key) => ({
        ...key,
        art: key.art ?? inheritedArt,
      })),
    },
    ctx
  );

  return {
    message: `${memberKeys.length} Flurstücke wurden erfolgreich zusammengelegt und in ${split.keys.length} Flurstücke aufgeteilt.`,
    from: memberKeys,
    to: split.keys,
    keys: split.keys,
  };
};
