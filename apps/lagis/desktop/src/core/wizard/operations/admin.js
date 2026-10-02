import {
  ActionNotSuccessfulError,
  fetchAdminRows,
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

const dienststellenChanged = (existing, rows) =>
  existing.length !== rows.length ||
  rows.some((row, index) => {
    const before = existing[index];
    return (
      Boolean(row.geometry) ||
      before.verwaltende_dienststelle?.id !== row.dienststelleId ||
      (before.flaeche !== null &&
        before.flaeche !== undefined &&
        toInt(before.flaeche) !== toInt(row.flaeche))
    );
  });

const newEintrag = (rows, accountName) => ({
  geaendert_am: toTimestamp(new Date()),
  geaendert_von: accountName,
  verwaltungsbereichArrayRelationShip: rows.map((row) => ({
    verwaltende_dienststelle: { id: row.dienststelleId },
    flaeche: toInt(row.flaeche),
    ...(row.geometry ? { geom: { geo_field: row.geometry } } : {}),
  })),
});

const reconcile = (existing, desired, same, create) => {
  const unused = [...existing];
  const rows = desired.map((row) => {
    const index = unused.findIndex((old) => same(old, row));
    if (index === -1) {
      return create(row);
    }
    const [match] = unused.splice(index, 1);
    return { id: match.id };
  });
  const kept = new Set(rows.map((row) => row.id).filter(Boolean));
  return {
    rows,
    kept,
    changed: unused.length > 0 || rows.some((row) => row.id === undefined),
  };
};

const restore = (existing, kept, recreate) =>
  existing.map((old) => (kept.has(old.id) ? { id: old.id } : recreate(old)));

const newRolle = (dienststelleId, rolleArtId) => ({
  verwaltende_dienststelle: { id: dienststelleId },
  zusatz_rolle_art: { id: rolleArtId },
});

const newStrassenfront = (strassenname, laenge) => ({
  strassenname,
  laenge: round2(laenge),
});

const buildChanges = (flurstueck, parcel, accountName) => {
  const changes = {};
  const undo = {};

  if ((parcel.bemerkung ?? "") !== (flurstueck.bemerkung ?? "")) {
    changes.bemerkung = parcel.bemerkung ?? "";
    undo.bemerkung = flurstueck.bemerkung ?? null;
  }

  const eintraege = flurstueck.verwaltungsbereiche_eintragArrayRelationShip;
  if (dienststellenChanged(currentBereiche(eintraege), parcel.dienststellen)) {
    const previous = eintraege.map(({ id }) => ({ id }));
    changes.verwaltungsbereiche_eintragArrayRelationShip = [
      ...previous,
      newEintrag(parcel.dienststellen, accountName),
    ];
    undo.verwaltungsbereiche_eintragArrayRelationShip = previous;
  }

  const rollenBefore = flurstueck.zusatz_rolleArrayRelationShip;
  const rollen = reconcile(
    rollenBefore,
    parcel.rollen,
    (old, row) =>
      old.verwaltende_dienststelle?.id === row.dienststelleId &&
      old.zusatz_rolle_art?.id === row.rolleArtId,
    (row) => newRolle(row.dienststelleId, row.rolleArtId)
  );
  if (rollen.changed) {
    changes.zusatz_rolleArrayRelationShip = rollen.rows;
    undo.zusatz_rolleArrayRelationShip = restore(
      rollenBefore,
      rollen.kept,
      (old) =>
        newRolle(old.verwaltende_dienststelle?.id, old.zusatz_rolle_art?.id)
    );
  }

  const strassenBefore = flurstueck.strassenfrontArrayRelationShip;
  const strassen = reconcile(
    strassenBefore,
    parcel.strassenfronten,
    (old, row) =>
      (old.strassenname ?? "") === row.strassenname.trim() &&
      round2(old.laenge) === round2(row.laenge),
    (row) => newStrassenfront(row.strassenname.trim(), row.laenge)
  );
  if (strassen.changed) {
    changes.strassenfrontArrayRelationShip = strassen.rows;
    undo.strassenfrontArrayRelationShip = restore(
      strassenBefore,
      strassen.kept,
      (old) => newStrassenfront(old.strassenname, old.laenge)
    );
  }

  return { changes, undo };
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
  const { jwt, accountName, journal, progress } = ctx;
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

    const { changes, undo } = buildChanges(flurstueck, parcel, accountName);
    if (Object.keys(changes).length) {
      await saveFlurstueckAdmin(flurstueck.id, changes, jwt);
      journal.record(`Verwaltungsbereiche von "${label}"`, () =>
        saveFlurstueckAdmin(flurstueck.id, undo, jwt)
      );
    }

    await saveSperre(key, parcel, ctx);
    progress?.stepDone("admin");
  }
  progress?.finish("admin");
};
