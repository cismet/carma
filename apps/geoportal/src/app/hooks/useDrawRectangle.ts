import { useContext, useEffect } from "react";
import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";
import { useSelector } from "react-redux";
import { getOrientation } from "../store/slices/print";
import { getUIMode } from "../store/slices/ui";

export const useDrawRectangle = () => {
  const { routedMapRef } = useContext<typeof TopicMapContext>(TopicMapContext);
  const map = routedMapRef?.leafletMap?.leafletElement;
  const mode = useSelector(getUIMode);
  const orientation = useSelector(getOrientation);

  const removeRectangle = (map) => {
    map.eachLayer((layer) => {
      if (layer instanceof L.Rectangle) {
        map.removeLayer(layer);
      }
    });
  };

  const removePrintButton = () => {
    const printBtn = document.querySelector(".rectangle-button");
    console.log("xxx printBtn", printBtn);

    if (printBtn) {
      console.log("xxx printBtn", printBtn);
      printBtn.remove();
    }
  };

  const addRectangle = (map) => {
    removeRectangle(map);
    removePrintButton();
    const pixelWidth = orientation === "landscape" ? 495 : 350;
    const pixelHeight = orientation === "landscape" ? 350 : 495;

    const mapCenter = map.getCenter();
    const centerPoint = map.latLngToLayerPoint(mapCenter);
    const topLeftPoint = L.point(
      centerPoint.x - pixelWidth / 2,
      centerPoint.y - pixelHeight / 2
    );
    const bottomRightPoint = L.point(
      centerPoint.x + pixelWidth / 2,
      centerPoint.y + pixelHeight / 2
    );
    const topLeftLatLng = map.layerPointToLatLng(topLeftPoint);
    const bottomRightLatLng = map.layerPointToLatLng(bottomRightPoint);
    const rectangleBounds = [topLeftLatLng, bottomRightLatLng];
    L.rectangle(rectangleBounds, {
      color: "black",
      weight: 1,
      className: "print-rectangle",
    }).addTo(map);

    addButtonAboveRectangle(map);
  };

  const addButtonAboveRectangle = (map) => {
    const rec = document.querySelector(".print-rectangle");
    if (!rec) return;

    const recCoords = rec.getBoundingClientRect();

    if (document.querySelector(".rectangle-button")) return;

    const button = L.DomUtil.create("button", "rectangle-button");
    button.innerHTML = "Print";
    button.style.position = "absolute";
    button.style.padding = "5px 10px";
    button.style.backgroundColor = "#fff";
    button.style.color = "black";
    button.style.border = "1px solid gray";
    button.style.borderRadius = "4px";
    button.style.cursor = "pointer";
    button.style.zIndex = 1000;

    const mapContainer = map.getContainer();
    const mapRect = mapContainer.getBoundingClientRect();

    button.style.top = recCoords.top - mapRect.top - 40 + "px";
    button.style.left =
      recCoords.left - mapRect.left + recCoords.width / 2 - 30 + "px";

    L.DomEvent.on(button, "click", () => {
      alert("Button clicked!");
    });

    map.getContainer().appendChild(button);
  };

  useEffect(() => {
    if (map && mode === "print") {
      addRectangle(map);

      const handleZoom = () => addRectangle(map);
      const handleMove = () => addRectangle(map);

      map.on("zoom", handleZoom);
      map.on("move", handleMove);

      return () => {
        map.off("zoom", handleZoom);
        map.off("move", handleMove);

        removeRectangle(map);
      };
    }

    if (map && mode !== "print") {
      removeRectangle(map);
    }
  }, [map, mode, orientation]);
};
