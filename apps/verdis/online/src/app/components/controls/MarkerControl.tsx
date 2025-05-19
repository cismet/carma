import React, { useEffect, useState } from "react";
import { ControlButtonStyler } from "@carma-mapping/map-controls-layout";
import type { Map as LeafletMap } from "leaflet";
import { EditableMap } from "../Map";

interface MarkerControlProps {
  routedMapRef: React.RefObject<any>;
  onCreated: (feature: GeoJSON.Feature) => void;
  tooltip?: string;
}

export const MarkerControl: React.FC<MarkerControlProps> = ({
  routedMapRef,
  onCreated,
  tooltip = "Punkt anlegen",
}) => {
  const [drawing, setDrawing] = useState(false);
  const map: EditableMap | undefined =
    routedMapRef.current?.leafletMap?.leafletElement;

  useEffect(() => {
    if (!map || !map.editTools) return;

    const commitHandler = (e: any) => {
      setDrawing(false);
      const layer = e.layer;
      layer.addTo(map);
      const feature = layer.toGeoJSON() as GeoJSON.Feature;
      onCreated(feature);
    };

    const cancelHandler = () => {
      setDrawing(false);
    };

    map.on("editable:drawing:commit", commitHandler);
    map.on("editable:drawing:cancel", cancelHandler);

    return () => {
      map.off("editable:drawing:commit", commitHandler);
      map.off("editable:drawing:cancel", cancelHandler);
    };
  }, [map, onCreated]);

  const togglePlacing = () => {
    if (!map?.editTools) return;
    if (drawing) {
      map.editTools.stopDrawing();
      setDrawing(false);
    } else {
      setDrawing(true);
      map.editTools.startMarker({
        repeatMode: false,
        draggable: true,
      });
    }
  };

  return (
    <ControlButtonStyler onClick={togglePlacing} title={tooltip}>
      <div
        style={{
          border: drawing ? "3px solid #008AFA" : "3px solid transparent",
          width: "28px",
          height: "28px",
          borderRadius: "2px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "14px",
        }}
      >
        <i className="fas fa-map-marker-alt"></i>
      </div>
    </ControlButtonStyler>
  );
};
