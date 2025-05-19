import { ControlButtonStyler } from "@carma-mapping/map-controls-layout";
import type { Map as LeafletMap } from "leaflet";
import { useEffect, useState } from "react";
import { EditableMap } from "../Map";
import { useDispatch, useSelector } from "react-redux";
import { getDrawMode, setDrawMode } from "../../../store/slices/ui";

interface PolygonControlProps {
  routedMapRef: React.RefObject<any>;
  onCreated: (feature: GeoJSON.Feature) => void;
}

export const PolygonControl = ({
  routedMapRef,
  onCreated,
}: PolygonControlProps) => {
  const dispatch = useDispatch();
  const mode = useSelector(getDrawMode);

  const [drawing, setDrawing] = useState(false);
  const map: EditableMap | undefined =
    routedMapRef.current?.leafletMap?.leafletElement;

  useEffect(() => {
    if (!map || !map.editTools) return;

    const commitHandler = (e: any) => {
      setDrawing(false);
      const geojson = e.layer.toGeoJSON() as GeoJSON.Feature;
      e.layer.addTo(map);
      onCreated(geojson);
    };

    const cancelHandler = () => {
      setDrawing(false);
    };

    if (mode !== "polygon") {
      map.editTools.stopDrawing();
      setDrawing(false);
    }

    if (mode === "polygon") {
      map.editTools.startPolygon(null, {
        shapeOptions: { color: "#3388ff", weight: 4 },
        allowIntersection: false,
      });
      setDrawing(true);
    }

    map.on("editable:drawing:commit", commitHandler);
    map.on("editable:drawing:cancel", cancelHandler);
    return () => {
      map.off("editable:drawing:commit", commitHandler);
      map.off("editable:drawing:cancel", cancelHandler);
    };
  }, [map, mode]);

  const toggleDraw = () => {
    if (!map?.editTools) return;

    if (drawing) {
      map.editTools.stopDrawing();
      setDrawing(false);
    } else {
      setDrawing(true);
      dispatch(setDrawMode("polygon"));

      map.editTools.startPolygon(null, {
        shapeOptions: { color: "#3388ff", weight: 4 },
        allowIntersection: false,
      });
    }
  };

  return (
    <ControlButtonStyler onClick={toggleDraw} title="Fläche anlegen">
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
        <i className="fas fa-draw-polygon"></i>
      </div>
    </ControlButtonStyler>
  );
};
