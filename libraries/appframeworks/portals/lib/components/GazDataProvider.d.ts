import { ReactNode } from "react";
import {
  GazDataItem,
  GazDataConfig,
} from "../../../../../commons/gazetteer/src/index.ts";
interface GazDataContextType {
  gazData: GazDataItem[];
  crs: string;
  isLoading: boolean;
  error: Error | null;
}
interface GazDataProviderProps {
  children: ReactNode;
  config?: GazDataConfig;
}
export declare function GazDataProvider({
  children,
  config,
}: GazDataProviderProps): import("react/jsx-runtime").JSX.Element;
export declare function useGazData(): GazDataContextType;
export {};
