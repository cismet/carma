import { useCallback, useEffect } from "react";
import { message } from "antd";
import { useDispatch, useSelector } from "react-redux";
import {
  CSV_SCOPE_LAYERS,
  getAvailableFields,
  getDefaultColumns,
} from "./csvSettingsData";
import type { CsvLayer, CsvTemplateScope } from "./csvSettingsData";
import { getJWT, getLogin } from "../../../store/slices/auth";
import {
  getCsvTemplateFavorites,
  getCsvTemplates,
  getCurrentCsvTemplateId,
  setCsvTemplates,
  setCurrentCsvTemplate,
  toggleCsvTemplateFavorite,
} from "../../../store/slices/csvTemplates";
import type {
  CsvTemplate,
  CsvTemplateDefinition,
} from "../../../store/slices/csvTemplates";
import { saveCsvExportSettings } from "../../../store/slices/csvExportSettings";
import { fetchGespeicherteSuchen } from "../../../helper/apiMethods";
import type { GespeicherteSuche } from "../../../helper/apiMethods";
import {
  deleteGespeicherteSuche,
  isAuthor,
  saveGespeicherteSuche,
} from "../../../helper/gespeicherteSuche";

// CSV templates share the gespeicherte_suche table with the expert search,
// kept apart by objekttyp.
const objekttyp = (scope: CsvTemplateScope) => `csv_template:${scope}`;

const DEFAULT_IDS: Record<CsvTemplateScope, number> = {
  fachobjekte: -1,
  arbeitsauftraege: -2,
};

const sanitize = (
  layers: CsvLayer[],
  raw: Partial<CsvTemplateDefinition> | null
): CsvTemplateDefinition | null => {
  if (!raw || typeof raw.columns !== "object") return null;
  const columns: CsvTemplateDefinition["columns"] = {};
  for (const layer of layers) {
    const cols = raw.columns[layer];
    if (!Array.isArray(cols)) continue;
    const known = new Set(getAvailableFields(layer));
    columns[layer] = cols.filter((c) => known.has(c));
  }
  const included = Array.isArray(raw.includedLayers)
    ? layers.filter((l) => raw.includedLayers?.includes(l))
    : layers;
  return { columns, includedLayers: included };
};

// jsonb comes back parsed, text as a string.
const toTemplate = (
  scope: CsvTemplateScope,
  layers: CsvLayer[],
  row: GespeicherteSuche
): CsvTemplate | null => {
  try {
    const definition = sanitize(
      layers,
      (typeof row.definition === "string"
        ? JSON.parse(row.definition)
        : row.definition) as Partial<CsvTemplateDefinition> | null
    );
    if (!definition) return null;
    return {
      id: row.id,
      scope,
      name: row.name,
      beschreibung: row.beschreibung,
      angelegt_von: row.angelegt_von,
      changedAt: row.geaendert_am ?? row.angelegt_am,
      ...definition,
    };
  } catch {
    return null;
  }
};

// Negative ids can't clash with server rows.
const defaultTemplate = (
  scope: CsvTemplateScope,
  layers: CsvLayer[]
): CsvTemplate => ({
  id: DEFAULT_IDS[scope],
  scope,
  name: "Standard",
  beschreibung: "Alle Spalten",
  angelegt_von: "System",
  columns: Object.fromEntries(layers.map((l) => [l, getDefaultColumns(l)])),
  includedLayers: layers,
  isDefault: true,
});

export interface SaveCsvTemplateInput extends CsvTemplateDefinition {
  id?: number;
  name: string;
  beschreibung?: string;
}

export const useCsvTemplates = (scope: CsvTemplateScope) => {
  const layers = CSV_SCOPE_LAYERS[scope];
  const dispatch = useDispatch();
  const jwt = useSelector(getJWT) as string | undefined;
  const login = useSelector(getLogin) as string | undefined;
  const stored = useSelector(getCsvTemplates(scope));
  const currentId = useSelector(getCurrentCsvTemplateId(scope));
  const favorites = useSelector(getCsvTemplateFavorites(login));

  const items = [defaultTemplate(scope, layers), ...(stored ?? [])];
  const current = items.find((t) => t.id === currentId) ?? null;

  const reload = useCallback(async () => {
    if (!jwt) return;
    try {
      const rows = await fetchGespeicherteSuchen(jwt, objekttyp(scope));
      const templates = rows
        .map((row) => toTemplate(scope, layers, row))
        .filter((t): t is CsvTemplate => t !== null);
      dispatch(setCsvTemplates({ scope, items: templates }));
    } catch (err: unknown) {
      console.error("[useCsvTemplates] load failed:", err);
      void message.error("Vorlagen konnten nicht geladen werden");
    }
  }, [jwt, scope, layers, dispatch]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const canEdit = (item: CsvTemplate | null) =>
    !item?.isDefault && isAuthor(item, login);

  const apply = (template: CsvTemplateDefinition & { id: number | null }) => {
    dispatch(
      saveCsvExportSettings({
        layers,
        columns: template.columns,
        includedLayers: template.includedLayers,
      })
    );
    dispatch(setCurrentCsvTemplate({ scope, id: template.id }));
  };

  const save = async ({
    id,
    name,
    beschreibung,
    columns,
    includedLayers,
  }: SaveCsvTemplateInput): Promise<number | null> => {
    if (!jwt) throw new Error("Not logged in");
    if (id != null && !canEdit(items.find((t) => t.id === id) ?? null)) {
      throw new Error("Only the author can overwrite this template");
    }
    const definition: CsvTemplateDefinition = { columns, includedLayers };
    const savedId = await saveGespeicherteSuche(jwt, {
      id,
      name,
      beschreibung,
      objekttyp: objekttyp(scope),
      definition,
      login,
    });
    if (id != null && id === currentId) {
      dispatch(saveCsvExportSettings({ layers, columns, includedLayers }));
    }
    await reload();
    return savedId;
  };

  const remove = async (id: number) => {
    if (!jwt) return;
    if (!canEdit(items.find((t) => t.id === id) ?? null)) {
      throw new Error("Only the author can delete this template");
    }
    await deleteGespeicherteSuche(jwt, id);
    if (id === currentId) dispatch(setCurrentCsvTemplate({ scope, id: null }));
    await reload();
  };

  const isFavorite = (id: number) => favorites.includes(id);
  const toggleFavorite = (id: number) => {
    if (login) dispatch(toggleCsvTemplateFavorite({ login, id }));
  };

  return {
    items,
    current,
    canEdit,
    apply,
    save,
    remove,
    isFavorite,
    toggleFavorite,
  };
};

export type CsvTemplateStore = ReturnType<typeof useCsvTemplates>;
