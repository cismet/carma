import { formatKey } from "../keys";
import { acquireLock, releaseLock } from "../locks";
import { setHistoricForKey } from "./core";

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
    const gueltigBis = await setHistoricForKey(key, date, rebeMipa, ctx);
    return {
      message: [
        "Flurstück ",
        key,
        " konnte erfolgreich historisch gesetzt werden.",
      ],
      keys: [{ ...key, gueltigBis }],
    };
  } finally {
    await releaseLock(lock, jwt);
  }
};
