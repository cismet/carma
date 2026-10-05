import {
  ActionNotSuccessfulError,
  deleteHistoryEdge,
  deleteNutzung,
  fetchFlurstueckBySchluesselId,
  fetchNutzungenForFlurstueck,
  insertHistoryEdge,
  insertNutzung,
  moveDmsUrl,
  moveVerwaltungsbereichEintrag,
  saveFlurstueckArrays,
  updateFlurstueck,
} from "../api";
import { formatKey } from "../keys";
import { acquireLock, releaseLock } from "../../editing/locks";
import {
  createFlurstueckForKey,
  hasHistoryEntry,
  setHistoricForKey,
} from "./core";
import { buildNutzungClone } from "./nutzungClone";

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

    // cids persists an array property as a whole: one call per side
    const movedArrays = {
      ar_vertraegeArray: oldFlurstueck.arVertraege,
      ar_baeumeArray: oldFlurstueck.arBaeume,
    };
    const emptyArrays = { ar_vertraegeArray: [], ar_baeumeArray: [] };

    if (
      movedArrays.ar_vertraegeArray.length ||
      movedArrays.ar_baeumeArray.length
    ) {
      await saveFlurstueckArrays(created.flurstueckId, movedArrays, jwt);
      await saveFlurstueckArrays(oldFlurstueck.id, emptyArrays, jwt);
      journal.record(
        `Verschieben der Verträge und Bäume nach "${newKeyString}"`,
        async () => {
          await saveFlurstueckArrays(oldFlurstueck.id, movedArrays, jwt);
          await saveFlurstueckArrays(created.flurstueckId, emptyArrays, jwt);
        }
      );
    }

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
      await moveVerwaltungsbereichEintrag(
        eintrag.id,
        created.flurstueckId,
        jwt
      );
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
      message: [
        "Flurstück ",
        oldKey,
        " konnte erfolgreich in ",
        created,
        " umbenannt werden.",
      ],
      keys: [created],
    };
  } finally {
    await releaseLock(lock, jwt);
  }
};
