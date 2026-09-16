import {
  ActionNotSuccessfulError,
  deleteHistoryEdge,
  deleteNutzung,
  fetchFlurstueckBySchluesselId,
  fetchNutzungenForFlurstueck,
  insertHistoryEdge,
  insertNutzung,
  moveArBaeume,
  moveArVertraege,
  moveDmsUrl,
  moveVerwaltungsbereichEintrag,
  updateFlurstueck,
} from "../api";
import { formatKey } from "../keys";
import { acquireLock, releaseLock } from "../locks";
import { createFlurstueckForKey, hasHistoryEntry, setHistoricForKey } from "./core";
import { buildNutzungClone } from "./nutzungClone";

/**
 * Port of RenameActionSteps + LagisBroker.renameFlurstueck —
 * "Flurstück umbenennen".
 *
 * The old parcel is kept and set historic; everything hanging off it either
 * moves to the new parcel (documents, contracts, trees, administrative areas)
 * or is copied (Nutzungen, because the old ones stay as the historic record).
 * The order below is the one from the Swing client and matters: the Nutzungen
 * have to be copied before the old parcel is closed, otherwise the copies
 * would already be historic.
 */
export const renameFlurstueck = async ({ oldKey, newKey }, ctx) => {
  const { jwt, accountName, journal, currentKeyString } = ctx;
  const oldKeyString = formatKey(oldKey);

  const oldFlurstueck = await fetchFlurstueckBySchluesselId(oldKey.id, jwt);
  if (!oldFlurstueck) {
    throw new ActionNotSuccessfulError("Altes Flurstück existiert nicht.");
  }

  const lock = await acquireLock(oldKey.id, {
    jwt,
    accountName,
    contextKeyString: currentKeyString,
    keyString: oldKeyString,
  });

  try {
    if (await hasHistoryEntry(oldFlurstueck.id, jwt)) {
      throw new ActionNotSuccessfulError(
        "Es existieren bereits Historieneinträge für dieses Flurstück."
      );
    }

    // the renamed parcel keeps the Flurstücksart of the old one
    const created = await createFlurstueckForKey(
      { ...newKey, art: newKey.art ?? oldKey.art },
      ctx
    );
    const newKeyString = formatKey(created);

    const edgeId = await insertHistoryEdge(
      oldFlurstueck.id,
      created.flurstueckId,
      jwt
    );
    journal.record(
      `Historieneintrag "${oldKeyString}" → "${newKeyString}"`,
      () => deleteHistoryEdge(edgeId, jwt)
    );

    await moveArBaeume(oldFlurstueck.id, created.flurstueckId, jwt);
    journal.record(`Verschieben der Bäume nach "${newKeyString}"`, () =>
      moveArBaeume(created.flurstueckId, oldFlurstueck.id, jwt)
    );

    await moveArVertraege(oldFlurstueck.id, created.flurstueckId, jwt);
    journal.record(`Verschieben der Verträge nach "${newKeyString}"`, () =>
      moveArVertraege(created.flurstueckId, oldFlurstueck.id, jwt)
    );

    for (const dms of oldFlurstueck.dmsUrls) {
      await moveDmsUrl(dms.id, created.flurstueckId, jwt);
      journal.record(`Verschieben des Dokuments ${dms.id}`, () =>
        moveDmsUrl(dms.id, oldFlurstueck.id, jwt)
      );
    }

    const nutzungen = await fetchNutzungenForFlurstueck(oldFlurstueck.id, jwt);
    for (const nutzung of nutzungen) {
      const cloneId = await insertNutzung(
        buildNutzungClone(nutzung, created.flurstueckId),
        jwt
      );
      journal.record(`Kopie der Nutzung ${nutzung.id}`, () =>
        deleteNutzung(cloneId, jwt)
      );
    }

    // only now, so the copies above were taken from the still-active parcel
    await setHistoricForKey(oldKey, new Date(), undefined, ctx);

    for (const eintrag of oldFlurstueck.verwaltungsbereichEintraege) {
      await moveVerwaltungsbereichEintrag(eintrag.id, created.flurstueckId, jwt);
      journal.record(`Verschieben des Verwaltungsbereichs ${eintrag.id}`, () =>
        moveVerwaltungsbereichEintrag(eintrag.id, oldFlurstueck.id, jwt)
      );
    }

    await updateFlurstueck(
      created.flurstueckId,
      {
        fk_spielplatz: oldFlurstueck.spielplatzId ?? null,
        bemerkung: oldFlurstueck.bemerkung ?? null,
        in_stadtbesitz: oldFlurstueck.inStadtbesitz ?? null,
      },
      jwt
    );

    return {
      message: `Flurstück "${oldKeyString}" konnte erfolgreich in "${newKeyString}" umbenannt werden.`,
      keys: [created],
    };
  } finally {
    await releaseLock(lock, jwt);
  }
};
