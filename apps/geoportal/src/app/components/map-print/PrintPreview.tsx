import { useDispatch, useSelector } from "react-redux";
import { getUIMode } from "../../store/slices/ui";
import * as L from "leaflet";
import { useContext, useEffect, useState } from "react";
import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";
import {
  getDPI,
  getIsLoading,
  getOrientation,
  getPrintName,
  getRedrawPreview,
  getScale,
} from "../../store/slices/print";
import { getBackgroundLayer, getLayers } from "../../store/slices/mapping";
import { getPreviewBounds } from "../../helper/print";

interface DraggablePolygonOptions extends L.PolylineOptions {
  draggable?: boolean;
  prevPrintId?: string;
}
interface CustomPolygon extends L.Polygon {
  prevPrintId?: string;
}

const PrintPreview = () => {
  const mode = useSelector(getUIMode);
  const { routedMapRef } = useContext<typeof TopicMapContext>(TopicMapContext);
  const dispatch = useDispatch();
  const map = routedMapRef?.leafletMap?.leafletElement;
  const orientation = useSelector(getOrientation);
  const dpi = useSelector(getDPI);
  const printName = useSelector(getPrintName);
  const [lastOrientation, setlastOrientation] = useState(orientation);
  const [stepAfterPrinting, setStepAfterPrinting] = useState(false);
  const bgLayer = useSelector(getBackgroundLayer);
  const layers = useSelector(getLayers);
  const loading = useSelector(getIsLoading);
  const scale = useSelector(getScale);
  const redrawPrev = useSelector(getRedrawPreview);

  useEffect(() => {
    if (map && mode === "print") {
      //   const map = routedMapRef?.leafletMap?.leafletElement;

      const rectangleCoordinates = getPreviewBounds(map, scale, orientation);

      // map.fitBounds(bounds);
      //   const rectangleCoordinates = [sw, nw, ne, se, sw];

      const polygon = L.polygon(rectangleCoordinates, {
        color: "black",
        weight: 1,
        // fillOpacity: 0.3,
        draggable: true,
      } as DraggablePolygonOptions) as CustomPolygon;

      polygon.addTo(map);
      polygon.prevPrintId = "print-rect-id";

      polygon.on("dragstart", () => {
        // removePreviewWrapper();
      });
      polygon.on("dragend", () => {
        const newBounds = polygon.getBounds();
        map.fitBounds(newBounds);
      });
    }
  }, [
    map,
    mode,
    orientation,
    layers,
    dpi,
    printName,
    scale,
    redrawPrev,
    loading,
    stepAfterPrinting,
  ]);

  return (
    <>
      {mode === "print" && (
        <div
          id="preview"
          style={{ width: "200px", height: "20px", background: "black" }}
        ></div>
      )}
    </>
  );
};

export default PrintPreview;
