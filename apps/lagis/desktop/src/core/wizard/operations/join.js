import {
  ActionNotSuccessfulError,
  deleteHistoryEdge,
  fetchFlurstueckBySchluesselId,
  insertHistoryEdge,
} from "../api";
import { formatKey } from "../keys";
import { acquireLock, releaseLocks } from "../locks";
import {
  createFlurstueckForKey,
  hasHistoryEntry,
  setHistoricForKey,
} from "./core";

/**
 * Port of JoinActionSteps + LagisBroker.joinFlurstuecke —
 * "Flurstück zusammenlegen".
 *
 * Every member is locked up front, so the action either owns all of them or
 * none. As in splitFlurstuecke the successor check runs before anything is
 * written.
 */
export const joinFlurstuecke = async ({ memberKeys, resultKey }, ctx) => {
  const { jwt, accountName, journal, currentKeyString } = ctx;

  if (!memberKeys?.length) {
    throw new ActionNotSuccessfulError(
      "Es wurden keine Flurstücke für die Zusammenlegung angegeben."
    );
  }

  const locks = [];
  try {
    for (const memberKey of memberKeys) {
      locks.push(
        await acquireLock(memberKey.id, {
          jwt,
          accountName,
          contextKeyString: currentKeyString,
          keyString: formatKey(memberKey),
        })
      );
    }

    const members = [];
    for (const memberKey of memberKeys) {
      const flurstueck = await fetchFlurstueckBySchluesselId(memberKey.id, jwt);
      if (!flurstueck) {
        throw new ActionNotSuccessfulError(
          `Zu "${formatKey(memberKey)}" existiert kein Flurstück.`
        );
      }
      if (await hasHistoryEntry(flurstueck.id, jwt)) {
        throw new ActionNotSuccessfulError(
          `Es sind bereits Historieneinträge für das Flurstück "${formatKey(
            memberKey
          )}" vorhanden.`
        );
      }
      members.push({ key: memberKey, flurstueck });
    }

    // the merged parcel takes the Flurstücksart of the first member
    const created = await createFlurstueckForKey(
      { ...resultKey, art: resultKey.art ?? memberKeys[0].art },
      ctx
    );
    const newKeyString = formatKey(created);

    for (const member of members) {
      await setHistoricForKey(member.key, new Date(), undefined, ctx);

      const edgeId = await insertHistoryEdge(
        member.flurstueck.id,
        created.flurstueckId,
        jwt
      );
      journal.record(
        `Historieneintrag "${formatKey(member.key)}" → "${newKeyString}"`,
        () => deleteHistoryEdge(edgeId, jwt)
      );
    }

    return {
      message: `${memberKeys.length} Flurstücke wurden erfolgreich zusammengelegt.`,
      from: memberKeys,
      to: [created],
      keys: [created],
    };
  } finally {
    await releaseLocks(locks, jwt);
  }
};
