import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const PointSearch = ({ map }) => {
  const circleRef = useRef(null);

  useEffect(() => {
    if (map) {
      map.on("click", drawCircle);
    }

    return () => {
      if (map) {
        map.off("click", drawCircle);
      }
    };
  }, [map]);

  const drawCircle = (e) => {
    const center = e.latlng;

    const baseRadius = 12;

    const circle = L.circleMarker(center, {
      radius: baseRadius,
      color: "green",
      fillColor: "green",
      fillOpacity: 0.1,
    }).addTo(map);

    setTimeout(() => {
      if (circleRef) {
        map.removeLayer(circle);
      }
    }, 1500);
  };

  return null;
};

export default PointSearch;
