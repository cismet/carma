import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { RootState } from "../index";
import type { CsvExportLayer } from "../../constants/csvFieldGroups";
import type { TemplateItem } from "../../components/ui/advanced-dialog/TemplatePanel";
import type { CsvTemplateScope } from "../../components/ui/csv-settings/csvSettingsData";

export interface CsvTemplateDefinition {
  // Empty or missing layer exports its default columns.
  columns: Partial<Record<CsvExportLayer, string[]>>;
  includedLayers: CsvExportLayer[];
}

export interface CsvTemplate extends TemplateItem, CsvTemplateDefinition {
  scope: CsvTemplateScope;
  isDefault?: boolean;
}

interface CsvTemplatesState {
  items: Partial<Record<CsvTemplateScope, CsvTemplate[]>>;
  currentIds: Partial<Record<CsvTemplateScope, number | null>>;
  favorites: Record<string, number[]>;
}

const initialState: CsvTemplatesState = {
  items: {},
  currentIds: {},
  favorites: {},
};

const csvTemplatesSlice = createSlice({
  name: "csvTemplates",
  initialState,
  reducers: {
    setCsvTemplates(
      state,
      action: PayloadAction<{ scope: CsvTemplateScope; items: CsvTemplate[] }>
    ) {
      state.items[action.payload.scope] = action.payload.items;
    },
    setCurrentCsvTemplate(
      state,
      action: PayloadAction<{ scope: CsvTemplateScope; id: number | null }>
    ) {
      state.currentIds[action.payload.scope] = action.payload.id;
    },
    toggleCsvTemplateFavorite(
      state,
      action: PayloadAction<{ login: string; id: number }>
    ) {
      const { login, id } = action.payload;
      const ids = state.favorites[login] ?? [];
      state.favorites[login] = ids.includes(id)
        ? ids.filter((i) => i !== id)
        : [...ids, id];
    },
  },
});

export const {
  setCsvTemplates,
  setCurrentCsvTemplate,
  toggleCsvTemplateFavorite,
} = csvTemplatesSlice.actions;

export default csvTemplatesSlice;

export const getCsvTemplates =
  (scope: CsvTemplateScope) =>
  (state: RootState): CsvTemplate[] | undefined =>
    state.csvTemplates.items[scope];

export const getCurrentCsvTemplateId =
  (scope: CsvTemplateScope) =>
  (state: RootState): number | null =>
    state.csvTemplates.currentIds[scope] ?? null;

const NO_FAVORITES: number[] = [];

export const getCsvTemplateFavorites =
  (login: string | undefined) =>
  (state: RootState): number[] =>
    (login && state.csvTemplates.favorites[login]) || NO_FAVORITES;
