import { FLURSTUECK_ART } from "./constants";

/**
 * A "Flurstücksschlüssel" as the wizard passes it around.
 *
 * @typedef {Object} LandParcelKey
 * @property {number} [id]          flurstueck_schluessel.id, absent for keys the user just typed
 * @property {Object} gemarkung     { id, schluessel, bezeichnung }
 * @property {number} flur
 * @property {number} zaehler
 * @property {number|null} nenner
 * @property {Object} [art]         { id, bezeichnung }
 */

export const isPseudoKey = (key) =>
  key?.art?.bezeichnung === FLURSTUECK_ART.PSEUDO;

/** Mirrors FlurstueckSchluesselCustomBean.getKeyString(). */
export const formatKey = (key) => {
  if (!key) {
    return "";
  }
  if (isPseudoKey(key)) {
    return `pseudo Schluessel${key.id}`;
  }
  const gemarkung = key.gemarkung?.bezeichnung ?? "";
  const base = `${gemarkung} ${key.flur} ${key.zaehler}`;
  return key.nenner !== null && key.nenner !== undefined
    ? `${base}/${key.nenner}`
    : base;
};

/**
 * Mirrors FlurstueckSchluessel.FLURSTUECK_EQUALATOR.pedanticEquals: compares
 * gemarkung/flur/zähler/nenner only — id and Flurstücksart are deliberately
 * ignored, because the wizard compares typed keys against persisted ones.
 */
export const keysEqual = (a, b) => {
  if (!a || !b) {
    return false;
  }
  const same = (x, y) => (x ?? null) === (y ?? null);
  // a missing Nenner reaches us as 0 from typed keys and as null from the
  // database, and both mean the same parcel
  const nenner = (value) =>
    value === null || value === undefined || Number(value) === 0 ? null : value;
  return (
    same(a.gemarkung?.id, b.gemarkung?.id) &&
    same(a.flur, b.flur) &&
    same(a.zaehler, b.zaehler) &&
    same(nenner(a.nenner), nenner(b.nenner))
  );
};

export const hasDuplicateKeys = (keys) =>
  keys.some((key, index) =>
    keys.some((other, otherIndex) => otherIndex !== index && keysEqual(key, other))
  );

/** True once gemarkung/flur/zähler are filled in — nenner stays optional. */
export const isKeyComplete = (key) =>
  Boolean(
    key &&
      key.gemarkung?.id !== undefined &&
      key.gemarkung?.id !== null &&
      Number.isInteger(key.flur) &&
      Number.isInteger(key.zaehler)
  );

export const emptyKey = () => ({
  id: undefined,
  gemarkung: undefined,
  flur: undefined,
  zaehler: undefined,
  nenner: undefined,
  art: undefined,
});

/** Used by ResultingPanel's COPY_CONTENT_MODE: prefill gemarkung + flur only. */
export const copyKeyContext = (key) => ({
  ...emptyKey(),
  gemarkung: key?.gemarkung,
  flur: key?.flur,
});
