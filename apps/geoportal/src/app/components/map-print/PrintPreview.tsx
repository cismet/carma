import { useDispatch, useSelector } from "react-redux";
import { getUIMode, setUIMode } from "../../store/slices/ui";
import * as L from "leaflet";
import { useContext, useEffect, useState } from "react";
import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";
import {
  changeIsLoading,
  changePrintError,
  getDPI,
  getIfMapPrinted,
  getIfPopupOpend,
  getIsLoading,
  getOrientation,
  getPrintName,
  getRedrawPreview,
  getScale,
} from "../../store/slices/print";
import { getBackgroundLayer, getLayers } from "../../store/slices/mapping";
import {
  deleteRectangleById,
  getCenterPrintPreview,
  getFontSizeForLandscape,
  getFontSizeForPortrait,
  getPolygonByLeafletId,
  getPolygonPoints,
  getPreviewBounds,
  getPrintLayers,
  getSmallSizeLandscape,
  getSmallSizePortrait,
  printMap,
} from "../../helper/print";
import ClosePrintButton from "./ClosePrintButton";
import PrintPrevTexts from "./PrintPrevTexts";
import PrintButton from "./PrintButton";
import "./print.css";

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
  const ifMapPrinted = useSelector(getIfMapPrinted);
  const printName = useSelector(getPrintName);
  const ifPopupOpened = useSelector(getIfPopupOpend);
  const [lastOrientation, setlastOrientation] = useState(orientation);
  const [stepAfterPrinting, setStepAfterPrinting] = useState(false);
  const [isHideContent, setIsHideContent] = useState(false);
  const [previewSizes, setRreviewSizes] = useState({
    top: "0px",
    left: "0px",
    width: "0px",
    height: "0px",
    fontSize: "0px",
    isSmallMode: false,
  });
  const bgLayer = useSelector(getBackgroundLayer);
  const layers = useSelector(getLayers);
  const loading = useSelector(getIsLoading);
  const scale = useSelector(getScale);
  const redrawPrev = useSelector(getRedrawPreview);

  const changePreviewSizes = (map, orientation) => {
    const polygon = getPolygonByLeafletId(map);
    if (polygon) {
      const { northWest, northEast, southWest } = getPolygonPoints(map);
      const wrapWidth = northEast.x - northWest.x;

      const isSmallMode =
        orientation === "portrait"
          ? getSmallSizePortrait(wrapWidth)
          : getSmallSizeLandscape(wrapWidth);

      setRreviewSizes({
        top: northWest.y + "px",
        left: northWest.x + "px",
        width: wrapWidth + "px",
        height: southWest.y - northWest.y + "px",
        fontSize:
          orientation === "portrait"
            ? getFontSizeForPortrait(wrapWidth)
            : getFontSizeForLandscape(wrapWidth),
        isSmallMode: isSmallMode,
      });
    }
  };

  const handleIsLoading = (status) => {
    dispatch(changeIsLoading(status));
  };

  const handleIsError = (status) => {
    dispatch(changePrintError(status));
  };

  useEffect(() => {
    // console.log("xxx pop up", ifPopupOpened);
    if (map && mode === "print" && !ifPopupOpened) {
      !ifMapPrinted && deleteRectangleById(map);
      const rectangleCoordinates = getPreviewBounds(
        map,
        scale,
        orientation,
        ifMapPrinted
      );
      if (rectangleCoordinates) {
        const polygon = L.polygon(rectangleCoordinates, {
          color: "black",
          weight: 1,
          draggable: !loading ? true : false,
        } as DraggablePolygonOptions) as CustomPolygon;

        polygon.addTo(map);
        polygon.prevPrintId = "print-rect-id";
        changePreviewSizes(map, orientation);

        polygon.on("dragstart", () => {
          setIsHideContent(true);
        });
        polygon.on("dragend", () => {
          const newBounds = polygon.getBounds();
          map.fitBounds(newBounds);
          setIsHideContent(false);
        });

        polygon.on("dblclick", () => {
          const polygonCenter = getCenterPrintPreview(map);
          const layesPrint = getPrintLayers(bgLayer, layers);
          printMap(
            polygonCenter,
            scale,
            layesPrint,
            orientation,
            Number(dpi),
            printName,
            handleIsLoading,
            handleIsError
          );
        });
      }

      const onZoomStart = () => setIsHideContent(true);
      const onZoomEnd = () => {
        changePreviewSizes(map, orientation);
        setIsHideContent(false);
      };
      const onMoveStart = () => setIsHideContent(true);
      const onMoveEnd = () => {
        changePreviewSizes(map, orientation);
        setIsHideContent(false);
      };

      const onMapClick = (e) => {
        // const ifPolygon = e.originalEvent.target?.classList.contains(
        //   "leaflet-path-draggable"
        // );
        const routedMap = e.originalEvent.target?.id === "routedMap";

        console.log("xxx on click", e.originalEvent.target.closest("#preview"));
        console.log("xxx on click", e.originalEvent.target);
        if (routedMap) {
          dispatch(setUIMode("default"));
          deleteRectangleById(map);
        }
      };
      const onEscKeyPress = (event) => {
        if (event.key === "Escape") {
          dispatch(setUIMode("default"));
          deleteRectangleById(map);
        }
      };
      map.on("click", onMapClick);

      map.on("zoomstart", onZoomStart);

      map.on("zoomend", onZoomEnd);

      map.on("movestart", onMoveStart);

      map.on("moveend", onMoveEnd);

      window.addEventListener("keydown", onEscKeyPress);

      return () => {
        // polygon.off();
        map.off("click", onMapClick);
        map.off("zoomstart", onZoomStart);
        map.off("zoomend", onZoomEnd);
        map.off("movestart", onMoveStart);
        map.off("moveend", onMoveEnd);
        window.removeEventListener("keydown", onEscKeyPress);
      };
    } else if (map && mode !== "print") {
      deleteRectangleById(map);
    }
  }, [
    map,
    mode,
    orientation,
    layers,
    dpi,
    ifMapPrinted,
    scale,
    redrawPrev,
    loading,
    ifPopupOpened,
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
          }}
        >
          <div id="btn-wrapper-print">
            <ClosePrintButton
              closePrintMode={() => console.log("xxx close btn")}
              hide={isHideContent}
              smallMode={previewSizes.isSmallMode}
            />
            <PrintPrevTexts
              scale={scale}
              dpi={dpi}
              format={orientation}
              hide={isHideContent}
              smallMode={previewSizes.isSmallMode}
            />
            <div className="flex items-center justify-end gap-4">
              <PrintButton
                hide={isHideContent}
                smallMode={previewSizes.isSmallMode}
                map={map}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default PrintPreview;
