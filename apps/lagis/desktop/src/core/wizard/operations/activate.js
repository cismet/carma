import {
  ActionNotSuccessfulError,
  fetchFlurstueckBySchluesselId,
  fetchNutzungenForFlurstueck,
  toTimestamp,
  updateNutzung,
  updateNutzungBuchung,
  updateSchluessel,
} from "../api";
import { FLURSTUECK_ART } from "../constants";
import { formatKey } from "../keys";
import { acquireLock, releaseLock } from "../../editing/locks";
import { hasHistoryEntry } from "./core";

const byValidity = (a, b) =>
  new Date(a.gueltig_von) - new Date(b.gueltig_von) || a.id - b.id;

// "historisch setzen" closed the last Buchung of every active Nutzung at the
// parcel end, so exactly those are reopened. Older Buchungen it moved to that
// end lost their own end date and stay closed.
const reopenNutzungen = async (flurstueckId, end, ctx) => {
  const { jwt, journal } = ctx;
  const endTime = new Date(end).getTime();
  const nutzungen = await fetchNutzungenForFlurstueck(flurstueckId, jwt);
  for (const nutzung of nutzungen) {
    const last = [...(nutzung.nutzung_buchungArrayRelationShip ?? [])]
      .sort(byValidity)
      .at(-1);
    if (!last?.gueltig_bis) {
      continue;
    }
    if (new Date(last.gueltig_bis).getTime() !== endTime) {
      continue;
    }
    await updateNutzungBuchung(last.id, { gueltig_bis: null }, jwt);
    journal.record(`Gültigkeit der Nutzungsbuchung ${last.id}`, () =>
      updateNutzungBuchung(last.id, { gueltig_bis: last.gueltig_bis }, jwt)
    );
    if (nutzung.historisch) {
      await updateNutzung(nutzung.id, { historisch: false }, jwt);
      journal.record(`Aktivieren der Nutzung ${nutzung.id}`, () =>
        updateNutzung(nutzung.id, { historisch: true }, jwt)
      );
    }
  }
};

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
    if (flurstueck) {
      await reopenNutzungen(flurstueck.id, key.gueltigBis, ctx);
    }

    return {
      message: ["Flurstück ", key, " konnte erfolgreich aktiviert werden."],
      keys: [{ ...key, gueltigBis: null }],
    };
  } finally {
    await releaseLock(lock, jwt);
  }
};
