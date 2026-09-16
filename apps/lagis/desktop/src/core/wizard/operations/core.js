import {
  ActionNotSuccessfulError,
  deleteFlurstueck,
  deleteSchluessel,
  fetchFlurstueckBySchluesselId,
  fetchSuccessorEdges,
  findSchluesselByKey,
  insertFlurstueck,
  insertSchluessel,
  toDateOnly,
  updateNutzung,
  updateNutzungBuchung,
  updateRebe,
  updateMipa,
  updateSchluessel,
} from "../api";
import { FLURSTUECK_ART } from "../constants";
import { formatKey, isPseudoKey } from "../keys";

/**
 * Port of LagisBroker.checkIfFlurstueckWasStaedtisch.
 * Returns the columns that have to be written on the Flurstücksschlüssel.
 *
 * @param {Object} key       the key incl. its (possibly new) Flurstücksart
 * @param {Date} [useDate]   creation date, when the key is being created
 */
export const staedtischColumns = (key, useDate) => {
  const isStaedtisch = key.art?.bezeichnung === FLURSTUECK_ART.STAEDTISCH;
  if (!isStaedtisch) {
    return {};
  }
  const now = new Date();
  if (!key.warStaedtisch) {
    // never owned by the city before
    return useDate
      ? {
          war_staedtisch: true,
          datum_letzter_stadtbesitz: toDateOnly(useDate),
        }
      : {
          war_staedtisch: true,
          datum_letzter_stadtbesitz: toDateOnly(now),
          datum_entstehung: toDateOnly(now),
        };
  }
  // was and still is owned by the city — only refresh the date
  return { datum_letzter_stadtbesitz: toDateOnly(useDate ?? now) };
};

/**
 * Port of LagisBroker.createFlurstueck.
 *
 * Creates the Flurstücksschlüssel (unless it already carries an id, which is
 * the case for the pseudo key of the zusammenlegen/teilen action) and the
 * Flurstück that belongs to it. Fails when the key is already in the database,
 * exactly as the Swing version did by way of completeFlurstueckSchluessel.
 */
export const createFlurstueckForKey = async (key, ctx) => {
  const { jwt, accountName, journal } = ctx;

  let schluesselId = key.id;

  if (!schluesselId) {
    if (!isPseudoKey(key)) {
      const existing = await findSchluesselByKey(key, jwt);
      if (existing) {
        throw new ActionNotSuccessfulError(
          `Das Flurstück "${formatKey(key)}" ist bereits vorhanden.`
        );
      }
    }
    const created = new Date();
    schluesselId = await insertSchluessel(
      {
        fk_gemarkung: key.gemarkung?.id ?? null,
        flur: key.flur ?? null,
        flurstueck_zaehler: key.zaehler ?? null,
        flurstueck_nenner: key.nenner ?? null,
        fk_flurstueck_art: key.art?.id ?? null,
        ist_gesperrt: false,
        datum_entstehung: toDateOnly(created),
        war_staedtisch: key.warStaedtisch ?? false,
        letzter_bearbeiter: accountName,
        letzte_bearbeitung: new Date().toISOString(),
        ...staedtischColumns(key, created),
      },
      jwt
    );
    journal.record(
      `Anlegen des Flurstücksschlüssels "${formatKey(key)}"`,
      () => deleteSchluessel(schluesselId, jwt)
    );
  }

  const flurstueckId = await insertFlurstueck(
    { fk_flurstueck_schluessel: schluesselId },
    jwt
  );
  journal.record(`Anlegen des Flurstücks "${formatKey(key)}"`, () =>
    deleteFlurstueck(flurstueckId, jwt)
  );

  return { ...key, id: schluesselId, flurstueckId };
};

/** Port of LagisBroker.existHistoryEntry — does this Flurstück have a successor? */
export const hasHistoryEntry = async (flurstueckId, jwt) =>
  (await fetchSuccessorEdges(flurstueckId, jwt)).length > 0;

/**
 * Port of the three-argument LagisBroker.setFlurstueckHistoric.
 *
 * @param {Object} key       key incl. id, art, warStaedtisch, gueltigBis
 * @param {Date} date        the date the parcel becomes historic
 * @param {Object} [options]
 * @param {Object[]} [options.rebe]  ReBe rows to close, with rebeLoeschDatum
 * @param {Object[]} [options.mipa]  MiPa rows to close, with mipaVertragsendeDatum
 * @param {Date} [options.rebeLoeschDatum]
 * @param {Date} [options.mipaVertragsendeDatum]
 */
