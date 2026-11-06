import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { RootState } from "../index";
import type { CsvExportLayer } from "../../constants/csvFieldGroups";

export interface CsvExportSettings {
  // Chosen columns in order; a missing layer exports its default columns.
  columns: Partial<Record<CsvExportLayer, string[]>>;
  excludedLayers: CsvExportLayer[];
}

const initialState: CsvExportSettings = { columns: {}, excludedLayers: [] };

const csvExportSettingsSlice = createSlice({
  name: "csvExportSettings",
  initialState,
  reducers: {
    // Replaces the settings of `layers` only; each dialog owns its layers.
    saveCsvExportSettings(
      state,
      action: PayloadAction<{
        layers: CsvExportLayer[];
        columns: Partial<Record<CsvExportLayer, string[]>>;
        includedLayers: CsvExportLayer[];
      }>
    ) {
      const { layers, columns, includedLayers } = action.payload;
      for (const layer of layers) {
        const chosen = columns[layer];
        if (chosen?.length) state.columns[layer] = chosen;
        else delete state.columns[layer];
      }
      state.excludedLayers = [
        ...state.excludedLayers.filter((l) => !layers.includes(l)),
        ...layers.filter((l) => !includedLayers.includes(l)),
      ];
    },
  },
});

export const { saveCsvExportSettings } = csvExportSettingsSlice.actions;

export default csvExportSettingsSlice;

export const getCsvExportSettings = (state: RootState): CsvExportSettings =>
  state.csvExportSettings;
