import {
  ControlButtonStyler,
  DEFAULT_CONTROL_STYLE_OPTIONS,
} from "@carma-mapping/map-controls-layout";
import type { Polygon } from "leaflet";
import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { EditableMap } from "../Map";
import { useDispatch, useSelector } from "react-redux";
import { getDrawMode, setDrawMode } from "../../../store/slices/ui";

const MIN_POLYGON_VERTICES = 3;

const { layout, button } = DEFAULT_CONTROL_STYLE_OPTIONS;

const finishButtonStyle: CSSProperties = {
  position: "absolute",
  top: 0,
  left: `calc(100% + ${layout.controlGroupGap})`,
  width: button.root.width,
  height: button.root.height,
  padding: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: "1rem",
  borderRadius: button.root.borderRadius,
  boxShadow: "0 1px 4px rgba(0, 0, 0, 0.25)",
  color: "#fff",
  backgroundColor: "#008AFA",
  border: "2px solid #0070cc",
  cursor: "pointer",
};

const finishButtonWaitingStyle: CSSProperties = {
  ...finishButtonStyle,
  opacity: 0.45,
  boxShadow: "none",
  cursor: "default",
};

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

  const canFinish = vertexCount >= MIN_POLYGON_VERTICES;

  const finishDraw = () => {
    if (!canFinish) return;
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
      {drawing && vertexCount > 0 && (
        <button
          type="button"
          onClick={finishDraw}
          disabled={!canFinish}
          title="Fläche abschließen"
          aria-label="Fläche abschließen"
          style={canFinish ? finishButtonStyle : finishButtonWaitingStyle}
        >
          <i className="fas fa-check" />
        </button>
      )}
    </div>
  );
};
