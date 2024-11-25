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
import { getPrintLayers, prevRectCalc } from "../helper/print";
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

  const hadlerStartPrint = (map) => {
    const { lat, lng } = map.getCenter();

    const tranformProj = proj4("EPSG:4326", "EPSG:3857", [lng, lat]);

    const zoomLevel = map.getZoom();

    // const scale = map.options.crs.scale(zoomLevel);

    const scale2 = map.getScaleZoom(zoomLevel);
    const testScale = getScaleInKmExperiment(zoomLevel);

    const layesPrint = getPrintLayers(bgLayer, layers);

    printCb(
      tranformProj,
      scale,
      layesPrint,
      orientation,
      dpi,
      printName,
      handleIsLoading
    );
  };

  const removeRectangle = () => {
    const printBtn = document.querySelector(".rectangle-wrapper ");

    if (printBtn) {
      printBtn.remove();
    }
  };

  const addRectangle = (map) => {
    // const pixelWidth = orientation === "landscape" ? 674 : 476;
    // const pixelHeight = orientation === "landscape" ? 476 : 674;
    // const pixelWidth = 674;
    // const pixelHeight = 476;
    const { pixelWidth, pixelHeight } = prevRectCalc(
      map.getZoom(),
      scale,
      674,
      476
    );
    const mapContainer = map.getContainer();
    const mapWidth = mapContainer.offsetWidth;
    const mapHeight = mapContainer.offsetHeight;

    const left = (mapWidth - pixelWidth) / 2;
    const top = (mapHeight - pixelHeight) / 2;

    const zoom = map.getZoom();

    console.log("xxx zoom", zoom);

    const wrapper = L.DomUtil.create("div", "rectangle-wrapper");
    wrapper.style.position = "absolute";
    wrapper.style.top = `${top}px`;
    wrapper.style.left = `${left}px`;
    wrapper.style.zIndex = 999;

    const rect = L.DomUtil.create("div", "rectangle-prev");
    rect.style.width = pixelWidth + "px";
    rect.style.height = pixelHeight + "px";

    const btnWrapper = L.DomUtil.create("button", "print-button-wrapper");

    const closeButtonContainer = L.DomUtil.create(
      "div",
      "rectangle-close",
      wrapper
    );

    wrapper.appendChild(rect);
    wrapper.appendChild(btnWrapper);

    mapContainer.appendChild(wrapper);

    const root = createRoot(closeButtonContainer);
    root.render(
      <FontAwesomeIcon
        icon={faXmark}
        className="text-2xl cursor-pointer"
        onClick={() => printOffCb()}
      />
    );

    const wrapperRoot = createRoot(btnWrapper);
    wrapperRoot.render(
      <PrintButton
        hadlerStartPrint={() => hadlerStartPrint(map)}
        loading={loading}
      />
    );
  };

  const getScaleInKm = (zoom) => {
    const dpi = 96;
    // const dpi = 88;
    const metersPerInch = 0.0254;
    const earthCircumference = 40075016.6856;
    const tileSize = 256;

    const resolution = earthCircumference / (tileSize * Math.pow(2, zoom));

    const scale = resolution * dpi * (1 / metersPerInch);

    return Math.round(scale);
  };

  const getScaleInKmExperiment = (zoom) => {
    const dpi = 94;
    const metersPerInch = 0.0254;
    const earthCircumference = 40075016.6856;
    const tileSize = 256;

    const resolution = earthCircumference / (tileSize * Math.pow(2, zoom + 1));

    const scale = (resolution * dpi) / metersPerInch;

    return scale;
  };

  useEffect(() => {
    if (map && mode === "print") {
      const handleResize = () => {
        removeRectangle();
        addRectangle(map);
      };

      addRectangle(map);
      window.addEventListener("resize", handleResize);
      map.on("zoom", handleResize);

      return () => {
        window.removeEventListener("resize", handleResize);
        removeRectangle();
      };
    } else if (map && mode === "print" && lastOrientation === orientation) {
      removeRectangle();
      addRectangle(map);
      setlastOrientation(orientation);
    } else if (map && mode !== "print") {
      removeRectangle();
    }
  }, [map, mode, orientation, layers, dpi, printName, loading, scale]);
};
