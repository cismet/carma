import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { RootState } from "../index";
import type { CsvExportLayer } from "../../constants/csvFieldGroups";
import type { TemplateItem } from "../../components/ui/advanced-dialog/TemplatePanel";

export interface CsvTemplate extends TemplateItem {
  layer: CsvExportLayer;
  columns: string[];
  // Built-in; can't be deleted or overwritten.
  isDefault?: boolean;
}

interface CsvTemplatesState {
  // Server templates per layer, as last loaded.
  items: Partial<Record<CsvExportLayer, CsvTemplate[]>>;
  // Template last picked or saved per layer; none until the user picks one.
  currentIds: Partial<Record<CsvExportLayer, number | null>>;
}

const initialState: CsvTemplatesState = { items: {}, currentIds: {} };

const csvTemplatesSlice = createSlice({
  name: "csvTemplates",
  initialState,
  reducers: {
    setCsvTemplates(
      state,
      action: PayloadAction<{ layer: CsvExportLayer; items: CsvTemplate[] }>
    ) {
      state.items[action.payload.layer] = action.payload.items;
    },
    setCurrentCsvTemplate(
      state,
      action: PayloadAction<{ layer: CsvExportLayer; id: number | null }>
    ) {
      state.currentIds[action.payload.layer] = action.payload.id;
    },
  },
});

export const { setCsvTemplates, setCurrentCsvTemplate } =
  csvTemplatesSlice.actions;

export default csvTemplatesSlice;

export const getCsvTemplates =
  (layer: CsvExportLayer) =>
  (state: RootState): CsvTemplate[] | undefined =>
    state.csvTemplates.items[layer];

export const getCurrentCsvTemplateId =
  (layer: CsvExportLayer) =>
  (state: RootState): number | null =>
    state.csvTemplates.currentIds[layer] ?? null;
