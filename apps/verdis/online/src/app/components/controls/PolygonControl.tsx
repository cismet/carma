import { ControlButtonStyler } from "@carma-mapping/map-controls-layout";
import type { Polygon } from "leaflet";
import { useEffect, useState } from "react";
import { EditableMap } from "../Map";
import { useDispatch, useSelector } from "react-redux";
import { getDrawMode, setDrawMode } from "../../../store/slices/ui";

const MIN_POLYGON_VERTICES = 3;

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
  const [vertexCount, setVertexCount] = useState(0);
  const map: EditableMap | undefined =
    routedMapRef.current?.leafletMap?.leafletElement;

  useEffect(() => {
    if (!map || !map.editTools) return;

    const commitHandler = (e: any) => {
      setDrawing(false);
      setVertexCount(0);
      const geojson = e.layer.toGeoJSON() as GeoJSON.Feature;
      e.layer.addTo(map);
      onCreated(geojson);
    };

    const cancelHandler = () => {
      setDrawing(false);
      setVertexCount(0);
    };

    const vertexHandler = (e: { layer: Polygon }) => {
      if (!map.editTools.drawing()) return;
      const ring = e.layer.getLatLngs()[0] as unknown[] | undefined;
      setVertexCount(ring?.length ?? 0);
    };

    if (mode !== "polygon") {
      map.editTools.stopDrawing();
      setDrawing(false);
      setVertexCount(0);
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
    map.on("editable:vertex:new", vertexHandler);
    map.on("editable:vertex:deleted", vertexHandler);
    return () => {
      map.off("editable:drawing:commit", commitHandler);
      map.off("editable:drawing:cancel", cancelHandler);
      map.off("editable:vertex:new", vertexHandler);
      map.off("editable:vertex:deleted", vertexHandler);
    };
  }, [map, mode]);

  const toggleDraw = () => {
    if (!map?.editTools) return;

    if (drawing) {
      map.editTools.stopDrawing();
      setDrawing(false);
      setVertexCount(0);
    } else {
      setDrawing(true);
      dispatch(setDrawMode("polygon"));

      map.editTools.startPolygon(null, {
        shapeOptions: { color: "#3388ff", weight: 4 },
        allowIntersection: false,
      });
    }
  };

  // easier than tapping the first or last vertex to close the shape
  const finishDraw = () => {
    if (vertexCount < MIN_POLYGON_VERTICES) return;
    map?.editTools.commitDrawing();
  };

  return (
    <div style={{ position: "relative" }}>
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
      {drawing && (
        // absolute, so the column of other controls keeps its width
        <div
          style={{
            position: "absolute",
            top: 0,
            left: "calc(100% + 0.625rem)",
          }}
        >
          <ControlButtonStyler
            onClick={finishDraw}
            title="Fläche abschließen"
            disabled={vertexCount < MIN_POLYGON_VERTICES}
            fontSize="16px"
          >
            <i className="fas fa-check" style={{ color: "#008AFA" }}></i>
          </ControlButtonStyler>
        </div>
      )}
    </div>
  );
};
