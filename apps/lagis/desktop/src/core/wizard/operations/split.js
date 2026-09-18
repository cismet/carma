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

/**
 * Port of SplitActionSteps + LagisBroker.splitFlurstuecke — "Flurstück teilen".
 *
 * The successor check is done before the parcel is set historic. The Swing
 * client did it the other way round, which left the parcel closed even when the
 * split was then rejected; the order here avoids that write entirely.
 */
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
      // the parts inherit the Flurstücksart of the parcel they come from
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

    const parts = created.map((part) => `• ${formatKey(part)}`).join("\n");
    return {
      message: `Flurstück "${keyString}" konnte erfolgreich in die Flurstücke\n${parts}\naufgeteilt werden.`,
      keys: created,
    };
  } finally {
    await releaseLock(lock, jwt);
  }
};
