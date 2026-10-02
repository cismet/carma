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
    progress?.stepDone("usage");
  }
  progress?.finish("usage");
};
