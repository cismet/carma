/**
 * useMapMeasurementsContext Hook
 * Hook to access the map measurements context
 */

import { useContext } from "react";
import { MapMeasurementsContext } from "../MapMeasurementsContext";

export function useMapMeasurementsContext() {
  const ctx = useContext(MapMeasurementsContext);
  if (!ctx) {
    throw new Error(
      "useMapMeasurementsContext must be used within an MapMeasurementsProvider"
    );
  }
  return ctx;
}
