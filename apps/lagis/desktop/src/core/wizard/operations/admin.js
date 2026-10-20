import {
  ActionNotSuccessfulError,
  CLASS,
  deleteAdminChild,
  fetchAdminRows,
  insertAdminChild,
  fetchSchluesselById,
  saveFlurstueckAdmin,
  toTimestamp,
  updateSchluessel,
} from "../api";
import { isStaedtischKey } from "../adminData";
import { formatKey } from "../keys";

const round2 = (number) =>
  Number.isFinite(number) ? Math.round(number * 100) / 100 : null;

const toInt = (number) => (Number.isFinite(number) ? Math.round(number) : null);

const byChangeDate = (a, b) => {
  if (a.geaendert_am) {
    return b.geaendert_am
      ? new Date(a.geaendert_am) - new Date(b.geaendert_am)
      : 1;
  }
  return a.id - b.id;
};

const currentBereiche = (eintraege) => {
  const sorted = [...eintraege].sort(byChangeDate);
  return sorted[sorted.length - 1]?.verwaltungsbereichArrayRelationShip ?? [];
};

const sameGeometry = (a, b) =>
  a?.type === b?.type &&
  JSON.stringify(a?.coordinates) === JSON.stringify(b?.coordinates);

const dienststellenChanged = (existing, rows) =>
  existing.length !== rows.length ||
  rows.some((row, index) => {
    const before = existing[index];
    return (
      (Boolean(row.geometry) &&
        !sameGeometry(before.extended_geom?.geo_field, row.geometry)) ||
      before.verwaltende_dienststelle?.id !== row.dienststelleId ||
      (before.flaeche !== null &&
        before.flaeche !== undefined &&
        toInt(before.flaeche) !== toInt(row.flaeche))
    );
  });

const newEintrag = (flurstueckId, rows, accountName) => ({
  fk_flurstueck: flurstueckId,
  geaendert_am: toTimestamp(new Date()),
  geaendert_von: accountName,
  verwaltungsbereichArrayRelationShip: rows.map((row) => ({
    verwaltende_dienststelle: { id: row.dienststelleId },
    flaeche: toInt(row.flaeche),
    ...(row.geometry ? { geom: { geo_field: row.geometry } } : {}),
  })),
});

const reconcile = (existing, desired, same) => {
  const removed = [...existing];
  const added = desired.filter((row) => {
    const index = removed.findIndex((old) => same(old, row));
    if (index === -1) {
      return true;
    }
    removed.splice(index, 1);
    return false;
  });
  return { added, removed };
};

const newRolle = (flurstueckId, dienststelleId, rolleArtId) => ({
  fk_flurstueck: flurstueckId,
  verwaltende_dienststelle: { id: dienststelleId },
  zusatz_rolle_art: { id: rolleArtId },
});

const newStrassenfront = (flurstueckId, strassenname, laenge) => ({
  fk_flurstueck: flurstueckId,
  strassenname,
  laenge: round2(laenge),
});

const insertChild = async (className, object, description, ctx) => {
  const { jwt, journal } = ctx;
  const id = await insertAdminChild(className, object, jwt);
  journal.record(description, () => deleteAdminChild(className, id, jwt));
};

const deleteChild = async (className, id, recreate, description, ctx) => {
  const { jwt, journal } = ctx;
  await deleteAdminChild(className, id, jwt);
  journal.record(description, () => insertAdminChild(className, recreate, jwt));
};

