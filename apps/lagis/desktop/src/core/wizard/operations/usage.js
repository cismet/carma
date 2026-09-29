import {
  ActionNotSuccessfulError,
  fetchFlurstueckBySchluesselId,
  saveFlurstueckAdmin,
  toTimestamp,
} from "../api";
import { isStaedtischKey } from "../adminData";
import { formatKey } from "../keys";

const isEmpty = (row) =>
  !row.anlageklasseId &&
  !row.nutzungsartId &&
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
      ...(row.anlageklasseId
        ? { anlageklasse: { id: row.anlageklasseId } }
        : {}),
      ...(row.nutzungsartId ? { nutzungsart: { id: row.nutzungsartId } } : {}),
    },
  ],
});

export const saveUsageData = async (keys, usage, ctx) => {
  const { jwt, journal } = ctx;
  const bookedAt = toTimestamp(new Date());

  for (const key of keys) {
    const label = formatKey(key);
    const rows = (usage?.[label] ?? []).filter((row) => !isEmpty(row));
    if (!rows.length || !key.id || !isStaedtischKey(key)) {
      continue;
    }

    const flurstueck = await fetchFlurstueckBySchluesselId(key.id, jwt);
    if (!flurstueck) {
      throw new ActionNotSuccessfulError(
        `Zu "${label}" existiert kein Flurstück.`
      );
    }

    const existing = flurstueck.nutzungen.map(({ id }) => ({ id }));
    await saveFlurstueckAdmin(
      flurstueck.id,
      {
        nutzungArrayRelationShip: [
          ...existing,
          ...rows.map((row) => newNutzung(row, bookedAt)),
        ],
      },
      jwt
    );
    journal.record(`Nutzungen von "${label}"`, () =>
      saveFlurstueckAdmin(
        flurstueck.id,
        { nutzungArrayRelationShip: existing },
        jwt
      )
    );
  }
};
