import { ControlButtonStyler } from "@carma-mapping/map-controls-layout";
import type { Map as LeafletMap } from "leaflet";
import { useEffect } from "react";

interface PolygonControlProps {
  routedMapRef: React.RefObject<any>;
  onCreated: (feature: GeoJSON.Feature) => void;
}

export const PolygonControl = ({
  routedMapRef,
  onCreated,
}: PolygonControlProps) => {
  const map: LeafletMap | undefined =
    routedMapRef.current?.leafletMap?.leafletElement;

  useEffect(() => {
    if (!map || !map.editTools) return;

    const commitHandler = (e: any) => {
      const geojson = e.layer.toGeoJSON() as GeoJSON.Feature;
      e.layer.addTo(map);
      onCreated(geojson);
    };

    map.on("editable:drawing:commit", commitHandler);
    return () => {
      map.off("editable:drawing:commit", commitHandler);
    };
  }, [map, onCreated]);

  const startDraw = () => {
    if (!map?.editTools?.startPolygon) return;
    map.editTools.startPolygon(null, {
      shapeOptions: { color: "#3388ff", weight: 4 },
      allowIntersection: false,
    });
  };

  return (
    <ControlButtonStyler onClick={startDraw}>
      <i className="fas fa-draw-polygon"></i>
    </ControlButtonStyler>
  );
};
