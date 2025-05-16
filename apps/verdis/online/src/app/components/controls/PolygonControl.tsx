import { ControlButtonStyler } from "@carma-mapping/map-controls-layout";
import type { Map as LeafletMap } from "leaflet";
import { useEffect, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet-draw/dist/leaflet.draw.css";
import "leaflet-draw";

export const PolygonControl = ({ routedMapRef }) => {
  const map: LeafletMap | undefined =
    routedMapRef.current?.leafletMap?.leafletElement;

  const [drawing, setDrawing] = useState(false);

  useEffect(() => {
    if (!map) return;
    const options = {
      allowIntersection: false,
      showArea: true,
      drawError: {
        color: "#e1e100",
        message: "<strong>Oh snap!<strong> you can't draw that!",
      },
    };
    const drawer = new L.Draw.Polygon(map, options);

    const onDrawCreated = (e) => {
      drawer.disable();
      setDrawing(false);
    };
    map.on(L.Draw.Event.CREATED, onDrawCreated);

    if (drawing) {
      drawer.enable();
    } else {
      drawer.disable();
    }

    // cleanup on unmount
    return () => {
      map.off(L.Draw.Event.CREATED, onDrawCreated);
      drawer.disable();
    };
  }, [map, drawing]);

  return (
    <div className="flex flex-col">
      <ControlButtonStyler
        onClick={() => setDrawing(true)}
        className="!border-b-0 !rounded-b-none font-bold !z-[9999999]"
        // title={`${tooltipPrefix}${
        //   backgrounds[mapping.selectedBackgroundIndex].title
        // }${tooltipPostfix}`}
      >
        <div>P</div>
      </ControlButtonStyler>
    </div>
  );
};
