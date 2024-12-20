import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { getShapeMode } from "../../store/slices/searchMode";
import { convertLatLngToXY } from "../../tools/mappingTools";

const PointSearch = ({ map }) => {
  const circleRef = useRef(null);
  const mode = useSelector(getShapeMode);

  useEffect(() => {
    if (map && mode === "point") {
      map.on("click", drawCircle);
    }

    return () => {
      if (map) {
        map.off("click", drawCircle);
      }
    };
  }, [map, mode]);

  const drawCircle = (e) => {
    const center = e.latlng;

    const baseRadius = 12;

    const circle = L.circleMarker(center, {
      radius: baseRadius,
      color: "green",
      fillColor: "green",
      fillOpacity: 0.1,
    }).addTo(map);

    const convertedCenter = convertLatLngToXY(center);

    setTimeout(() => {
      if (circleRef) {
        map.removeLayer(circle);
      }
    }, 1500);
  };

  return null;
};

export default PointSearch;
