import React, { useContext, useEffect, useState } from "react";
import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";

const CustomScaleControl = () => {
  const [scaleLabel, setScaleLabel] = useState<string>("");
  const { routedMapRef } = useContext<typeof TopicMapContext>(TopicMapContext);

  useEffect(() => {
    if (routedMapRef?.leafletMap?.leafletElement) {
      const map = routedMapRef.leafletMap.leafletElement;
      //   const scaleControl = L.control.scale().addTo(map);
      const scaleControl = new L.Control.Scale();

      const updateLabel = () => {
        const pointLeft = map.containerPointToLatLng([0, map.getSize().y / 2]);
        const pointRight = map.containerPointToLatLng([
          scaleControl.options.maxWidth,
          map.getSize().y / 2,
        ]);
        const metres = scaleControl._getRoundNum(
          pointLeft.distanceTo(pointRight)
        );
        const newLabel = metres < 1000 ? `${metres} m` : `${metres / 1000} km`;
        setScaleLabel(newLabel);
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

  useEffect(() => {
    console.log("xxx scale", scaleLabel);
  }, [scaleLabel]);
  return <div className="text-white">{scaleLabel}</div>;
};

export default CustomScaleControl;
