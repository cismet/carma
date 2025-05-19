import { ControlButtonStyler } from "@carma-mapping/map-controls-layout";
import type { Map as LeafletMap } from "leaflet";
import { useEffect, useState } from "react";

interface PolygonControlProps {
  routedMapRef: React.RefObject<any>;
  onCreated: (feature: GeoJSON.Feature) => void;
}

export const PolygonControl = ({
  routedMapRef,
  onCreated,
}: PolygonControlProps) => {
  const [drawing, setDrawing] = useState(false);
  const map: LeafletMap | undefined =
    routedMapRef.current?.leafletMap?.leafletElement;

  useEffect(() => {
    if (!map || !map.editTools) return;

    const commitHandler = (e: any) => {
      console.log("xxx stop drawing");
      setDrawing(false);
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
    setDrawing(true);
    map.editTools.startPolygon(null, {
      shapeOptions: { color: "#3388ff", weight: 4 },
      allowIntersection: false,
    });
  };

  return (
    <ControlButtonStyler onClick={startDraw}>
      <div
        style={{
          //   position: "relative",
          border: drawing ? "2px solid #008AFA" : "2px solid transparent",
          width: "28px",
          height: "28px",
          borderRadius: "2px",
          top: 0,
          left: 0,
        }}
      >
        <i className="fas fa-draw-polygon"></i>
      </div>
    </ControlButtonStyler>
  );
};
