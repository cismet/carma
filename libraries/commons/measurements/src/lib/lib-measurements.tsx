import React from "react";
import { useContext, useEffect } from "react";
import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";

export function LibMeasurements() {
  const { routedMapRef } = useContext<typeof TopicMapContext>(TopicMapContext);
  useEffect(() => {
    const map = routedMapRef?.leafletMap?.leafletElement;
    if (!map) return;
  }, [routedMapRef]);
  return <div>Measurements</div>;
}
