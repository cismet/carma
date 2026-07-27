import type { CatalogFilterField } from "@carma-mapping/layers";

export type FilterFieldMeta = {
  value: CatalogFilterField;
  label: string;
  hint: string;
};

export const FILTER_FIELD_OPTIONS: FilterFieldMeta[] = [
  {
    value: "id",
    label: "Item-Id",
    hint: 'Exakte Item-Ids ("serviceName:layerName", siehe SERVICES.MD); für kuratierte Zusammenstellungen.',
  },
  {
    value: "category",
    label: "Kategorie",
    hint: "Haupt- oder Subkategorie-Id, in der das Item einsortiert ist.",
  },
  {
    value: "keywords",
    label: "Schlüsselwörter",
    hint: "Case-insensitiver Teilstring-Match auf keywords/tags der Items.",
  },
  {
    value: "entityType",
    label: "Objekt-Typ",
    hint: "Der Item-Typ: Layer, Objekt, Link oder Zusammenstellung.",
  },
  {
    value: "layerType",
    label: "Layer-Typ",
    hint: 'Effektiver Render-Typ; "vector" auch für WMS-Layer mit carmaConf-vectorStyle.',
  },
  {
    value: "mapMode",
    label: "Karten-Modus",
    hint: "Verfügbarkeit in 2D/3D; ohne explizites mapMode sind Items 2D-only (Objekte auch 3D).",
  },
];

/** fields whose value set is fixed and picked via checkboxes */
export const FIXED_VALUE_OPTIONS: Partial<
  Record<CatalogFilterField, { value: string; label: string }[]>
> = {
  entityType: [
    { value: "layer", label: "Layer" },
    { value: "object", label: "Objekt" },
    { value: "link", label: "Link" },
    { value: "collection", label: "Zusammenstellung" },
  ],
  layerType: [
    { value: "vector", label: "Vektor" },
    { value: "wmts", label: "WMS (wmts)" },
    { value: "wmts-nt", label: "WMS (wmts-nt)" },
  ],
  mapMode: [
    { value: "2d", label: "2D" },
    { value: "3d", label: "3D" },
  ],
};
