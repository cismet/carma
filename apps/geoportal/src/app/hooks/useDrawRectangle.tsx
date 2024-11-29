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
} from "../store/slices/print";
import { getUIMode, setUIMode } from "../store/slices/ui";
// import { createRoot } from "react-dom/client";
// import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
// import { faXmark } from "@fortawesome/free-solid-svg-icons";
import proj4 from "proj4";
import { getBackgroundLayer, getLayers } from "../store/slices/mapping";
import {
  drawRectanglePrev,
  getPrintLayers,
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
  const bgLayer = useSelector(getBackgroundLayer);
  const layers = useSelector(getLayers);
  const loading = useSelector(getIsLoading);
  const scale = useSelector(getScale);
  const redrawPrev = useSelector(getRedrawPreview);

  const handleIsLoading = (status) => {
    dispatch(changeIsLoading(status));
  };

  const handleIsError = (status) => {
    dispatch(changePrintError(status));
  };

  const handleStartPrint = (map) => {
    const { lat, lng } = map.getCenter();
    const tranformProj = proj4("EPSG:4326", "EPSG:3857", [lng, lat]);
    const layesPrint = getPrintLayers(bgLayer, layers);
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

  const addRectangle = (map, routedMapRef, scale, orientation) => {
    removeRectangle(map);
    drawRectanglePrev(routedMapRef, scale, orientation, handleStartPrint);
  };

  useEffect(() => {
    if (map && mode === "print") {
      const handleClick = (e) => {
        if (
          !e.originalEvent.target?.classList.contains("leaflet-path-draggable")
        ) {
          dispatch(setUIMode("default"));
        }
      };
      addRectangle(map, routedMapRef, scale, orientation);

      const handleEscKeyPress = (event) => {
        if (event.key === "Escape") {
          dispatch(setUIMode("default"));
        }
      };
      window.addEventListener("keydown", handleEscKeyPress);
      map.on("click", handleClick);

      return () => {
        map.off("dblclick", handleClick);
        removeRectangle(map);
      };
    } else if (map && mode === "print" && lastOrientation === orientation) {
      addRectangle(map, routedMapRef, scale, orientation);
      setlastOrientation(orientation);
    } else if (map && mode !== "print") {
      removeRectangle(map);
    }
  }, [map, mode, orientation, layers, dpi, printName, scale, redrawPrev]);

  useEffect(() => {
    const pathElement = document.querySelector(
      "path.leaflet-path-draggable.leaflet-interactive"
    ) as SVGPathElement | null;

    if (pathElement) {
      if (loading) {
        pathElement.style.cursor = "wait";
      } else {
        pathElement.style.cursor = "default";
      }
    }
  }, [loading]);
};
