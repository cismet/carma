import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
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
  // todo Include overlay in selection
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
  // Only compare by sorter - timestamp is for detecting NEW selections, not equality
  return a.sorter === b.sorter;
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
  // Keep state for consumers that need re-renders, but prevent loops with equality checks
  const [selection, setSelectionState] = useState<SelectionItem | null>(null);
  const [modelSelection, setModelSelectionState] = useState<FeatureInfo | null>(
    null
  );
  const [overlayFeature, setOverlayFeature] = useState<Feature | null>(null);

  const onSelectionChangeRef = useRef(onSelectionChange);
  const onModelSelectionChangeRef = useRef(onModelSelectionChange);

  // Update callback refs on every render
  onSelectionChangeRef.current = onSelectionChange;
  onModelSelectionChangeRef.current = onModelSelectionChange;

  const checkedSetSelection = useCallback(
    (newSelection: SelectionItem | null) => {
      setSelectionState((prev) => {
        // Check equality by content (sorter + timestamp), not reference
        if (newSelection && areSelectionsEqual(newSelection, prev)) {
          console.debug(
            "SelectionProvider: checkedSetSelection - same selection, skipping state update"
          );
          return prev; // Return same reference to prevent re-render
        }
        // TODO: Remove this callback when Redux is fully removed
        // Sync to external state management (e.g., Redux) if provided
        onSelectionChangeRef.current?.(newSelection);
        return newSelection;
      });
    },
    [] // Stable - no dependencies
  );

  const checkedSetModelSelection = useCallback(
    (newFeature: FeatureInfo | null) => {
      setModelSelectionState((prev) => {
        // Check equality by ID, not reference
        if (newFeature?.id === prev?.id) {
          console.debug(
            "SelectionProvider: checkedSetModelSelection - same feature, skipping state update"
          );
          return prev; // Return same reference to prevent re-render
        }
        // TODO: Remove this callback when Redux is fully removed
        // Sync to external state management (e.g., Redux) if provided
        onModelSelectionChangeRef.current?.(newFeature);
        return newFeature;
      });
    },
    [] // Stable - no dependencies
  );

  // Stable context value - callbacks never change
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
