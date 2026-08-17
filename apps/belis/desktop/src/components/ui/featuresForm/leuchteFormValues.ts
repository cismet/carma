import dayjs from "dayjs";
import toTitleCase from "../../../helper/toTitleCase";

// Helper type for nested objects with common properties
interface NestedObject {
  id?: number;
  pk?: string;
  strasse?: string;
}

/**
 * Project a fetched `tdta_leuchten` record onto the field values the Leuchte
 * form carries — FK objects flattened to their `id` (what the Selects bind to),
 * date columns lifted into dayjs, display-only Strassenschlüssel parts split
 * out.
 *
 * Lives outside the component because two callers need the exact same mapping:
 * `LeuchteFormFields` seeds its AntD form (and the changed-field baseline) with
 * it, and the "Wiederholfelder in markierte Objekte einfügen" batch action
 * builds drafts for features whose Datenblatt was never opened — those drafts
 * must hold the full field set, since the save payload is the draft's values.
 */
export const buildLeuchteFormValues = (
  leuchte: Record<string, unknown>
): Record<string, unknown> => {
  const strassenschluessel = leuchte.tkey_strassenschluessel as
    | NestedObject
    | undefined;
  const kennziffer = leuchte.tkey_kennziffer as NestedObject | undefined;
  const leuchtentyp = leuchte.tkey_leuchtentyp as NestedObject | undefined;
  const energielieferant = leuchte.tkey_energielieferant as
    | NestedObject
    | undefined;
  const rundsteuerempfaenger = leuchte.rundsteuerempfaengerObject as
    | NestedObject
    | undefined;
  const dk1Object = leuchte.fk_dk1Object as NestedObject | undefined;
  const dk2Object = leuchte.fk_dk2Object as NestedObject | undefined;
  const unterhLeuchte = leuchte.tkey_unterh_leuchte as NestedObject | undefined;
  const leuchtmittelObj = leuchte.leuchtmittelObject as
    | NestedObject
    | undefined;
  // esave sensor link. The Betreiber is edited as a raw FK id (no Select
  // yet), so the form carries the id — the name is resolved for display.
  const sensorbetreiber = leuchte.sensorbetreiberObject as
    | { id?: number; name?: string; beschreibung?: string }
    | undefined;

  return {
    // Straßenschlüssel
    strassenschluessel_pk: strassenschluessel?.pk,
    strassenschluessel_strasse: strassenschluessel?.strasse
      ? toTitleCase(strassenschluessel.strasse)
      : undefined,
    // Kennziffer - use id for Select value
    fk_kennziffer: kennziffer?.id ?? null,
    // Laufende Nr. / Leuchtennummer
    lfd_nummer: leuchte.lfd_nummer,
    leuchtennummer: leuchte.leuchtennummer,
    // Leuchtentyp - use id for Select value
    fk_leuchttyp: leuchtentyp?.id ?? null,
    // Inbetriebnahme / Zähler
    inbetriebnahme_leuchte: leuchte.inbetriebnahme_leuchte
      ? dayjs(leuchte.inbetriebnahme_leuchte as string)
      : null,
    zaehler: leuchte.zaehler,
    // Montagefirma
    montagefirma_leuchte: leuchte.montagefirma_leuchte,
    // Energielieferant - use id for Select value
    fk_energielieferant: energielieferant?.id ?? null,
    // Schaltstelle
    schaltstelle: leuchte.schaltstelle,
    // Rundsteuerempfänger - use id for Select value
    rundsteuerempfaenger: rundsteuerempfaenger?.id ?? null,
    // Einbaudatum
    einbaudatum: leuchte.einbaudatum
      ? dayjs(leuchte.einbaudatum as string)
      : null,
    // Doppelkommando 1 - use id for Select value
    fk_dk1: dk1Object?.id ?? leuchte.fk_dk1,
    anzahl_1dk: leuchte.anzahl_1dk,
    anschlussleistung_1dk: leuchte.anschlussleistung_1dk,
    // Sensor (esave) — editable; saved with the rest of the Leuchte
    sensorid: leuchte.sensorid,
    sensorbetreiber: sensorbetreiber?.id ?? leuchte.sensorbetreiber ?? null,
    // Doppelkommando 2 - use id for Select value
    fk_dk2: dk2Object?.id ?? leuchte.fk_dk2,
    anzahl_2dk: leuchte.anzahl_2dk,
    anschlussleistung_2dk: leuchte.anschlussleistung_2dk,
    // Unterhalt Leuchte - use id for Select value
    fk_unterhaltspflicht_leuchte: unterhLeuchte?.id ?? null,
    // Leuchtmittelwechsel
    wechseldatum: leuchte.wechseldatum
      ? dayjs(leuchte.wechseldatum as string)
      : null,
    naechster_wechsel: leuchte.naechster_wechsel
      ? dayjs(leuchte.naechster_wechsel as string)
      : null,
    // Leuchtmittel - use id for Select value
    leuchtmittel: leuchtmittelObj?.id ?? leuchte.leuchtmittel,
    // Lebensdauer
    lebensdauer: leuchte.lebensdauer,
    // Sonderturnus
    sonderturnus: leuchte.wartungszyklus
      ? dayjs(leuchte.wartungszyklus as string)
      : null,
    // Vorschaltgerät
    vorschaltgeraet: leuchte.vorschaltgeraet,
    // Erneuerung VG
    wechselvorschaltgeraet: leuchte.wechselvorschaltgeraet
      ? dayjs(leuchte.wechselvorschaltgeraet as string)
      : null,
    // Bemerkung
    bemerkungen: leuchte.bemerkungen,
  };
};
