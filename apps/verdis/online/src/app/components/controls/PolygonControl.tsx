import { ControlButtonStyler } from "@carma-mapping/map-controls-layout";
import type { Map as LeafletMap } from "leaflet";
import React from "react";

interface PolygonControlProps {
  routedMapRef: React.RefObject<any>;
}

export const PolygonControl = ({ routedMapRef }: PolygonControlProps) => {
  const handleClick = () => {
    const map: LeafletMap | undefined =
      routedMapRef.current?.leafletMap?.leafletElement;
    if (!map) return console.warn("Map not ready");
    if (!map.editTools?.startPolygon) {
      return console.error("`leaflet-editable` not loaded");
    }

    map.editTools.startPolygon(null, {
      shapeOptions: { color: "#3388ff", weight: 4 },
      allowIntersection: false,
    });
  };

  return (
    <ControlButtonStyler
      onClick={handleClick}
      className="!border-b-0 !rounded-b-none font-bold"
    >
      Draw Polygon
    </ControlButtonStyler>
  );
};
