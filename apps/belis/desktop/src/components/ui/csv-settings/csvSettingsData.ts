import {
  CSV_COLUMN_CONFIG,
  CSV_COLUMN_ORDER,
  CSV_LAYER_LABEL_OVERRIDES,
  CSV_LAYER_SHOW_OVERRIDES,
} from "../../../constants/csvColumns";
import {
  AA_FIELD_TYPES,
  CSV_FIELD_GROUPS,
  CSV_REGISTRY_ALIASES,
} from "../../../constants/csvFieldGroups";
import type {
  CsvExportLayer,
  CsvFieldGroupConfig,
} from "../../../constants/csvFieldGroups";
import { flattenGqlRecord } from "../../../helper/flattenGqlRecord";
import {
  AA_EXPORT_HEADER,
  AKTION_ORDER,
} from "../../../helper/exportArbeitsauftraegeCsv";
import { REGISTRY, TYPE_META } from "../expert-search/fieldRegistry";
import type { FieldType, ObjectType } from "../expert-search/fieldRegistry";

export type CsvLayer = CsvExportLayer;

export type CsvColumnSettings = Record<CsvLayer, string[]>;

export const CSV_LAYER_LABELS: Record<CsvLayer, string> = {
  leuchten: "Leuchten",
  standorte: "Standorte",
  schaltstelle: "Schaltstellen",
  mauerlaschen: "Mauerlaschen",
  leitungen: "Leitungen",
  arbeitsauftraege: "Arbeitsaufträge",
};

export const FACHOBJEKT_LAYERS: CsvLayer[] = [
  "leuchten",
  "standorte",
  "schaltstelle",
  "mauerlaschen",
  "leitungen",
];

const REGISTRY_TYPE: Record<
  Exclude<CsvLayer, "arbeitsauftraege">,
  ObjectType
> = {
  leuchten: "leuchte",
  standorte: "mast",
  schaltstelle: "schaltstelle",
  mauerlaschen: "mauerlasche",
  leitungen: "leitung",
};

// Same visibility rule as featuresToCsv.
const isShown = (layer: CsvLayer, key: string): boolean =>
  CSV_LAYER_SHOW_OVERRIDES[layer]?.[key] ??
  CSV_COLUMN_CONFIG[key]?.show !== false;

// Exactly the columns the export writes, in its natural order.
export const getAvailableFields = (layer: CsvLayer): string[] =>
  layer === "arbeitsauftraege"
    ? [...AA_EXPORT_HEADER, ...AKTION_ORDER]
    : Object.keys(flattenGqlRecord({}, layer)).filter((key) =>
        isShown(layer, key)
      );

// Same header resolution as featuresToCsv; AA keys already are headers.
export const getFieldLabel = (layer: CsvLayer, key: string): string =>
  layer === "arbeitsauftraege"
    ? key
    : CSV_LAYER_LABEL_OVERRIDES[layer]?.[key] ??
      CSV_COLUMN_CONFIG[key]?.label ??
      key;

export const getFieldGroups = (layer: CsvLayer): CsvFieldGroupConfig[] => {
  const available = getAvailableFields(layer);
  const known = new Set(available);
  const groups = CSV_FIELD_GROUPS[layer]
    .map((g) => ({ ...g, fields: g.fields.filter((k) => known.has(k)) }))
    .filter((g) => g.fields.length > 0);
  if (layer === "arbeitsauftraege") {
    groups.push({ key: "aktionen", label: "Aktionen", fields: AKTION_ORDER });
  }
  const grouped = new Set(groups.flatMap((g) => g.fields));
  const rest = available.filter((key) => !grouped.has(key));
  return rest.length > 0
    ? [...groups, { key: "weitere", label: "Weitere Felder", fields: rest }]
    : groups;
};

export const getGroupLabelOf = (
  layer: CsvLayer,
  key: string
): string | undefined =>
  getFieldGroups(layer).find((g) => g.fields.includes(key))?.label;

const getFieldType = (layer: CsvLayer, key: string): FieldType => {
  if (layer === "arbeitsauftraege") return AA_FIELD_TYPES[key] ?? "boolean";
  const registryKey = CSV_REGISTRY_ALIASES[layer]?.[key] ?? key;
  // Inherited fields (e.g. Mastart on a Leuchte) live in another registry.
  const field =
    REGISTRY[REGISTRY_TYPE[layer]].find((f) => f.key === registryKey) ??
    Object.values(REGISTRY)
      .flat()
      .find((f) => f.key === registryKey);
  return field?.type ?? "text";
};

export const getFieldColor = (layer: CsvLayer, key: string) =>
  TYPE_META[getFieldType(layer, key)];

// What the export writes today without any settings.
export const getDefaultColumns = (layer: CsvLayer): string[] => {
  const available = getAvailableFields(layer);
  if (layer === "arbeitsauftraege") return available;
  const order = CSV_COLUMN_ORDER[layer];
  const index = (key: string) => {
    const i = order.indexOf(key);
    return i === -1 ? Number.MAX_SAFE_INTEGER : i;
  };
  return available.sort((a, b) => index(a) - index(b));
};
