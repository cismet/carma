import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import type { Feature } from "geojson";

import { type SearchResultItem } from "@carma-commons/types";

export type SelectionMetaData = {
  selectionTimestamp: number | null;
  selectedFrom?: "gazetteer" | "topicmap" | "store";
  isAreaSelection: boolean;
};

export type SelectionItem = SearchResultItem & SelectionMetaData;

interface SelectionContextType {
  selection: SelectionItem | null;
  setSelection: (selection: SelectionItem | null) => void;
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
}

export function SelectionProvider({ children }: SelectionProviderProps) {
  const [selection, setSelection] = useState<SelectionItem | null>(null);
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
    },
    [selection]
  );

  const value = useMemo(
    () => ({
      selection,
      setSelection: checkedSetSelection,
      overlayFeature,
      setOverlayFeature,
    }),
    [selection, checkedSetSelection, overlayFeature, setOverlayFeature]
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