const saveAdminRows = async (flurstueck, parcel, label, ctx) => {
  const { jwt, accountName, journal } = ctx;
  const flurstueckId = flurstueck.id;

  if ((parcel.bemerkung ?? "") !== (flurstueck.bemerkung ?? "")) {
    await saveFlurstueckAdmin(
      flurstueckId,
      { bemerkung: parcel.bemerkung ?? "" },
      jwt
    );
    journal.record(`Bemerkung von "${label}"`, () =>
      saveFlurstueckAdmin(
        flurstueckId,
        { bemerkung: flurstueck.bemerkung ?? null },
        jwt
      )
    );
  }

  const eintraege = flurstueck.verwaltungsbereiche_eintragArrayRelationShip;
  if (dienststellenChanged(currentBereiche(eintraege), parcel.dienststellen)) {
    await insertChild(
      CLASS.VERWALTUNGSBEREICH_EINTRAG,
      newEintrag(flurstueckId, parcel.dienststellen, accountName),
      `Verwaltungsbereiche von "${label}"`,
      ctx
    );
  }

  const rollen = reconcile(
    flurstueck.zusatz_rolleArrayRelationShip,
    parcel.rollen,
    (old, row) =>
      old.verwaltende_dienststelle?.id === row.dienststelleId &&
      old.zusatz_rolle_art?.id === row.rolleArtId
  );
  for (const old of rollen.removed) {
    await deleteChild(
      CLASS.ZUSATZ_ROLLE,
      old.id,
      newRolle(
        flurstueckId,
        old.verwaltende_dienststelle?.id,
        old.zusatz_rolle_art?.id
      ),
      `Zusätzliche Rolle ${old.id} von "${label}"`,
      ctx
    );
  }
  for (const row of rollen.added) {
    await insertChild(
      CLASS.ZUSATZ_ROLLE,
      newRolle(flurstueckId, row.dienststelleId, row.rolleArtId),
      `Neue zusätzliche Rolle von "${label}"`,
      ctx
    );
  }

  const strassen = reconcile(
    flurstueck.strassenfrontArrayRelationShip,
    parcel.strassenfronten,
    (old, row) =>
      (old.strassenname ?? "") === row.strassenname.trim() &&
      round2(old.laenge) === round2(row.laenge)
  );
  for (const old of strassen.removed) {
    await deleteChild(
      CLASS.STRASSENFRONT,
      old.id,
      newStrassenfront(flurstueckId, old.strassenname, old.laenge),
      `Straßenfront ${old.id} von "${label}"`,
      ctx
    );
  }
  for (const row of strassen.added) {
    await insertChild(
      CLASS.STRASSENFRONT,
      newStrassenfront(flurstueckId, row.strassenname.trim(), row.laenge),
      `Neue Straßenfront von "${label}"`,
      ctx
    );
  }
};

const saveSperre = async (key, parcel, ctx) => {
  const { jwt, accountName, journal } = ctx;
  const schluessel = await fetchSchluesselById(key.id, jwt);
  const sperre = Boolean(parcel.sperre);
  const bemerkung = sperre ? parcel.sperreBemerkung ?? "" : "";
  if (
    sperre === schluessel.istGesperrt &&
    bemerkung === (schluessel.istGesperrt ? schluessel.bemerkungSperre : "")
  ) {
    return;
  }
  await updateSchluessel(
    key.id,
    { ist_gesperrt: sperre, bemerkung_sperre: bemerkung },
    jwt,
    accountName
  );
  journal.record(`Sperre von "${formatKey(key)}"`, () =>
    updateSchluessel(
      key.id,
      {
        ist_gesperrt: schluessel.istGesperrt,
        bemerkung_sperre: schluessel.bemerkungSperre,
      },
      jwt,
      accountName
    )
  );
};

export const adminTargets = (keys, admin) =>
  keys.filter(
    (key) => admin?.[formatKey(key)] && key.id && isStaedtischKey(key)
  );

export const saveAdminData = async (keys, admin, ctx) => {
  const { jwt, progress } = ctx;
  const targets = adminTargets(keys, admin);
  progress?.start("admin", targets.length);

  for (const key of targets) {
    const label = formatKey(key);
    const parcel = admin[label];
    progress?.step("admin", label);

    const flurstueck = await fetchAdminRows(key.id, jwt);
    if (!flurstueck) {
      throw new ActionNotSuccessfulError(
        `Zu "${label}" existiert kein Flurstück.`
      );
    }

    await saveAdminRows(flurstueck, parcel, label, ctx);

    await saveSperre(key, parcel, ctx);
    progress?.stepDone("admin");
  }
  progress?.finish("admin");
};
