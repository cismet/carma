import { Feature } from "geojson";
import {
  SearchResultItem,
  FeatureInfo,
} from "../../../../../types/src/index.ts";
export declare enum SelectionMapMode {
  MODE_2D = 0,
  MODE_3D = 1,
}
export type SelectionMetaData = {
  selectionTimestamp: number | null;
  selectedFrom?: "gazetteer" | "topicmap" | "store";
  selectedFromMapMode?: SelectionMapMode;
  isAreaSelection: boolean;
};
export type SelectionItem = SearchResultItem & SelectionMetaData;
interface SelectionContextType {
  selection: SelectionItem | null;
  setSelection: (selection: SelectionItem | null) => void;
  modelSelection: FeatureInfo | null;
  setModelSelection: (feature: FeatureInfo | null) => void;
  overlayFeature: Feature | null;
  setOverlayFeature: (feature: Feature | null) => void;
}
interface SelectionProviderProps {
  children: React.ReactNode;
  onSelectionChange?: (selection: SelectionItem | null) => void;
  onModelSelectionChange?: (feature: FeatureInfo | null) => void;
}
export declare function SelectionProvider({
  children,
  onSelectionChange,
  onModelSelectionChange,
}: SelectionProviderProps): import("react/jsx-runtime").JSX.Element;
export declare function useSelection(): SelectionContextType;
export {};
