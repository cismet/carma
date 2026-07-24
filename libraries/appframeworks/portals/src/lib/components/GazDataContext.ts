import { createContext } from "react";

import type {
  GazDataAdditionalMode,
  GazDataItem,
} from "@carma-mapping/fuzzy-search";

export interface GazDataContextType {
  gazData: GazDataItem[];
  additionalModes: GazDataAdditionalMode[];
  crs: string;
  isLoading: boolean;
  error: Error | null;
  landParcelData: Record<string, unknown> | undefined;
  landParcelLoading: boolean;
  loadLandParcelData: () => void;
}

export const GazDataContext = createContext<GazDataContextType | undefined>(
  undefined
);
