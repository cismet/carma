import { createContext } from "react";

import type {
  GazDataAdditionalMode,
  GazDataAdditionalModeConfig,
  GazDataItem,
  GazDataSourceConfig,
} from "@carma-mapping/fuzzy-search";

/**
 * A runtime extension of the gazetteer config: extra sources merged into the
 * default search and/or extra modes for the mode dropdown.
 */
export type GazDataContribution = {
  sources?: GazDataSourceConfig[];
  additionalModes?: GazDataAdditionalModeConfig[];
};

export interface GazDataContextType {
  gazData: GazDataItem[];
  additionalModes: GazDataAdditionalMode[];
  crs: string;
  isLoading: boolean;
  error: Error | null;
  landParcelData: Record<string, unknown> | undefined;
  landParcelLoading: boolean;
  loadLandParcelData: () => void;
  registerGazDataContribution: (
    contribution: GazDataContribution
  ) => () => void;
}

export const GazDataContext = createContext<GazDataContextType | undefined>(
  undefined
);
