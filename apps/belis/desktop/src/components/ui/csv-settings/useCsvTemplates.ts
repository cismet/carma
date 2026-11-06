import { useState } from "react";
import type {
  SaveTemplateInput,
  TemplateItem,
  TemplateStore,
} from "../advanced-dialog/TemplatePanel";
import { getAvailableFields } from "./csvSettingsData";
import type { CsvLayer } from "./csvSettingsData";

export interface CsvTemplate extends TemplateItem {
  layer: CsvLayer;
  columns: string[];
}

// Local placeholders until templates are persisted on the server.
const SEED_TEMPLATES: CsvTemplate[] = [
  {
    id: 1,
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
    id: 2,
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
    id: 3,
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
): TemplateStore<CsvTemplate> => {
  const [templates, setTemplates] = useState(SEED_TEMPLATES);
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

  return { items, current, canEdit: () => true, select, save, remove };
};
