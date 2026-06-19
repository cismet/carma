// Minimal structural shape the CSV needs — any feature (tile, search result,
// or enriched record) with a sourceLayer and properties satisfies it.
export interface ExportableFeature {
  sourceLayer?: string;
  properties?: Record<string, unknown> | null;
}

// Reformat ISO datetime strings ("2018-04-18T00:00:00") to the German date
// format the forms use ("DD.MM.YYYY" → "18.04.2018"). Rearranging the date
// part as a string avoids timezone day-shifts that new Date() can introduce.
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})T/;
const formatValue = (value: unknown): string => {
  if (typeof value === "string") {
    const m = ISO_DATE.exec(value);
    if (m) return `${m[3]}.${m[2]}.${m[1]}`;
  }
  return value === null || value === undefined ? "" : String(value);
};

// CSV-escape a single value (German/Excel convention: ';' separator).
const escapeCsv = (value: unknown): string => {
  const s = formatValue(value);
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// Order features so each Standort is immediately followed by its own Leuchten
// (matched via leuchte.fk_standort === standort.id). Leuchten whose parent
// Standort is not in the selection ("orphans") and any other feature types are
// appended afterwards, preserving their original order.
const orderByStandort = (
  features: ExportableFeature[]
): ExportableFeature[] => {
  const leuchtenByStandort = new Map<string, ExportableFeature[]>();
  const standorte: ExportableFeature[] = [];
  const others: ExportableFeature[] = [];

  for (const f of features) {
    if (f.sourceLayer === "leuchten") {
      const sid = String(f.properties?.fk_standort ?? "");
      const list = leuchtenByStandort.get(sid) ?? [];
      list.push(f);
      leuchtenByStandort.set(sid, list);
    } else if (f.sourceLayer === "standorte") {
      standorte.push(f);
    } else {
      others.push(f);
    }
  }

  const ordered: ExportableFeature[] = [];
  const placed = new Set<ExportableFeature>();
  for (const standort of standorte) {
    ordered.push(standort);
    const sid = String(standort.properties?.id ?? "");
    for (const leuchte of leuchtenByStandort.get(sid) ?? []) {
      ordered.push(leuchte);
      placed.add(leuchte);
    }
  }
  // Orphan Leuchten (parent Standort not selected), then all other types.
  for (const list of leuchtenByStandort.values()) {
    for (const leuchte of list) if (!placed.has(leuchte)) ordered.push(leuchte);
  }
  ordered.push(...others);
  return ordered;
};

// Build a CSV string from a list of features. The header is the union of all
// `properties` keys across the given features; one row per feature. Rows are
// grouped so each Standort is followed by its Leuchten.
export const featuresToCsv = (input: ExportableFeature[]): string => {
  const features = orderByStandort(input);
  const columns = [
    ...new Set(features.flatMap((f) => Object.keys(f.properties ?? {}))),
  ];
  // Prepend a "typ" column derived from each feature's sourceLayer, so every
  // row identifies its feature type (e.g. leuchten, standorte).
  const header = ["typ", ...columns].join(";");
  const rows = features.map((f) =>
    [
      escapeCsv(f.sourceLayer),
      ...columns.map((c) => escapeCsv(f.properties?.[c])),
    ].join(";")
  );
  return [header, ...rows].join("\n");
};

// Create a CSV file in the browser and trigger its download.
export const triggerCsvDownload = (csv: string, filename: string): void => {
  // Prepend a BOM so Excel detects UTF-8 (umlauts in BELIS data).
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
};

// Convenience: export a feature collection to a downloaded CSV file.
export const exportFeaturesToCsv = (
  features: ExportableFeature[],
  filename = "belis-export.csv"
): void => {
  triggerCsvDownload(featuresToCsv(features), filename);
};

// Map a feature's sourceLayer to the export file it belongs to. Standorte and
// Leuchten share a single file (so each Standort stays grouped with its own
// Leuchten via orderByStandort); every other layer gets its own file named
// after the layer. Features without a sourceLayer land in "sonstige".
const fileKeyForLayer = (layer: string | undefined): string => {
  if (layer === "standorte" || layer === "leuchten") return "standorte-leuchten";
  return layer ?? "sonstige";
};

// Split features by feature type, build one CSV per group, and download each
// as a separate file. Standorte and Leuchten are combined into one file; all
// other types get their own. Downloads are staggered slightly so browsers do
// not suppress rapid successive download triggers.
export const exportFeaturesToCsvByType = (
  features: ExportableFeature[],
  prefix = "belis-export"
): void => {
  const groups = new Map<string, ExportableFeature[]>();
  for (const f of features) {
    const key = fileKeyForLayer(f.sourceLayer);
    const list = groups.get(key) ?? [];
    list.push(f);
    groups.set(key, list);
  }

  let i = 0;
  for (const [key, groupFeatures] of groups) {
    const csv = featuresToCsv(groupFeatures);
    const filename = `${prefix}-${key}.csv`;
    // Stagger downloads to avoid browsers dropping rapid successive ones.
    setTimeout(() => triggerCsvDownload(csv, filename), i * 300);
    i++;
  }
};
