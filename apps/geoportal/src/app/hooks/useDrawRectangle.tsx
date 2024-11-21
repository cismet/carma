import { useContext, useEffect, useState } from "react";
import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";
import { useSelector } from "react-redux";
import { getOrientation } from "../store/slices/print";
import { getUIMode } from "../store/slices/ui";
import { createRoot } from "react-dom/client";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXmark } from "@fortawesome/free-solid-svg-icons";
import proj4 from "proj4";

export const useDrawRectangle = (printCb, printOffCb) => {
  const { routedMapRef } = useContext<typeof TopicMapContext>(TopicMapContext);
  const map = routedMapRef?.leafletMap?.leafletElement;
  const mode = useSelector(getUIMode);
  const orientation = useSelector(getOrientation);
  const [lastOrientation, setlastOrientation] = useState(orientation);

  const removeRectangle = () => {
    const printBtn = document.querySelector(".rectangle-wrapper ");

    if (printBtn) {
      printBtn.remove();
    }
  };

  const addRectangle = (map) => {
    const pixelWidth = orientation === "landscape" ? 495 : 350;
    const pixelHeight = orientation === "landscape" ? 350 : 495;
    const mapContainer = map.getContainer();
    const mapWidth = mapContainer.offsetWidth;
    const mapHeight = mapContainer.offsetHeight;

    const left = (mapWidth - pixelWidth) / 2;
    const top = (mapHeight - pixelHeight) / 2;

    const wrapper = L.DomUtil.create("div", "rectangle-wrapper");
    wrapper.style.position = "absolute";
    wrapper.style.top = `${top}px`;
    wrapper.style.left = `${left}px`;
    wrapper.style.zIndex = 999;

    const rect = L.DomUtil.create("div", "rectangle-prev");
    rect.style.width = pixelWidth + "px";
    rect.style.height = pixelHeight + "px";

    const button = L.DomUtil.create("button", "rectangle-button");
    button.innerHTML = "Print";

    L.DomEvent.on(button, "click", () => {
      const { lat, lng } = map.getCenter();

      const tranformProj = proj4("EPSG:4326", "EPSG:3857", [lng, lat]);
      console.log("xxx mapCenter", tranformProj);

      const zoomLevel = map.getZoom();
      console.log("xxx zoomLevel", zoomLevel);

      const scale = map.options.crs.scale(zoomLevel);

      // const scale1 = map.getZoomScale(zoomLevel);
      const scale2 = map.getScaleZoom(zoomLevel);
      console.log("xxx scale", scale);
      // const testScale = getScaleInKm(zoomLevel);
      const testScale = getScaleInKmExperiment(zoomLevel);

      console.log("xxx test scale", testScale);
      printCb(tranformProj, testScale);
    });

    const closeButtonContainer = L.DomUtil.create(
      "div",
      "rectangle-close",
      wrapper
    );

    wrapper.appendChild(rect);
    wrapper.appendChild(button);

    mapContainer.appendChild(wrapper);

    const root = createRoot(closeButtonContainer);
    root.render(
      <FontAwesomeIcon
        icon={faXmark}
        className="text-2xl cursor-pointer"
        onClick={() => printOffCb()}
      />
    );

    // root.render(<AddTestFunc />);
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
  }, [map, mode, orientation]);
};
