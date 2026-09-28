import {
  ActionNotSuccessfulError,
  deleteHistoryEdge,
  fetchFlurstueckBySchluesselId,
  insertHistoryEdge,
} from "../api";
import { formatKey } from "../keys";
import { acquireLock, releaseLock } from "../locks";
import {
  createFlurstueckForKey,
  hasHistoryEntry,
  setHistoricForKey,
} from "./core";

// successor check before setting historic, unlike Swing (no stray write)
export const splitFlurstuecke = async ({ key, resultKeys }, ctx) => {
  const { jwt, accountName, journal, currentKeyString } = ctx;
  const keyString = formatKey(key);

  const lock = await acquireLock(key.id, {
    jwt,
    accountName,
    contextKeyString: currentKeyString,
    keyString,
  });

  try {
    const oldFlurstueck = await fetchFlurstueckBySchluesselId(key.id, jwt);
    if (!oldFlurstueck) {
      throw new ActionNotSuccessfulError(
        `Zu "${keyString}" existiert kein Flurstück.`
      );
    }
    if (await hasHistoryEntry(oldFlurstueck.id, jwt)) {
      throw new ActionNotSuccessfulError(
        "Teilen des Flurstücks nicht möglich, es gibt schon einen Nachfolger."
      );
    }

    await setHistoricForKey(key, new Date(), undefined, ctx);

    const created = [];
    for (const resultKey of resultKeys) {
      const newParcel = await createFlurstueckForKey(
        { ...resultKey, art: resultKey.art ?? key.art },
        ctx
      );
      created.push(newParcel);

      const edgeId = await insertHistoryEdge(
        oldFlurstueck.id,
        newParcel.flurstueckId,
        jwt
      );
      journal.record(
        `Historieneintrag "${keyString}" → "${formatKey(newParcel)}"`,
        () => deleteHistoryEdge(edgeId, jwt)
      );
    }

    return {
      message: `Das Flurstück wurde erfolgreich in ${created.length} Flurstücke aufgeteilt.`,
      from: [key],
      to: created,
      keys: created,
    };
  } finally {
    await releaseLock(lock, jwt);
  }
};
