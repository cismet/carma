import React, { useEffect, useState } from "react";
import { ControlButtonStyler } from "@carma-mapping/map-controls-layout";
import type { Map as LeafletMap } from "leaflet";

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
  const [placing, setPlacing] = useState(false);
  const map: LeafletMap | undefined =
    routedMapRef.current?.leafletMap?.leafletElement;

  useEffect(() => {
    if (!map || !map.editTools) return;

    const commitHandler = (e: any) => {
      setPlacing(false);
      const layer = e.layer;
      layer.addTo(map);
      const feature = layer.toGeoJSON() as GeoJSON.Feature;
      onCreated(feature);
    };

    const cancelHandler = () => {
      setPlacing(false);
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
    if (placing) {
      map.editTools.stopDrawing();
      setPlacing(false);
    } else {
      setPlacing(true);
      map.editTools.startMarker({
        repeatMode: false,
        draggable: true,
      });
    }
  };

  return (
    <ControlButtonStyler onClick={togglePlacing} title={tooltip}>
      <i className="fas fa-map-marker-alt"></i>
    </ControlButtonStyler>
  );
};
