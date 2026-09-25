import {
  ActionNotSuccessfulError,
  fetchFlurstueckBySchluesselId,
  toTimestamp,
  updateSchluessel,
} from "../api";
import { FLURSTUECK_ART } from "../constants";
import { formatKey } from "../keys";
import { acquireLock, releaseLock } from "../locks";
import { hasHistoryEntry } from "./core";

/**
 * Port of ActivateActionSteps + LagisBroker.setFlurstueckActive —
 * "Flurstück aktivieren".
 */
export const activateFlurstueck = async ({ key }, ctx) => {
  const { jwt, accountName, journal, currentKeyString } = ctx;
  const keyString = formatKey(key);

  if (!key.gueltigBis) {
    throw new ActionNotSuccessfulError("Das Flurstück war aktiv.");
  }
  if (!key.art?.bezeichnung) {
    throw new ActionNotSuccessfulError(
      "Das Flurstück kann nicht aktiviert werden, weil es keine Flurstücksart besitzt."
    );
  }

  const lock = await acquireLock(key.id, {
    jwt,
    accountName,
    contextKeyString: currentKeyString,
    keyString,
  });

  try {
    const flurstueck = await fetchFlurstueckBySchluesselId(key.id, jwt);
    if (flurstueck && (await hasHistoryEntry(flurstueck.id, jwt))) {
      throw new ActionNotSuccessfulError(
        "Das Flurstück kann nicht aktiviert werden, weil es Nachfolger hat."
      );
    }

    const previous = {
      gueltig_bis: key.gueltigBis ?? null,
      datum_entstehung: key.datumEntstehung ?? null,
      datum_letzter_stadtbesitz: key.datumLetzterStadtbesitz ?? null,
    };

    // A städtisch parcel that comes back gets fresh creation/ownership dates.
    const reactivationDates =
      key.art.bezeichnung === FLURSTUECK_ART.STAEDTISCH
        ? {
            datum_entstehung: toTimestamp(new Date()),
            datum_letzter_stadtbesitz: toTimestamp(new Date()),
          }
        : {};

    await updateSchluessel(
      key.id,
      { gueltig_bis: null, ...reactivationDates },
      jwt,
      accountName
    );
    journal.record(`Aktivieren von "${keyString}"`, () =>
      updateSchluessel(key.id, previous, jwt, accountName)
    );

    return {
      message: `Flurstück "${keyString}" konnte erfolgreich aktiviert werden.`,
      keys: [{ ...key, gueltigBis: null }],
    };
  } finally {
    await releaseLock(lock, jwt);
  }
};
