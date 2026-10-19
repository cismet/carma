import { useEffect } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { searchWithPoints } from "../utils/apiMethods";
import { convertLatLngToXY } from "../utils/mappingTools";

interface PointSearchProps {
  setMode: (mode: string) => void;
  mode: string;
  map: L.Map;
  jwt: string;
}

export const PointSearch = ({ map, jwt, mode, setMode }: PointSearchProps) => {
  // const mode = useSelector(getShapeMode);

  useEffect(() => {
    if (map && mode === "point") {
      const mapId = document.getElementById("routedMap");
      if (mapId) {
        mapId.style.cursor = "crosshair";
      }
      map.on("click", drawCircle);
    } else {
      const mapId = document.getElementById("routedMap");
      if (mapId) {
        mapId.style.cursor = "grab";
      }
    }

    return () => {
      if (map) {
        map.off("click", drawCircle);
      }
    };
  }, [map, mode]);

  const drawCircle = (e) => {
    const center = e.latlng;
    const radius = 10;
    const circle = L.circleMarker(center, {
      radius,
      color: "green",
      fillColor: "green",
      fillOpacity: 0.1,
    }).addTo(map);

    const convertedCenter = convertLatLngToXY(center);
    searchWithPoints({ x: convertedCenter[0], y: convertedCenter[1] }, jwt);

    setTimeout(() => {
      map.removeLayer(circle);
      setMode("default");
    }, 1500);
  };

  return null;
};
