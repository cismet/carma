import { useContext, useEffect, useState } from "react";
import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";
import { useSelector, useDispatch } from "react-redux";
import {
  getOrientation,
  getDPI,
  getPrintName,
  getIsLoading,
  changeIsLoading,
  changePrintError,
  getScale,
  getRedrawPreview,
  changeRedrawPreview,
} from "../store/slices/print";
import { getUIMode, setUIMode } from "../store/slices/ui";
// import { createRoot } from "react-dom/client";
// import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
// import { faXmark } from "@fortawesome/free-solid-svg-icons";
import proj4 from "proj4";
import { getBackgroundLayer, getLayers } from "../store/slices/mapping";
import {
  addPreviewWrapper,
  drawRectanglePrev,
  getPolygonByLeafletId,
  getPrintLayers,
  removePreviewWrapper,
  deleteRectangleById as removeRectangle,
} from "../helper/print";
// import PrintButton from "../components/map-print/PrintButton";

export const useDrawRectangle = (printCb, printOffCb) => {
  const { routedMapRef } = useContext<typeof TopicMapContext>(TopicMapContext);
  const dispatch = useDispatch();
  const map = routedMapRef?.leafletMap?.leafletElement;
  const mode = useSelector(getUIMode);
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

  const handleIsLoading = (status) => {
    dispatch(changeIsLoading(status));
  };

  const handleClosePrint = () => {
    dispatch(setUIMode("default"));
    removePreviewWrapper();
  };

  const handleRedraw = (redrawPrev) => {
    dispatch(changeRedrawPreview(!redrawPrev));
    removePreviewWrapper();
  };

  const handleIsError = (status) => {
    dispatch(changePrintError(status));
  };

  const handleStartPrint = (map) => {
    const prevPolygon = getPolygonByLeafletId(map);
    const bounds = prevPolygon.getBounds();
    const center = bounds.getCenter();
    const { lat, lng } = center;
    const tranformProj = proj4("EPSG:4326", "EPSG:3857", [lng, lat]);
    const layesPrint = getPrintLayers(bgLayer, layers);
    setStepAfterPrinting(true);
    printCb(
      tranformProj,
      scale,
      layesPrint,
      orientation,
      Number(dpi),
      printName,
      handleIsLoading,
      handleIsError
    );
  };

  const addRectangle = (
    map,
    routedMapRef,
    scale,
    orientation,
    loading,
    handleClosePrint,
    handleRedraw
  ) => {
    removeRectangle(map);
    drawRectanglePrev(
      routedMapRef,
      scale,
      orientation,
      handleStartPrint,
      loading,
      dpi,
      handleClosePrint,
      handleRedraw
      // redrawPrev
    );
  };

  useEffect(() => {
    if (map && mode === "print") {
      const handleClick = (e) => {
        const ifPolygon = e.originalEvent.target?.classList.contains(
          "leaflet-path-draggable"
        );
        const ifPrintButton =
          e.originalEvent.target?.classList.contains("rectangle-button");
        if (!ifPolygon && !ifPrintButton) {
          dispatch(setUIMode("default"));
          removePreviewWrapper();
        }
      };
      if (stepAfterPrinting) {
        setStepAfterPrinting(false);
      }
      if (!loading && !stepAfterPrinting) {
        addRectangle(
          map,
          routedMapRef,
          scale,
          orientation,
          loading,
          handleClosePrint,
          handleRedraw
        );
      }

      const handleEscKeyPress = (event) => {
        if (event.key === "Escape") {
          dispatch(setUIMode("default"));
          removePreviewWrapper();
        }
      };
      const zoomendHandler = () => {
        // setStepAfterPrinting(false);
        addPreviewWrapper(
          map,
          handleStartPrint,
          loading,
          orientation,
          scale,
          dpi,
          false,
          handleClosePrint
        );
      };

      const movestartHandler = () => {
        removePreviewWrapper();
        // setStepAfterPrinting(false);
        addPreviewWrapper(
          map,
          handleStartPrint,
          loading,
          orientation,
          scale,
          dpi,
          true,
          handleClosePrint
        );
      };

      const moveendtHandler = () => {
        addPreviewWrapper(
          map,
          handleStartPrint,
          loading,
          orientation,
          scale,
          dpi,
          false,
          handleClosePrint
          // handleRedraw
        );
      };
      window.addEventListener("keydown", handleEscKeyPress);
      map.on("click", handleClick);
      map.on("zoomend", zoomendHandler);
      map.on("movestart", movestartHandler);
      map.on("moveend", moveendtHandler);

      return () => {
        map.off("click", handleClick);
        map.off("dblclick", handleClick);
        map.off("movestart", movestartHandler);
        map.off("moveend", moveendtHandler);

        // removeRectangle(map);
      };
    } else if (map && mode === "print" && lastOrientation === orientation) {
      if (!loading && !stepAfterPrinting) {
        addRectangle(
          map,
          routedMapRef,
          scale,
          orientation,
          loading,
          handleClosePrint,
          handleRedraw
        );
      }
      setlastOrientation(orientation);
    } else if (map && mode !== "print") {
      removeRectangle(map);
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
};
