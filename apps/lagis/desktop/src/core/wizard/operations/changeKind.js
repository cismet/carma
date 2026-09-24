import { ActionNotSuccessfulError, toDateOnly, updateSchluessel } from "../api";
import { FLURSTUECK_ART } from "../constants";
import { formatKey } from "../keys";
import { acquireLock, releaseLock } from "../locks";
import { staedtischColumns } from "./core";

/**
 * Port of ChangeKindActionSteps + LagisBroker.modifyFlurstueckSchluessel —
 * "Art des Flurstücks ändern".
 */
export const changeFlurstueckArt = async ({ key, newArt }, ctx) => {
  const { jwt, accountName, journal, currentKeyString } = ctx;
  const keyString = formatKey(key);

  if (!newArt?.id) {
    throw new ActionNotSuccessfulError(
      "Gewählte Art kommt in der Datenbank nicht vor."
    );
  }
  if (key.art?.bezeichnung === newArt.bezeichnung) {
    throw new ActionNotSuccessfulError(
      `Flurstück ist bereits ${newArt.bezeichnung}.`
    );
  }

  const lock = await acquireLock(key.id, {
    jwt,
    accountName,
    contextKeyString: currentKeyString,
    keyString,
  });

  try {
    const wasStaedtisch = key.art?.bezeichnung === FLURSTUECK_ART.STAEDTISCH;

    // Leaving städtisch records when the city last owned the parcel; every
    // other change runs through the shared staedtisch bookkeeping.
    const changes = wasStaedtisch
      ? {
          war_staedtisch: true,
          datum_letzter_stadtbesitz: toDateOnly(new Date()),
        }
      : staedtischColumns({ ...key, art: newArt });

    const previous = {
      fk_flurstueck_art: key.art?.id ?? null,
      war_staedtisch: key.warStaedtisch ?? false,
      datum_letzter_stadtbesitz: key.datumLetzterStadtbesitz ?? null,
      datum_entstehung: key.datumEntstehung ?? null,
    };

    await updateSchluessel(
      key.id,
      { fk_flurstueck_art: newArt.id, ...changes },
      jwt,
      accountName
    );
    journal.record(`Ändern der Art von "${keyString}"`, () =>
      updateSchluessel(key.id, previous, jwt, accountName)
    );

    return {
      message: `Die Art des Flurstücks "${keyString}" konnte erfolgreich auf "${newArt.bezeichnung}" geändert werden.`,
      keys: [{ ...key, art: newArt }],
    };
  } finally {
    await releaseLock(lock, jwt);
  }
};
