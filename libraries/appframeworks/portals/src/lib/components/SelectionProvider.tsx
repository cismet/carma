import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import type { Feature } from "geojson";

import { type SearchResultItem, type FeatureInfo } from "@carma/types";

export enum SelectionMapMode {
  MODE_2D,
  MODE_3D,
}

export type SelectionMetaData = {
  selectionTimestamp: number | null;
  selectedFrom?: "gazetteer" | "topicmap" | "store";
  selectedFromMapMode?: SelectionMapMode;
  isAreaSelection: boolean;
};

export type SelectionItem = SearchResultItem & SelectionMetaData;

interface SelectionContextType {
  // 2D TopicMap selection (SearchResultItem)
  selection: SelectionItem | null;
  setSelection: (selection: SelectionItem | null) => void;
  // 3D Model selection (FeatureInfo) - separate from topicmap
  // Note: "model" refers to 3D Cesium models (e.g., buildings in Cesium)
  // Future: 2D mode with MapLibre might also support models
  modelSelection: FeatureInfo | null;
  setModelSelection: (feature: FeatureInfo | null) => void;
  // todo Include overlay in selectionItme
  overlayFeature: Feature | null;
  setOverlayFeature: (feature: Feature | null) => void;
}

const SelectionContext = createContext<SelectionContextType | undefined>(
  undefined
);

const areSelectionsEqual = (
  a: SelectionItem | null,
  b: SelectionItem | null
): boolean => {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.sorter === b.sorter && a.selectionTimestamp === b.selectionTimestamp;
};

interface SelectionProviderProps {
  children: React.ReactNode;
  // TODO: Remove onSelectionChange when Redux is fully removed from apps
  // Optional callback for syncing selection to external state (e.g., Redux)
  onSelectionChange?: (selection: SelectionItem | null) => void;
  // TODO: Remove onModelSelectionChange when Redux is fully removed from apps
  // Optional callback for syncing model selection to external state (e.g., Redux)
  onModelSelectionChange?: (feature: FeatureInfo | null) => void;
}

export function SelectionProvider({
  children,
  onSelectionChange,
  onModelSelectionChange,
}: SelectionProviderProps) {
  const [selection, setSelection] = useState<SelectionItem | null>(null);
  const [modelSelection, setModelSelection] = useState<FeatureInfo | null>(
    null
  );
  const [overlayFeature, setOverlayFeature] = useState<Feature | null>(null);

  const checkedSetSelection = useCallback(
    (newSelection: SelectionItem | null) => {
      if (newSelection && areSelectionsEqual(newSelection, selection)) {
        console.debug(
          "SelectionProvider: checkedSetSelection - same selection, skipping"
        );
        return;
      }
      setSelection(newSelection);
      // TODO: Remove this callback when Redux is fully removed
      // Sync to external state management (e.g., Redux) if provided
      onSelectionChange?.(newSelection);
    },
    [selection, onSelectionChange]
  );

  const checkedSetModelSelection = useCallback(
    (newFeature: FeatureInfo | null) => {
      if (newFeature?.id === modelSelection?.id) {
        console.debug(
          "SelectionProvider: checkedSetModelSelection - same feature, skipping"
        );
        return;
      }
      setModelSelection(newFeature);
      // TODO: Remove this callback when Redux is fully removed
      // Sync to external state management (e.g., Redux) if provided
      onModelSelectionChange?.(newFeature);
    },
    [modelSelection, onModelSelectionChange]
  );

  const value = useMemo(
    () => ({
      selection,
      setSelection: checkedSetSelection,
      modelSelection,
      setModelSelection: checkedSetModelSelection,
      overlayFeature,
      setOverlayFeature,
    }),
    [
      selection,
      checkedSetSelection,
      modelSelection,
      checkedSetModelSelection,
      overlayFeature,
      setOverlayFeature,
    ]
  );

  return (
    <SelectionContext.Provider value={value}>
      {children}
    </SelectionContext.Provider>
  );
}

export function useSelection() {
  const context = useContext(SelectionContext);
  if (context === undefined) {
    throw new Error("useSelection must be used within a SelectionProvider");
  }
  return context;
}
