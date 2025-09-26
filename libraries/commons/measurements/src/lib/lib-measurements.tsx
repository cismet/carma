import React from "react";
import { useContext, useEffect } from "react";
import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";

export function LibMeasurements({ startDrawing }: { startDrawing: boolean }) {
  const { routedMapRef } = useContext<typeof TopicMapContext>(TopicMapContext);
  useEffect(() => {
    const map = routedMapRef?.leafletMap?.leafletElement;
    if (!map) return;
    if (startDrawing) {
    }
  }, [routedMapRef, startDrawing]);
  return <div>Measurements</div>;
}
