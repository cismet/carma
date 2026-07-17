import * as L from "leaflet";
import { CSSProperties, useContext, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";
import {
  deleteRectangleById,
  getCenterPrintPreview,
  getFontSizeForLandscape,
  getFontSizeForPortrait,
  getPolygonByLeafletId,
  getPolygonPoints,
  getPreviewBboxWGS84,
  getPreviewBounds,
  fitPreviewBounds,
  getPrintLayers,
  getSmallSizeLandscape,
  getSmallSizePortrait,
  printMap,
} from "./print.helper";
import ClosePrintButton from "./ClosePrintButton";
import PrintPrevTexts from "./PrintPrevTexts";
import PrintButton from "./PrintButton";
import "./print.css";
import UpdateScalePrintButton from "./UpdateScalePrintButton";

interface DraggablePolygonOptions extends L.PolylineOptions {
  draggable?: boolean;
  prevPrintId?: string;
}
interface CustomPolygon extends L.Polygon {
  prevPrintId?: string;
}

// Redux removed: every value the component used to read via useSelector
// (mode/orientation/dpi/ifMapPrinted/printName/ifPopupOpened/bgLayer/layers/
// loading/scale/redrawPrev) now arrives as a prop, and every write it used to
// dispatch is provided as a callback (setUIMode, handleIsLoading,
// handleIsError, setIfMapPrinted, setRedrawPreview). The Leaflet map is still
// taken from the react-cismap TopicMapContext, exactly as in the app.
const PrintPreview = ({
  mode,
  orientation,
  dpi,
  ifMapPrinted,
  printName,
  ifPopupOpened,
  bgLayer,
  layers,
  loading,
  scale,
  redrawPrev,
  maplibreMaps,
  setUIMode,
  handleIsLoading,
  handleIsError,
  setIfMapPrinted,
  setRedrawPreview,
}) => {
  const { routedMapRef } = useContext<typeof TopicMapContext>(TopicMapContext);
  const map = routedMapRef?.leafletMap?.leafletElement;
  // Host node for the print controls, rendered as a sibling of the Leaflet
  // container (never a descendant). react-cismap attaches a map-level click
  // listener that deselects the highlighted feature on *every* map click. If
  // the "Drucken" button lived inside the container, its click would bubble to
  // Leaflet and clear the selection before printMap() captures it. Portalling
  // the overlay out of the container keeps those clicks off the map, while
  // React portals still deliver them to the buttons' onClick. The node is
  // inset:0 over the container's parent so the existing container-point
  // coordinates (top/left) keep aligning with the map's top-left.
  const [overlayEl, setOverlayEl] = useState<HTMLDivElement | null>(null);
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

  useEffect(() => {
    if (!map) return;
    const mapContainer: HTMLElement = map.getContainer();
    const parent = mapContainer.parentElement;
    if (!parent) return;
    if (getComputedStyle(parent).position === "static") {
      parent.style.position = "relative";
    }
    const el = document.createElement("div");
    el.id = "carma-print-overlay-root";
    el.style.position = "absolute";
    el.style.inset = "0";
    el.style.zIndex = "1000";
    // Only the buttons (pointer-events: auto) capture clicks; everything else
    // stays transparent so map drag/zoom and the draggable preview rectangle
    // underneath keep working.
    el.style.pointerEvents = "none";
    parent.appendChild(el);
    setOverlayEl(el);
    return () => {
      el.remove();
      setOverlayEl(null);
    };
  }, [map]);

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

  useEffect(() => {
    if (map && mode === "print") {
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
          fitPreviewBounds(map, newBounds);
          setTimeout(() => {
            setIsHideContent(false);
          }, 250);
        });

        polygon.on("click", (e) => {
          L.DomEvent.stopPropagation(e);
        });
        polygon.on("dblclick", (e) => {
          L.DomEvent.stopPropagation(e);
          L.DomEvent.preventDefault(e.originalEvent);
          const polygonCenter = getCenterPrintPreview(map);
          const layesPrint = getPrintLayers(bgLayer, layers, {
            maplibreMaps,
            bbox: getPreviewBboxWGS84(map),
          });
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
        const routedMap = e.originalEvent.target?.id === "routedMap";
        const glLayer =
          e.originalEvent.target?.classList.contains("leaflet-gl-layer");

        if (routedMap || glLayer) {
          setUIMode("default");
          deleteRectangleById(map);
        }
      };
      const onEscKeyPress = (event) => {
        if (event.key === "Escape") {
          setUIMode("default");
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
    // ifPopupOpened,
    stepAfterPrinting,
  ]);

  const wrapperStyle: CSSProperties = {
    padding: "7px 7px",
    width: "100%",
    height: "100%",
    display: "flex",
    flexDirection: "column",
    flexGrow: "1",
    pointerEvents: "none",
  };

  const smallWrapperStyle: CSSProperties = {
    padding: "0px",
    width: "100%",
    height: "100%",
    display: "flex",
    flexGrow: "1",
    justifyContent: "center",
    alignItems: "center",
    pointerEvents: "none",
  };

  if (mode !== "print" || !overlayEl) {
    return null;
  }

  return createPortal(
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
      <div
        id="btn-wrapper-print"
        style={previewSizes.isSmallMode ? smallWrapperStyle : wrapperStyle}
      >
        <div style={{ display: "flex", width: "100%" }}>
          <UpdateScalePrintButton
            hide={isHideContent}
            smallMode={previewSizes.isSmallMode}
            previewWidth={previewSizes.width}
            previewHight={previewSizes.height}
            redrawPrev={redrawPrev}
            setIfMapPrinted={setIfMapPrinted}
            setRedrawPreview={setRedrawPreview}
          />
          <ClosePrintButton
            closePrintMode={() => setUIMode("default")}
            hide={isHideContent}
            smallMode={previewSizes.isSmallMode}
          />
        </div>
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
            orientation={orientation}
            dpi={dpi}
            printName={printName}
            bgLayer={bgLayer}
            layers={layers}
            loading={loading}
            scale={scale}
            maplibreMaps={maplibreMaps}
            setIfMapPrinted={setIfMapPrinted}
            handleIsLoading={handleIsLoading}
            handleIsError={handleIsError}
          />
        </div>
      </div>
    </div>,
    overlayEl
  );
};

export default PrintPreview;
