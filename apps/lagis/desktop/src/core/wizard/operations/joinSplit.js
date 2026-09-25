import {
  deleteSchluessel,
  fetchFlurstueckArten,
  insertSchluessel,
  requireArt,
} from "../api";
import { FLURSTUECK_ART } from "../constants";
import { joinFlurstuecke } from "./join";
import { splitFlurstuecke } from "./split";

/**
 * Port of JoinSplitActionSteps + LagisBroker.joinSplitFlurstuecke —
 * "Flurstück zusammenlegen/teilen".
 *
 * Implemented exactly as in the Swing client: the members are merged into a
 * throw-away "pseudo" Flurstücksschlüssel, which is then split into the target
 * parcels. The pseudo key stays in the database as the hinge of the history
 * graph — the history view knows it and renders it as an unnamed node.
 */
export const joinSplitFlurstuecke = async ({ memberKeys, resultKeys }, ctx) => {
  const { jwt, accountName, journal } = ctx;

  const arten = ctx.arten ?? (await fetchFlurstueckArten(jwt));
  const pseudoArt = requireArt(arten, FLURSTUECK_ART.PSEUDO);

  const pseudoId = await insertSchluessel(
    {
      fk_flurstueck_art: pseudoArt.id,
      ist_gesperrt: false,
      war_staedtisch: false,
      letzter_bearbeiter: accountName,
      letzte_bearbeitung: new Date().toISOString(),
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
    warStaedtisch: false,
    gueltigBis: null,
  };

  await joinFlurstuecke({ memberKeys, resultKey: pseudoKey }, ctx);

  // the new parcels inherit the Flurstücksart of the first merged parcel,
  // not the pseudo one they technically descend from
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
