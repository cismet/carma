import { useContext, useEffect } from "react";
import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";

export const useDrawRectangle = () => {
  const { routedMapRef } = useContext<typeof TopicMapContext>(TopicMapContext);
  const map = routedMapRef?.leafletMap?.leafletElement;

  const removeRectangle = (map) => {
    map.eachLayer((layer) => {
      if (layer instanceof L.Rectangle) {
        map.removeLayer(layer);
      }
    });
  };

  const addRectangle = (map) => {
    removeRectangle(map);

    const pixelWidth = 350;
    const pixelHeight = 495;

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
      map.on("zoom", () => {
        addRectangle(map);
      });
      map.on("move", () => {
        addRectangle(map);
      });
    }
  }, [map]);
};
