import { useContext, useEffect, useRef } from "react";

import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";

import L from "leaflet";
import "leaflet-draw";

import "leaflet/dist/leaflet.css";
import "leaflet-draw/dist/leaflet.draw.css";

export function LibMeasurements({ startDrawing }: { startDrawing: boolean }) {
  const { routedMapRef } = useContext<typeof TopicMapContext>(TopicMapContext);
  const featureGroupRef = useRef<L.FeatureGroup | null>(null);
  const drawHandlerRef = useRef<L.Draw.Polygon | null>(null);
  const createdListenerAttached = useRef(false);

  useEffect(() => {
    const map = routedMapRef?.leafletMap?.leafletElement as L.Map | undefined;
    if (!map) return;

    if (!featureGroupRef.current) {
      featureGroupRef.current = new L.FeatureGroup();
      map.addLayer(featureGroupRef.current);
    }

    const handleCreated = (e: any) => {
      const layer = e.layer as L.Layer;
      featureGroupRef.current?.addLayer(layer);
      // After one polygon is created, stop drawing automatically
      if (drawHandlerRef.current) {
        drawHandlerRef.current.disable();
        drawHandlerRef.current = null;
      }
    };

    // Attach once
    if (!createdListenerAttached.current) {
      map.on("draw:created", handleCreated);
      createdListenerAttached.current = true;
    }

    if (startDrawing) {
      // If a previous handler is still around, disable it first
      if (drawHandlerRef.current) {
        drawHandlerRef.current.disable();
        drawHandlerRef.current = null;
      }

      if (!(map instanceof L.DrawMap)) {
        console.warn("[MEASUREMENTS] map is not a DrawMap");
      }

      // Create a fresh polygon draw handler and enable it
      const handler = new L.Draw.Polygon(map as L.DrawMap, {
        showArea: true,
        shapeOptions: {
          color: "#3388ff",
          weight: 3,
          opacity: 1,
          fillOpacity: 0.2,
        },
      });
      drawHandlerRef.current = handler;
      handler.enable();
    } else {
      // If toggled off from parent, ensure handler is disabled
      if (drawHandlerRef.current) {
        drawHandlerRef.current.disable();
        drawHandlerRef.current = null;
      }
    }

    return () => {
      // On unmount, remove listener and clean up
      if (createdListenerAttached.current) {
        map.off("draw:created");
        createdListenerAttached.current = false;
      }
      if (drawHandlerRef.current) {
        drawHandlerRef.current.disable();
        drawHandlerRef.current = null;
      }
      if (featureGroupRef.current) {
        // keep layers if desired; or clear if you prefer a clean tear-down
        // featureGroupRef.current.clearLayers();
        // map.removeLayer(featureGroupRef.current);
        // featureGroupRef.current = null;
      }
    };
  }, [routedMapRef, startDrawing]);

  // This component is UI-less; it wires draw interactions to the map
  return null;
}
