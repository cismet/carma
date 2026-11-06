import { useState } from "react";
import type {
  SaveTemplateInput,
  TemplateItem,
  TemplateStore,
} from "../advanced-dialog/TemplatePanel";
import {
  CSV_LAYER_LABELS,
  getAvailableFields,
  getDefaultColumns,
} from "./csvSettingsData";
import type { CsvLayer } from "./csvSettingsData";

export interface CsvTemplate extends TemplateItem {
  layer: CsvLayer;
  columns: string[];
  // Built-in; can't be deleted or overwritten.
  isDefault?: boolean;
}

const LAYERS = Object.keys(CSV_LAYER_LABELS) as CsvLayer[];

// One "Standard" template per map feature: what the export writes today.
const DEFAULT_TEMPLATES: CsvTemplate[] = LAYERS.map((layer, index) => ({
  id: index + 1,
  layer,
  name: "Standard",
  beschreibung: "Alle Spalten",
  angelegt_von: "System",
  columns: getDefaultColumns(layer),
  isDefault: true,
}));

const DEFAULT_IDS = Object.fromEntries(
  DEFAULT_TEMPLATES.map((t) => [t.layer, t.id])
) as Record<CsvLayer, number>;

// Local placeholders until templates are persisted on the server.
const SEED_TEMPLATES: CsvTemplate[] = [
  ...DEFAULT_TEMPLATES,
  {
    id: 101,
    layer: "leuchten",
    name: "Leuchtmittelwechsel",
    beschreibung: "Standort und Leuchtmittel-Daten",
    columns: [
      "strasse",
      "lfd_nummer",
      "leuchtennummer",
      "leuchtmittel",
      "lebensdauer",
      "wechseldatum",
      "naechster_wechsel",
    ],
  },
  {
    id: 102,
    layer: "leuchten",
    name: "Doppelkommandos",
    columns: [
      "strasse",
      "leuchtennummer",
      "doppelkommando_1",
      "anzahl_1dk",
      "anschlussleistung_1dk",
      "doppelkommando_2",
      "anzahl_2dk",
      "anschlussleistung_2dk",
    ],
  },
  {
    id: 103,
    layer: "arbeitsauftraege",
    name: "Kurzübersicht",
    columns: [
      "Straße",
      "Bezeichnung (aus Auftrag)",
      "Datum des Arbeitsauftrags",
      "Status",
    ],
  },
];

// Local, in-memory template store with the same contract as the saved
// expert searches, so both share TemplatePanel.
export const useCsvTemplates = (
  layer: CsvLayer,
  columns: string[],
  applyColumns: (columns: string[]) => void
): TemplateStore<CsvTemplate> & { selectDefault: () => void } => {
  const [templates, setTemplates] = useState(SEED_TEMPLATES);
  // Nothing is selected until the user picks a template.
  const [currentIds, setCurrentIds] = useState<
    Partial<Record<CsvLayer, number>>
  >({});

  const items = templates.filter((t) => t.layer === layer);
  const current = items.find((t) => t.id === currentIds[layer]) ?? null;
  const setCurrentId = (id: number | undefined) =>
    setCurrentIds((prev) => ({ ...prev, [layer]: id }));

  const select = (id: number) => {
    const template = items.find((t) => t.id === id);
    if (!template) return null;
    const known = new Set(getAvailableFields(layer));
    const kept = template.columns.filter((key) => known.has(key));
    applyColumns(kept);
    setCurrentId(id);
    return { dropped: template.columns.length - kept.length };
  };

  const save = ({ name, beschreibung, overwrite }: SaveTemplateInput) => {
    const fields = {
      name: name.trim(),
      beschreibung: beschreibung?.trim() || null,
      columns: [...columns],
    };
    if (overwrite && current) {
      setTemplates((prev) =>
        prev.map((t) => (t.id === current.id ? { ...t, ...fields } : t))
      );
    } else {
      const id = Math.max(0, ...templates.map((t) => t.id)) + 1;
      setTemplates((prev) => [...prev, { id, layer, ...fields }]);
      setCurrentId(id);
    }
    return Promise.resolve();
  };

  const remove = (id: number) => {
    setTemplates((prev) => prev.filter((t) => t.id !== id));
    if (id === currentIds[layer]) setCurrentId(undefined);
    return Promise.resolve();
  };

  return {
    items,
    current,
    canEdit: (item) => !item?.isDefault,
    select,
    selectDefault: () => select(DEFAULT_IDS[layer]),
    save,
    remove,
  };
};
