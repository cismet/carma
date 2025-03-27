import { useContext, useEffect, useState } from "react";
import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";
import * as L from "leaflet";
interface ExtendedScale extends L.Control.Scale {
  _getRoundNum(num: number): number;
}

const CustomScaleControl = ({ marginBottom = 1 }) => {
  const [scaleLabel, setScaleLabel] = useState<string>("");
  const [scaleWidth, setScaleWidth] = useState(0);

  const { routedMapRef } = useContext<typeof TopicMapContext>(TopicMapContext);
  useEffect(() => {
    const map = routedMapRef?.leafletMap?.leafletElement;
    if (!map) return;
    const scaleControl = new L.Control.Scale() as ExtendedScale;
    const maxWidth = scaleControl.options.maxWidth ?? 100;

    const updateLabel = () => {
      const centerY = map.getSize().y / 2;
      const pointLeft = map.containerPointToLatLng([0, centerY]);
      const pointRight = map.containerPointToLatLng([maxWidth, centerY]);
      const rawDistance = pointLeft.distanceTo(pointRight);
      const metres = scaleControl._getRoundNum(rawDistance);
      const kmValue = metres / 1000;
      const newLabel =
        metres < 1000 ? `${metres} m` : `${parseFloat(kmValue.toFixed(1))} km`;

      const width = maxWidth * (metres / rawDistance);

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
  }, [routedMapRef]);
  return (
    <div
      style={{
        width: scaleWidth,
        backgroundColor: "rgba(255, 255, 255, 0.7)",
        marginBottom,
      }}
      className={`border-t-0 border-2 border-gray-500 px-1 text-xs w-24 leading-[1.4]`}
    >
      {scaleLabel}
    </div>
  );
};

export default CustomScaleControl;
