import { createContext, useContext, useState } from "react";
export type ActiveShape = null | number | string | any;
export interface MapMeasurementsContextType {
  activeShape: ActiveShape;
  setActiveShape: (shape: ActiveShape) => void;
}
export const MapMeasurementsContext = createContext<MapMeasurementsContextType>(
  {
    activeShape: null,
    setActiveShape: (shape: ActiveShape) => {},
  }
);

export const MapMeasurementsProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const [activeShape, setActiveShape] = useState<ActiveShape>(null);
  return (
    <MapMeasurementsContext.Provider value={{ activeShape, setActiveShape }}>
      {children}
    </MapMeasurementsContext.Provider>
  );
};

export function useMapMeasurementsContext() {
  const ctx = useContext(MapMeasurementsContext);
  if (!ctx) {
    throw new Error(
      "useMapMeasurementsContext must be used within an MapMeasurementsProvider"
    );
  }
  return ctx;
}
