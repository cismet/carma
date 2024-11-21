import { Option, SearchResultItem } from "@carma-mapping/fuzzy-search";
import { Feature } from "geojson";
import { createContext, useContext, useState } from "react";


interface SelectionContextType {
  selection: SearchResultItem | null;
  setSelection: (selection: SearchResultItem | null) => void;
  overlayFeature: Feature | null;
  setOverlayFeature: (feature: Feature | null) => void;
}

const SelectionContext = createContext<SelectionContextType | undefined>(undefined);

interface SelectionProviderProps {
  children: React.ReactNode;
}

export function SelectionProvider({
  children,
}: SelectionProviderProps) {
  //const [gazetteerHit, setGazetteerHit] = useState(null);
  const [selection, setSelection] = useState<SearchResultItem|null>(null);
  const [overlayFeature, setOverlayFeature] = useState<Feature|null>(null);

  const value = {
    selection,
    setSelection,
    overlayFeature,
    setOverlayFeature,
  };

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
