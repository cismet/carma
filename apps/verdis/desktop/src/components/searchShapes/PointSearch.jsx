import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { getShapeMode, storeShapeMode } from "../../store/slices/searchMode";
import { convertLatLngToXY } from "../../tools/mappingTools";
import { useSelector, useDispatch } from "react-redux";
import { searchWithPoints } from "../../store/slices/search";

const PointSearch = ({ map }) => {
  const dispatch = useDispatch();
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

    const baseRadius = 10;

    const circle = L.circleMarker(center, {
      radius: baseRadius,
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
