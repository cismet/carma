import {
  ActionNotSuccessfulError,
  deleteNutzung,
  fetchFlurstueckBySchluesselId,
  insertNutzung,
  toTimestamp,
} from "../api";
import { isStaedtischKey } from "../adminData";
import { formatKey } from "../keys";
import { hasId } from "../../editing/ids";

const isEmpty = (row) =>
  !hasId(row.anlageklasseId) &&
  !hasId(row.nutzungsartId) &&
  !Number.isFinite(row.flaeche) &&
  !Number.isFinite(row.quadratmeterpreis);

const newNutzung = (row, bookedAt) => ({
  nutzung_buchungArrayRelationShip: [
    {
      gueltig_von: bookedAt,
      ist_buchwert: true,
      flaeche: Number.isFinite(row.flaeche) ? Math.round(row.flaeche) : null,
      quadratmeterpreis: Number.isFinite(row.quadratmeterpreis)
        ? row.quadratmeterpreis
        : null,
      bemerkung: row.bemerkung || null,
      ...(hasId(row.anlageklasseId)
        ? { anlageklasse: { id: row.anlageklasseId } }
        : {}),
      ...(hasId(row.nutzungsartId)
        ? { nutzungsart: { id: row.nutzungsartId } }
        : {}),
    },
  ],
});

const rowsFor = (usage, key) =>
  (usage?.[formatKey(key)] ?? []).filter((row) => !isEmpty(row));

export const usageTargets = (keys, usage) =>
  keys.filter(
    (key) => rowsFor(usage, key).length && key.id && isStaedtischKey(key)
  );

export const saveUsageData = async (keys, usage, ctx) => {
  const { jwt, journal, progress } = ctx;
  const bookedAt = toTimestamp(new Date());
  const targets = usageTargets(keys, usage);
  progress?.start("usage", targets.length);

  for (const key of targets) {
    const label = formatKey(key);
    const rows = rowsFor(usage, key);
    progress?.step("usage", label);

    const flurstueck = await fetchFlurstueckBySchluesselId(key.id, jwt);
    if (!flurstueck) {
      throw new ActionNotSuccessfulError(
        `Zu "${label}" existiert kein Flurstück.`
      );
    }

    for (const row of rows) {
      const id = await insertNutzung(
        {
          fk_flurstueck: flurstueck.id,
          historisch: false,
          ...newNutzung(row, bookedAt),
        },
        jwt
      );
      journal.record(`Nutzung ${id} von "${label}"`, () =>
        deleteNutzung(id, jwt)
      );
    }
    progress?.stepDone("usage");
  }
  progress?.finish("usage");
};
