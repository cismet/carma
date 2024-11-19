import { useContext, useEffect, useState } from "react";
import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";
import { useSelector } from "react-redux";
import { getOrientation } from "../store/slices/print";
import { getUIMode } from "../store/slices/ui";

export const useDrawRectangle = (printCb) => {
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
      printCb();
    });

    wrapper.appendChild(rect);
    wrapper.appendChild(button);

    mapContainer.appendChild(wrapper);
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
