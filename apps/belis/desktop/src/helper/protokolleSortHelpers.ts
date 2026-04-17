import { getFachobjektOfProtocol } from "@carma-appframeworks/belis";
import type { ProtokolleSort } from "../store/slices/arbeitsauftraege";

export const compare = (a: string | number, b: string | number) => {
  const valA = a === undefined || a === null ? "" : a;
  const valB = b === undefined || b === null ? "" : b;

  return (
    (isFinite(valB as number) as unknown as number) -
      (isFinite(valA as number) as unknown as number) ||
    (valA as number) - (valB as number) ||
    (String(valA).length === String(valB).length &&
      String(valA).localeCompare(String(valB))) ||
    String(valA).length - String(valB).length
  );
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getProtocolFeatureType(protokoll: Record<string, any>): string {
  const FEATURE_TYPE_LABELS: Record<string, string> = {
    tdta_leuchten: "Leuchte",
    tdta_standort_mast: "Standort/Mast",
    schaltstelle: "Schaltstelle",
    mauerlasche: "Mauerlasche",
    leitung: "Leitung",
    abzweigdose: "Abzweigdose",
  };
  for (const key of Object.keys(FEATURE_TYPE_LABELS)) {
    if (protokoll[key] != null) {
      return FEATURE_TYPE_LABELS[key];
    }
  }
  return "Unbekannt";
}

// Map table column dataIndex → raw protocol field extractor
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const AP_FIELD_EXTRACTORS: Record<string, (p: Record<string, any>) => string | number> = {
  protokollnummer: (p) => Number(p.protokollnummer) || 0,
  herkunft: (p) => "V" + (p.veranlassung?.nummer ?? ""),
  fachobjektType: (p) =>
    getFachobjektOfProtocol(p)?.shortname ?? getProtocolFeatureType(p),
  kennzeichnung: (p) =>
    p.tdta_leuchten?.lfd_nummer ??
    p.schaltstelle?.schaltstellen_nummer ??
    "",
  bearbeiter: (p) => p.monteur ?? "",
  position: (p) => {
    const fo = getFachobjektOfProtocol(p);
    if (!fo) return "";
    if (fo.type === "tdta_leuchten")
      return (
        fo.fk_standort?.fk_strassenschluessel?.strasse ??
        fo.fk_strassenschluessel?.strasse ??
        ""
      );
    return fo.fk_strassenschluessel?.strasse ?? "";
  },
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
  return items.sort((a, b) => dir * compare(extractor(a), extractor(b)));
}
