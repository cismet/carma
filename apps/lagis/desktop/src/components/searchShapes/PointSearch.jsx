import { useEffect } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { convertLatLngToXY } from "../../tools/mappingTools";
import { useSelector, useDispatch } from "react-redux";
import { searchWithPoints, storeShapeMode } from "../../store/slices/search";
import { getShapeMode } from "../../store/slices/searchMode";

const PointSearch = ({ map }) => {
  const dispatch = useDispatch();
  const mode = useSelector(getShapeMode);

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
    dispatch(
      searchWithPoints({ x: convertedCenter[0], y: convertedCenter[1] })
    );

    setTimeout(() => {
      map.removeLayer(circle);
      dispatch(storeShapeMode("default"));
    }, 1500);
  };

  return null;
};

export default PointSearch;
