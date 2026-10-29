import { ENDPOINT } from "../constants/belis";
import { escapeCsv, triggerCsvDownload } from "../utils/csvExport";
import { AKTIONEN_CONFIG } from "../components/ui/featuresForm/aktionModal";
import type { AktionDefinition } from "../components/ui/featuresForm/aktionModal";

const STRASSE = `tkey_strassenschluessel { pk strasse }`;

const EXPORT_QUERY = `
query ArbeitsauftraegeExport($ids: [Int!]!) {
  arbeitsauftrag(where: { id: { _in: $ids } }) {
    id
    angelegt_am
    ar_protokolleArray {
      arbeitsprotokoll {
        protokollnummer
        monteur
        datum
        bemerkung
        is_deleted
        arbeitsprotokollstatus { bezeichnung }
        arbeitsprotokollaktionArray { aenderung }
        veranlassung { bezeichnung }
        tdta_leuchten {
          leuchtennummer
          ${STRASSE}
          fk_standort: tdta_standort_mast { lfd_nummer ${STRASSE} }
        }
        tdta_standort_mast { lfd_nummer ${STRASSE} }
        schaltstelle { ${STRASSE} }
        mauerlasche { ${STRASSE} }
        leitung { id }
        abzweigdose { id }
        geometrie { id }
      }
    }
  }
}`;

const HEADER = [
  "Straßenschlüssel",
  "Straße",
  "Leuchtennummer",
  "Mastnummer",
  "Bezeichnung (aus Auftrag)",
  "Datum des Arbeitsauftrags",
  "Monteur",
  "Datum aus Protokoll",
  "Status",
  "Bemerkung",
];

const formatDate = (value: unknown): string => {
  if (typeof value !== "string") return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : value;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Gql = Record<string, any>;

// Protocol relation → AKTIONEN_CONFIG key.
const FACHOBJEKT_KEYS: [string, string][] = [
  ["tdta_leuchten", "tdta_leuchten"],
  ["tdta_standort_mast", "tdta_standort_mast"],
  ["schaltstelle", "schaltstelle"],
  ["mauerlasche", "mauerlasche"],
  ["leitung", "leitung"],
  ["abzweigdose", "abzweigdose"],
  ["geometrie", "geom"],
];

// All Aktion names in config order; same-named Aktionen share one column.
const AKTION_ORDER = [
  ...new Set(
    Object.values(AKTIONEN_CONFIG).flatMap((defs) => defs.map((d) => d.label))
  ),
];

// The server only stores the changed field labels (aenderung), not the Aktion
// name, so it is derived from the config: each label goes to the Aktion of
// this Fachobjekt type that covers the most of the protocol's labels; on a
// tie the smaller Aktion wins (e.g. "Wechseldatum" alone → Leuchtmittelwechsel,
// with "Elektrische Prüfung am Mast" → Leuchtmittelwechsel (mit EP)).
const getAktionNames = (ap: Gql): Set<string> => {
  const names = new Set<string>();
  const labels = new Set<string>(
    (ap.arbeitsprotokollaktionArray ?? [])
      .map((a: Gql) => a.aenderung)
      .filter(Boolean)
  );
  if (labels.size === 0) return names;
  const typeKey = FACHOBJEKT_KEYS.find(([rel]) => ap[rel] != null)?.[1];
  const defs: AktionDefinition[] = typeKey
    ? AKTIONEN_CONFIG[typeKey] ?? []
    : [];
  const fieldLabels = (d: AktionDefinition) =>
    new Set(d.fields.map((f) => f.label));
  const coverage = (d: AktionDefinition) =>
    [...fieldLabels(d)].filter((l) => labels.has(l)).length;

  for (const label of labels) {
    const best = defs
      .filter((d) => fieldLabels(d).has(label))
      .sort(
        (a, b) => coverage(b) - coverage(a) || a.fields.length - b.fields.length
      )[0];
    if (best) names.add(best.label);
  }
  return names;
};

const protokollToRow = (
  aa: Gql,
  ap: Gql,
  aktionColumns: string[]
): unknown[] => {
  const leuchte = ap.tdta_leuchten;
  const mast = ap.tdta_standort_mast ?? leuchte?.fk_standort;
  const strasse = (
    leuchte ??
    ap.tdta_standort_mast ??
    ap.schaltstelle ??
    ap.mauerlasche
  )?.tkey_strassenschluessel;
  return [
    strasse?.pk,
    strasse?.strasse,
    leuchte?.leuchtennummer,
    mast?.lfd_nummer,
    ap.veranlassung?.bezeichnung,
    formatDate(aa.angelegt_am),
    ap.monteur,
    formatDate(ap.datum),
    ap.arbeitsprotokollstatus?.bezeichnung,
    ap.bemerkung,
    ...aktionColumns.map((name) => (ap._aktionen.has(name) ? "ja" : "")),
  ];
};

// One row per Arbeitsprotokoll, AAs in the given (sidebar) order.
export const exportArbeitsauftraegeCsv = async (
  aaIds: number[],
  jwt: string
): Promise<void> => {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${jwt}`,
    },
    body: JSON.stringify({ query: EXPORT_QUERY, variables: { ids: aaIds } }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));

  const byId = new Map<number, Gql>(
    (json.data?.arbeitsauftrag ?? []).map((aa: Gql) => [aa.id, aa])
  );
  const entries: [Gql, Gql][] = [];
  for (const id of aaIds) {
    const aa = byId.get(id);
    if (!aa) continue;
    const protokolle: Gql[] = (aa.ar_protokolleArray ?? [])
      .map((e: Gql) => e.arbeitsprotokoll)
      .filter((ap: Gql | null) => ap && !ap.is_deleted)
      .sort(
        (a: Gql, b: Gql) => (a.protokollnummer ?? 0) - (b.protokollnummer ?? 0)
      );
    for (const ap of protokolle) {
      entries.push([aa, { ...ap, _aktionen: getAktionNames(ap) }]);
    }
  }

  // Only Aktionen that occur in this export get a column.
  const used = new Set(entries.flatMap(([, ap]) => [...ap._aktionen]));
  const aktionColumns = AKTION_ORDER.filter((name) => used.has(name));
  const rows = entries.map(([aa, ap]) =>
    protokollToRow(aa, ap, aktionColumns).map(escapeCsv).join(";")
  );

  const date = new Date().toISOString().slice(0, 10);
  triggerCsvDownload(
    [[...HEADER, ...aktionColumns].join(";"), ...rows].join("\n"),
    `arbeitsauftraege-${date}.csv`
  );
};
