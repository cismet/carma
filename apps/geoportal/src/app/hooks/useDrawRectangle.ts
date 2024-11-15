import { useContext, useEffect } from "react";
import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";
import { useSelector } from "react-redux";

export const useDrawRectangle = () => {
  const { routedMapRef } = useContext<typeof TopicMapContext>(TopicMapContext);
  const map = routedMapRef?.leafletMap?.leafletElement;
  const orientation = useSelector();

  const removeRectangle = (map) => {
    map.eachLayer((layer) => {
      if (layer instanceof L.Rectangle) {
        map.removeLayer(layer);
      }
    });
  };

  const addRectangle = (map) => {
    removeRectangle(map);

    // const pixelWidth = 350;
    // const pixelHeight = 495;

    const pixelWidth = 495;
    const pixelHeight = 350;

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
    if (map) {
      addRectangle(map);

      const handleZoom = () => addRectangle(map);
      const handleMove = () => addRectangle(map);

      map.on("zoom", handleZoom);
      map.on("move", handleMove);

      return () => {
        console.log("xxx print unmounted, cleaning up...");

        map.off("zoom", handleZoom);
        map.off("move", handleMove);

        removeRectangle(map);
      };
    }
  }, [map]);
};
