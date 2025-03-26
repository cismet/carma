import React, { useContext, useEffect, useState } from "react";
import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";

const CustomScaleControl = () => {
  const [scaleLabel, setScaleLabel] = useState<string>("");
  const { routedMapRef } = useContext<typeof TopicMapContext>(TopicMapContext);
  const [scaleWidth, setScaleWidth] = useState(0);

  useEffect(() => {
    if (routedMapRef) {
      const map = routedMapRef.leafletMap.leafletElement;

      const scaleControl = new L.Control.Scale();

      const updateLabel = () => {
        const centerY = map.getSize().y / 2;
        const pointLeft = map.containerPointToLatLng([0, centerY]);
        const pointRight = map.containerPointToLatLng([
          scaleControl.options.maxWidth,
          centerY,
        ]);
        const rawDistance = pointLeft.distanceTo(pointRight);
        const metres = scaleControl._getRoundNum(rawDistance);
        const kmValue = metres / 1000;
        const newLabel =
          metres < 1000
            ? `${metres} m`
            : `${parseFloat(kmValue.toFixed(1))} km`;

        const width = scaleControl.options.maxWidth * (metres / rawDistance);

        setScaleLabel(newLabel);
        setScaleWidth(width);
      };

      map.on("moveend", updateLabel);
      map.on("zoomend", updateLabel);

      updateLabel();

      return () => {
        map.off("moveend", updateLabel);
        map.off("zoomend", updateLabel);
      };
    }
  }, [routedMapRef]);
  return (
    <div
      style={{ width: scaleWidth }}
      className="bg-white bg-opacity-60 border-2 border-gray-600 px-2 py-0.5 text-xs w-24 mb-[136px]"
    >
      {scaleLabel}
    </div>
  );
};

export default CustomScaleControl;
