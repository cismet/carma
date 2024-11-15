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

  const addRectangle = (map) => {
    removeRectangle(map);

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
    }).addTo(map);
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
