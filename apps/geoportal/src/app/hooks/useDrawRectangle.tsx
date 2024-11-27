import { useContext, useEffect, useState } from "react";
import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";
import { useSelector, useDispatch } from "react-redux";
import {
  getOrientation,
  getDPI,
  getPrintName,
  getIsLoading,
  changeIsLoading,
  getScale,
} from "../store/slices/print";
import { getUIMode } from "../store/slices/ui";
import { createRoot } from "react-dom/client";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXmark } from "@fortawesome/free-solid-svg-icons";
import proj4 from "proj4";
import { getBackgroundLayer, getLayers } from "../store/slices/mapping";
import {
  calculateBBox,
  drawRectangleFromBbox,
  deleteRectangleById as removeRectangle,
} from "../helper/print";
import PrintButton from "../components/map-print/PrintButton";

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

  const handleIsLoading = (status) => {
    dispatch(changeIsLoading(status));
  };

  const addRectangle = (map) => {
    removeRectangle(map);

    const centerLatLng = map.getCenter();
    const defaultlWidth = orientation === "landscape" ? 674 : 476;
    const defaultHeight = orientation === "landscape" ? 476 : 674;

    const projectedCenter = map.options.crs.project(centerLatLng);
    const centerX = projectedCenter.x;
    const centerY = projectedCenter.y;

    const bbox = calculateBBox(
      centerX,
      centerY,
      defaultlWidth,
      defaultHeight,
      72,
      scale
    );

    drawRectangleFromBbox(map, bbox);

    // removeRectangle();
    // printCb(
    //   tranformProj,
    //   scale,
    //   layesPrint,
    //   orientation,
    //   Number(dpi),
    //   printName,
    //   handleIsLoading
    // );
  };

  useEffect(() => {
    if (map && mode === "print") {
      const handleResize = () => {
        // removeRectangle();
        addRectangle(map);
      };
      addRectangle(map);
      // window.addEventListener("resize", handleResize);
      // map.on("zoom", handleResize);

      // return () => {
      //   window.removeEventListener("resize", handleResize);
      //   removeRectangle();
      // };
    } else if (map && mode === "print" && lastOrientation === orientation) {
      addRectangle(map);
      setlastOrientation(orientation);
    } else if (map && mode !== "print") {
      removeRectangle(map);
    }
  }, [map, mode, orientation, layers, dpi, printName, loading, scale]);
};