export const setHistoricForKey = async (key, date, options, ctx) => {
  const { jwt, accountName, journal } = ctx;
  const keyString = formatKey(key);

  if (!key.warStaedtisch) {
    // never city owned — there are no Nutzungen that need closing
    const previous = key.gueltigBis ?? null;
    await updateSchluessel(
      key.id,
      { gueltig_bis: toDateOnly(date) },
      jwt,
      accountName
    );
    journal.record(`Historisch setzen von "${keyString}"`, () =>
      updateSchluessel(key.id, { gueltig_bis: previous }, jwt, accountName)
    );
    return;
  }

  const flurstueck = await fetchFlurstueckBySchluesselId(key.id, jwt);
  if (!flurstueck) {
    throw new ActionNotSuccessfulError(
      `Zu "${keyString}" existiert kein Flurstück.`
    );
  }

  // Closing rights and leases is only asked for by the "historisch setzen"
  // action itself, not when rename/split/join set a parcel historic.
  //
  // Deviation from the Swing client: there both loops sat behind
  // `if (rebeLoeschDatum != null)`, so ticking only the Vermietung/Verpachtung
  // box silently wrote nothing. Each date now gates its own loop.
  if (options?.mipaVertragsendeDatum) {
    for (const mipa of options.mipa ?? []) {
      const previous = mipa.vertragsende ?? null;
      await updateMipa(mipa.id, toDateOnly(options.mipaVertragsendeDatum), jwt);
      journal.record(`Vertragsende der Vermietung/Verpachtung ${mipa.id}`, () =>
        updateMipa(mipa.id, previous, jwt)
      );
    }
  }
  if (options?.rebeLoeschDatum) {
    for (const rebe of options.rebe ?? []) {
      const previous = rebe.datum_loeschung ?? null;
      await updateRebe(rebe.id, toDateOnly(options.rebeLoeschDatum), jwt);
      journal.record(`Löschdatum des Rechts/der Belastung ${rebe.id}`, () =>
        updateRebe(rebe.id, previous, jwt)
      );
    }
  }

  if (key.gueltigBis) {
    // already historic, nothing left to do
    return;
  }

  const artName = key.art?.bezeichnung;

  if (artName !== FLURSTUECK_ART.STAEDTISCH) {
    if (artName !== FLURSTUECK_ART.ABTEILUNG_IX) {
      throw new ActionNotSuccessfulError(
        `Die Flurstückart ${FLURSTUECK_ART.STAEDTISCH} ist nicht in der Datenbank.`
      );
    }
    if (!key.datumLetzterStadtbesitz) {
      throw new ActionNotSuccessfulError(
        "Das Flurstück war schon mal in Stadtbesitz, aber es existiert kein Datum wann."
      );
    }
    // Abteilung IX: the parcel is closed on the day the city lost it
    await closeParcel(
      key,
      flurstueck,
      new Date(key.datumLetzterStadtbesitz),
      { setLastOwnership: false },
      ctx
    );
    return;
  }

  // städtisch: closed on the date the user picked
  await closeParcel(key, flurstueck, date, { setLastOwnership: true }, ctx);
};

/**
 * Writes gueltig_bis on the key and closes the Nutzungen plus their Buchungen,
 * the shared tail of both branches of setFlurstueckHistoric.
 */
const closeParcel = async (key, flurstueck, date, { setLastOwnership }, ctx) => {
  const { jwt, accountName, journal } = ctx;
  const keyString = formatKey(key);
  const dateOnly = toDateOnly(date);

  const previousGueltigBis = key.gueltigBis ?? null;
  const previousStadtbesitz = key.datumLetzterStadtbesitz ?? null;

  await updateSchluessel(
    key.id,
    {
      gueltig_bis: dateOnly,
      ...(setLastOwnership ? { datum_letzter_stadtbesitz: dateOnly } : {}),
    },
    jwt,
    accountName
  );
  journal.record(`Historisch setzen von "${keyString}"`, () =>
    updateSchluessel(
      key.id,
      {
        gueltig_bis: previousGueltigBis,
        ...(setLastOwnership
          ? { datum_letzter_stadtbesitz: previousStadtbesitz }
          : {}),
      },
      jwt,
      accountName
    )
  );

  for (const nutzung of flurstueck.nutzungen) {
    const wasHistorisch = nutzung.historisch ?? false;
    if (!wasHistorisch) {
      await updateNutzung(nutzung.id, { historisch: true }, jwt);
      journal.record(`Historisch setzen der Nutzung ${nutzung.id}`, () =>
        updateNutzung(nutzung.id, { historisch: wasHistorisch }, jwt)
      );
    }
    for (const buchung of nutzung.nutzung_buchungArrayRelationShip ?? []) {
      const current = buchung.gueltig_bis;
      const needsClosing =
        current === null ||
        current === undefined ||
        new Date(current) > new Date(date);
      if (!needsClosing) {
        continue;
      }
      await updateNutzungBuchung(buchung.id, { gueltig_bis: dateOnly }, jwt);
      journal.record(`Gültigkeit der Nutzungsbuchung ${buchung.id}`, () =>
        updateNutzungBuchung(buchung.id, { gueltig_bis: current ?? null }, jwt)
      );
    }
  }
};
