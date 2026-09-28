import { FLURSTUECK_ART } from "./constants";

export const isPseudoKey = (key) =>
  key?.art?.bezeichnung === FLURSTUECK_ART.PSEUDO;

export const pad = (value, length) => String(value ?? "").padStart(length, "0");

export const landparcelLabel = (zaehler, nenner) =>
  nenner === null || nenner === undefined || Number(nenner) === 0
    ? pad(zaehler, 5)
    : `${pad(zaehler, 5)}/${pad(nenner, 4)}`;

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

export const keysEqual = (a, b) => {
  if (!a || !b) {
    return false;
  }
  const same = (x, y) => (x ?? null) === (y ?? null);
  // a missing Nenner is 0 in typed keys and null from the database
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
    keys.some(
      (other, otherIndex) => otherIndex !== index && keysEqual(key, other)
    )
  );

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

export const copyKeyContext = (key) => ({
  ...emptyKey(),
  gemarkung: key?.gemarkung,
  flur: key?.flur,
});
