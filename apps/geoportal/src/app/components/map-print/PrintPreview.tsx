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
import {
  getFontSizeForLandscape,
  getFontSizeForPortrait,
  getPolygonPoints,
  getPreviewBounds,
} from "../../helper/print";

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
  const [previewSizes, setRreviewSizes] = useState({
    top: "0px",
    left: "0px",
    width: "0px",
    height: "0px",
    fontSize: "0px",
  });
  const bgLayer = useSelector(getBackgroundLayer);
  const layers = useSelector(getLayers);
  const loading = useSelector(getIsLoading);
  const scale = useSelector(getScale);
  const redrawPrev = useSelector(getRedrawPreview);

  useEffect(() => {
    if (map && mode === "print") {
      const rectangleCoordinates = getPreviewBounds(map, scale, orientation);
      const polygon = L.polygon(rectangleCoordinates, {
        color: "black",
        weight: 1,
        // fillOpacity: 0.3,
        draggable: true,
      } as DraggablePolygonOptions) as CustomPolygon;

      polygon.addTo(map);
      polygon.prevPrintId = "print-rect-id";
      const { northWest, northEast, southWest } = getPolygonPoints(map);
      const wrapWidth = northEast.x - northWest.x;

      setRreviewSizes({
        top: northWest.y + "px",
        left: northWest.x + "px",
        width: wrapWidth + "px",
        height: southWest.y - northWest.y + "px",
        fontSize:
          orientation === "portrait"
            ? getFontSizeForPortrait(wrapWidth)
            : getFontSizeForLandscape(wrapWidth),
      });

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
          style={{
            width: previewSizes.width,
            height: previewSizes.height,
            top: previewSizes.top,
            left: previewSizes.left,
            fontSize: previewSizes.fontSize,
            background: "black",
            opacity: "0.4",
          }}
        ></div>
      )}
    </>
  );
};

export default PrintPreview;
