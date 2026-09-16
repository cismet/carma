import { formatKey } from "../keys";
import { acquireLock, releaseLock } from "../locks";
import { setHistoricForKey } from "./core";

/**
 * Port of HistoricActionSteps — "Flurstück historisch setzen".
 *
 * `rebeMipa` carries what HistoricNoSucessorDialog collected: the rights and
 * leases found on the parcel plus the two dates the user picked for them. It
 * is undefined when the parcel has none.
 */
export const setFlurstueckHistoric = async ({ key, date, rebeMipa }, ctx) => {
  const { jwt, accountName, currentKeyString } = ctx;
  const keyString = formatKey(key);

  const lock = await acquireLock(key.id, {
    jwt,
    accountName,
    contextKeyString: currentKeyString,
    keyString,
  });

  try {
    await setHistoricForKey(key, date, rebeMipa, ctx);
    return {
      message: `Flurstück "${keyString}" konnte erfolgreich historisch gesetzt werden.`,
      keys: [{ ...key, gueltigBis: date }],
    };
  } finally {
    await releaseLock(lock, jwt);
  }
};
