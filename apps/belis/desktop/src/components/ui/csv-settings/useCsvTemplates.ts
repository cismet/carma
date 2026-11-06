import { useCallback, useEffect } from "react";
import { message } from "antd";
import { useDispatch, useSelector } from "react-redux";
import type {
  SaveTemplateInput,
  TemplateStore,
} from "../advanced-dialog/TemplatePanel";
import {
  CSV_LAYER_LABELS,
  getAvailableFields,
  getDefaultColumns,
} from "./csvSettingsData";
import type { CsvLayer } from "./csvSettingsData";
import { getJWT, getLogin } from "../../../store/slices/auth";
import {
  getCsvTemplates,
  getCurrentCsvTemplateId,
  setCsvTemplates,
  setCurrentCsvTemplate,
} from "../../../store/slices/csvTemplates";
import type { CsvTemplate } from "../../../store/slices/csvTemplates";
import { fetchGespeicherteSuchen } from "../../../helper/apiMethods";
import type { GespeicherteSuche } from "../../../helper/apiMethods";
import {
  deleteGespeicherteSuche,
  isAuthor,
  saveGespeicherteSuche,
} from "../../../helper/gespeicherteSuche";

// CSV templates share the gespeicherte_suche table with the expert search,
// kept apart by objekttyp.
const objekttyp = (layer: CsvLayer) => `csv_export:${layer}`;

interface CsvTemplateDefinition {
  columns: string[];
}

// jsonb comes back parsed, text as a string.
const toTemplate = (
  layer: CsvLayer,
  row: GespeicherteSuche
): CsvTemplate | null => {
  try {
    const definition = (
      typeof row.definition === "string"
        ? JSON.parse(row.definition)
        : row.definition
    ) as Partial<CsvTemplateDefinition> | null;
    const columns = definition?.columns;
    if (!Array.isArray(columns)) return null;
    return {
      id: row.id,
      layer,
      name: row.name,
      beschreibung: row.beschreibung,
      angelegt_von: row.angelegt_von,
      columns: columns.filter((c): c is string => typeof c === "string"),
    };
  } catch {
    return null;
  }
};

// Built-in per layer, never stored: what the export writes without settings.
// Negative ids can't clash with server rows.
const defaultTemplate = (layer: CsvLayer): CsvTemplate => ({
  id: -1 - Object.keys(CSV_LAYER_LABELS).indexOf(layer),
  layer,
  name: "Standard",
  beschreibung: "Alle Spalten",
  angelegt_von: "System",
  columns: getDefaultColumns(layer),
  isDefault: true,
});

// Server-backed template store for one layer, same contract as the saved
// expert searches so both share TemplatePanel.
export const useCsvTemplates = (
  layer: CsvLayer,
  columns: string[],
  applyColumns: (columns: string[]) => void
): TemplateStore<CsvTemplate> & { selectDefault: () => void } => {
  const dispatch = useDispatch();
  const jwt = useSelector(getJWT) as string | undefined;
  const login = useSelector(getLogin) as string | undefined;
  const stored = useSelector(getCsvTemplates(layer));
  const currentId = useSelector(getCurrentCsvTemplateId(layer));

  const standard = defaultTemplate(layer);
  const items = [standard, ...(stored ?? [])];
  const current = items.find((t) => t.id === currentId) ?? null;
  const setCurrentId = (id: number | null) =>
    dispatch(setCurrentCsvTemplate({ layer, id }));

  const reload = useCallback(async () => {
    if (!jwt) return;
    try {
      const rows = await fetchGespeicherteSuchen(jwt, objekttyp(layer));
      const templates = rows
        .map((row) => toTemplate(layer, row))
        .filter((t): t is CsvTemplate => t !== null);
      dispatch(setCsvTemplates({ layer, items: templates }));
    } catch (err: unknown) {
      console.error("[useCsvTemplates] load failed:", err);
      void message.error("Vorlagen konnten nicht geladen werden");
    }
  }, [jwt, layer, dispatch]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const canEdit = (item: CsvTemplate | null) =>
    !item?.isDefault && isAuthor(item, login);

  const select = (id: number) => {
    const template = items.find((t) => t.id === id);
    if (!template) return null;
    const known = new Set(getAvailableFields(layer));
    const kept = template.columns.filter((key) => known.has(key));
    applyColumns(kept);
    setCurrentId(id);
    return { dropped: template.columns.length - kept.length };
  };

  const save = async ({ name, beschreibung, overwrite }: SaveTemplateInput) => {
    if (!jwt) throw new Error("Not logged in");
    const target = overwrite && canEdit(current) ? current : null;
    const definition: CsvTemplateDefinition = { columns };
    const id = await saveGespeicherteSuche(jwt, {
      id: target?.id,
      name,
      beschreibung,
      objekttyp: objekttyp(layer),
      definition,
      login,
    });
    setCurrentId(id);
    await reload();
  };

  const remove = async (id: number) => {
    if (!jwt) return;
    if (!canEdit(items.find((t) => t.id === id) ?? null)) {
      throw new Error("Only the author can delete this template");
    }
    await deleteGespeicherteSuche(jwt, id);
    if (id === currentId) setCurrentId(null);
    await reload();
  };

  return {
    items,
    current,
    canEdit,
    select,
    selectDefault: () => select(standard.id),
    save,
    remove,
  };
};
