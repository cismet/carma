import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet-draw";
import "leaflet/dist/leaflet.css";
import "leaflet-draw/dist/leaflet.draw.css";
import { useDispatch, useSelector } from "react-redux";
import {
  getShapeMode,
  storeKassenzeichenliste,
  storeShapeMode,
} from "../../store/slices/searchMode";
import {
  searchWithRectangle,
  setIsLoading,
  setIsLoadingKassenzeichenWithPoint,
} from "../../store/slices/search";
import { setGraphqlStatus } from "../../store/slices/mapping";
import { convertLatLngToXY } from "../../tools/mappingTools";
window.type = true;
const RectangleSearch = ({ map }) => {
  const dispatch = useDispatch();
  const drawControlRef = useRef(null);
  const editableLayersRef = useRef(new L.FeatureGroup());
  const mode = useSelector(getShapeMode);
  useEffect(() => {
    if (map) {
      map.addLayer(editableLayersRef.current);
    }
  }, [map]);

  useEffect(() => {
    if (mode === "rectangle") {
      L.drawLocal.draw.handlers.rectangle.tooltip.start =
        "<div>Klicken und ziehen, um ein Rechteck zu zeichnen.</div>" +
        "<div>Es legt die Grenzen für die Suche fest.</div>";

      L.drawLocal.draw.handlers.simpleshape.tooltip.end =
        "<div>Maustaste loslassen zum Starten der Suche.</div>";

      startDrawRect();
    }
  }, [map, mode]);

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
        }, 3000);
      });
    }
  };

  return null;
};

export default RectangleSearch;
