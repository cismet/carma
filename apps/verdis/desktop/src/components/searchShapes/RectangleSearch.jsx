import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet-draw";
import "leaflet/dist/leaflet.css";
import "leaflet-draw/dist/leaflet.draw.css";
import { useDispatch, useSelector } from "react-redux";
import {
  getShapeMode,
  storeIfShapeModeAvailable,
  storeShapeMode,
} from "../../store/slices/searchMode";
import { searchWithRectangle } from "../../store/slices/search";
import { convertLatLngToXY } from "../../tools/mappingTools";
window.type = true;
const RectangleSearch = ({ map }) => {
  const dispatch = useDispatch();
  const drawControlRef = useRef(null);
  const [ifMouseEnter, setIfMouseEnter] = useState(false);
  const editableLayersRef = useRef(new L.FeatureGroup());
  const mode = useSelector(getShapeMode);
  const zoomLevel = map?.getZoom();

  const disableDrawing = () => {
    if (drawControlRef.current) {
      drawControlRef.current.disable();
      drawControlRef.current = null;
    }
  };
  useEffect(() => {
    if (map) {
      map.addLayer(editableLayersRef.current);

      const routedMapElement = document.getElementById("routedMap");

      const handleMouseEnter = (event) => {
        setIfMouseEnter(true);
      };

      const handleMouseLeave = (event) => {
        setIfMouseEnter(false);
      };

      routedMapElement.addEventListener("mouseenter", handleMouseEnter);
      routedMapElement.addEventListener("mouseleave", handleMouseLeave);

      return () => {
        routedMapElement.removeEventListener("mouseenter", handleMouseEnter);
        routedMapElement.removeEventListener("mouseleave", handleMouseLeave);
      };
    }
  }, [map]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape" && mode === "rectangle") {
        dispatch(storeShapeMode("default"));
      }
    };
    if (map && mode !== "point" && zoomLevel) {
      if (
        mode === "rectangle" &&
        mode !== "point" &&
        zoomLevel >= 17 &&
        !drawControlRef.current &&
        ifMouseEnter
      ) {
        L.drawLocal.draw.handlers.rectangle.tooltip.start =
          "<div>Klicken und ziehen, um ein Rechteck zu zeichnen.</div>" +
          "<div>Es legt die Grenzen für die Suche fest.</div>";

        L.drawLocal.draw.handlers.simpleshape.tooltip.end =
          "<div>Maustaste loslassen zum Starten der Suche.</div>";
        startDrawRect();
      }
      if (zoomLevel < 17) {
        dispatch(storeIfShapeModeAvailable(false));
        dispatch(storeShapeMode("default"));
        disableDrawing();
      } else {
        dispatch(storeIfShapeModeAvailable(true));
      }
    } else {
      disableDrawing();
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [map, mode, zoomLevel, ifMouseEnter]);

  const startDrawRect = () => {
    if (map) {
      if (drawControlRef.current) {
        drawControlRef.current.disable();
      }

      drawControlRef.current = new L.Draw.Rectangle(map, {
        shapeOptions: {
          color: "blue",
          weight: 4,
        },
        showArea: false,
      });

      drawControlRef.current.enable();

      map.once("draw:created", (e) => {
        const layer = e.layer;
        editableLayersRef.current.addLayer(layer);
        drawControlRef.current.disable();

        const bounds = layer.getBounds();
        const southWest = convertLatLngToXY(bounds.getSouthWest());
        const northEast = convertLatLngToXY(bounds.getNorthEast());
        const northWest = convertLatLngToXY(bounds.getNorthWest());
        const southEast = convertLatLngToXY(bounds.getSouthEast());

        const convertedBox = [
          [southWest, northEast, northWest, southEast, southWest],
        ];
        const searchParams = {
          search_geom: {
            type: "Polygon",
            crs: { type: "name", properties: { name: "EPSG:25832" } },
            coordinates: convertedBox,
          },
        };

        dispatch(searchWithRectangle(searchParams));

        setTimeout(() => {
          editableLayersRef.current.removeLayer(layer);
          dispatch(storeShapeMode("default"));
          drawControlRef.current = null;
        }, 2000);
      });
    }
  };

  return null;
};

export default RectangleSearch;
