import { getFachobjektOfProtocol } from "@carma-appframeworks/belis";
import type { ProtokolleSort } from "../store/slices/arbeitsauftraege";
import toTitleCase from "./toTitleCase";

export const compare = (a: string | number, b: string | number) => {
  const valA = a ?? "";
  const valB = b ?? "";

  // Both numeric → numeric comparison
  if (typeof valA === "number" && typeof valB === "number") return valA - valB;

  // Alphabetical comparison via locale
  return String(valA).localeCompare(String(valB), "de", {
    sensitivity: "base",
  });
};

const FEATURE_TYPE_LABELS: Record<string, string> = {
  tdta_leuchten: "Leuchte",
  mast: "Mast",
  standort: "Standort",
  schaltstelle: "Schaltstelle",
  mauerlasche: "Mauerlasche",
  leitung: "Leitung",
  abzweigdose: "Abzweigdose",
  geom: "Freie Geometrie",
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getPosition(fachobjekt: Record<string, any> | undefined): string {
  if (!fachobjekt) return "";
  if (fachobjekt.type === "tdta_leuchten") {
    return (
      fachobjekt.fk_standort?.fk_strassenschluessel?.strasse ??
      fachobjekt.fk_strassenschluessel?.strasse ??
      ""
    );
  }
  return fachobjekt.fk_strassenschluessel?.strasse ?? "";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function resolveType(p: Record<string, any>): string {
  const fachobjekt = getFachobjektOfProtocol(p);
  let resolvedType = fachobjekt?.type ?? "";
  if (resolvedType === "tdta_standort_mast") {
    resolvedType = p.tdta_standort_mast?.fk_masttyp ? "mast" : "standort";
  }
  return resolvedType;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getKennzeichnung(p: Record<string, any>): string {
  const resolvedType = resolveType(p);
  switch (resolvedType) {
    case "abzweigdose":
      return "";
    case "geom":
      return p.geometrie?.bezeichnung ?? "";
    case "leitung":
      return p.leitung?.fk_leitungstyp?.bezeichnung ?? "";
    case "tdta_leuchten": {
      const nr = p.tdta_leuchten?.lfd_nummer ?? null;
      const typ = p.tdta_leuchten?.fk_leuchttyp?.leuchtentyp ?? null;
      if (nr != null && typ != null) return nr + ", " + typ;
      if (nr != null) return String(nr);
      if (typ != null) return String(typ);
      return "";
    }
    case "mauerlasche":
      return p.mauerlasche?.laufende_nummer != null
        ? String(p.mauerlasche.laufende_nummer)
        : "";
    case "schaltstelle":
      return p.schaltstelle?.schaltstellen_nummer != null
        ? String(p.schaltstelle.schaltstellen_nummer)
        : "";
    case "mast":
    case "standort": {
      const masttyp = p.tdta_standort_mast?.fk_masttyp?.masttyp ?? null;
      const mastart = p.tdta_standort_mast?.fk_mastart?.mastart ?? null;
      if (masttyp != null && mastart != null) return masttyp + ", " + mastart;
      if (masttyp != null) return String(masttyp);
      if (mastart != null) return String(mastart);
      return "";
    }
    default:
      return "";
  }
}

/** Extract the same sort value from a raw protocol as the AA table row uses. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const AP_FIELD_EXTRACTORS: Record<string, (p: Record<string, any>) => string | number> = {
  protokollnummer: (p) => Number(p.protokollnummer) || 0,
  herkunft: (p) => {
    const v = p.veranlassung;
    const parts = ["V" + (v?.nummer ?? "")];
    if (v?.fk_veranlassungsart?.schluessel) {
      parts.push(v.fk_veranlassungsart.schluessel);
    }
    return parts.join(" ");
  },
  fachobjektType: (p) => {
    const resolved = resolveType(p);
    const fachobjekt = getFachobjektOfProtocol(p);
    return FEATURE_TYPE_LABELS[resolved] ?? fachobjekt?.type ?? "Unbekannt";
  },
  kennzeichnung: getKennzeichnung,
  bearbeiter: (p) => p.monteur ?? "",
  position: (p) => toTitleCase(getPosition(getFachobjektOfProtocol(p))),
  status: (p) => p.arbeitsprotokollstatus?.bezeichnung ?? "Offen",
};

export function sortProtokolleByTableSort(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  items: Record<string, any>[],
  sort: ProtokolleSort | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Record<string, any>[] {
  if (!sort) {
    return items.sort(
      (a, b) => Number(a.protokollnummer) - Number(b.protokollnummer)
    );
  }
  const extractor = AP_FIELD_EXTRACTORS[sort.field];
  if (!extractor) {
    return items.sort(
      (a, b) => Number(a.protokollnummer) - Number(b.protokollnummer)
    );
  }
  const dir = sort.order === "descend" ? -1 : 1;
  return items.sort((a, b) => {
    const primary = dir * compare(extractor(a), extractor(b));
    if (primary !== 0) return primary;
    return (Number(a.protokollnummer) || 0) - (Number(b.protokollnummer) || 0);
  });
}
